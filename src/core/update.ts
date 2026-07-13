// Self-update: download the latest release binary for this platform and swap it
// in over the running executable. Mirrors the platform/asset logic in
// install.sh — keep the two in sync if the release matrix changes.
import { chmod, rename, rm } from "node:fs/promises";
import { createWriteStream, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import { IS_RELEASE, VERSION } from "@/core/version";
import { brandBanner, startProgress, updateError, updateSuccess } from "@/core/updatePresent";

const REPO = "y4nder/leettui";

// The latest newer-release tag discovered this session (set by BootFlow's
// non-blocking `checkForUpdate`), or null. Tracked separately from the in-app
// banner's store state so dismissing the banner doesn't suppress the on-quit
// reminder — the exit hook in `index.tsx` reads this.
let pendingUpdate: string | null = null;

/** Record (or clear) the newer-release tag to remind the user about on quit. */
export function setPendingUpdate(tag: string | null): void {
  pendingUpdate = tag;
}

/** The newer-release tag to remind the user about on quit, or null. */
export function getPendingUpdate(): string | null {
  return pendingUpdate;
}

// The tag the background auto-update already downloaded and atomically swapped
// over the binary this session, or null. Like `pendingUpdate`, tracked apart
// from the banner's store state so dismissing the "restart to apply" banner
// doesn't suppress the on-quit installed notice — the fourth "told the user"
// state (see the exit hook in `index.tsx`). Also read by the scheduler so a
// 4h re-check never re-downloads a tag that's already installed.
let installedUpdate: string | null = null;

/** Record (or clear) the tag already installed in the background this session. */
export function setInstalledUpdate(tag: string | null): void {
  installedUpdate = tag;
}

/** The tag already installed in the background this session, or null. */
export function getInstalledUpdate(): string | null {
  return installedUpdate;
}

// Only the combinations the release workflow actually builds (see
// .github/workflows/release.yml and install.sh). Intel Macs and other arches
// have no prebuilt binary.
const SUPPORTED_ASSETS = new Set(["leettui-linux-x64", "leettui-macos-arm64"]);

/** Map process.platform/arch to the release asset name, or null if unsupported. */
function resolveAsset(): { asset: string } | { error: string } {
  let os: string;
  switch (process.platform) {
    case "linux":
      os = "linux";
      break;
    case "darwin":
      os = "macos";
      break;
    default:
      return {
        error: `No self-update for '${process.platform}'. Download the latest binary from https://github.com/${REPO}/releases`,
      };
  }

  let arch: string;
  switch (process.arch) {
    case "x64":
      arch = "x64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    default:
      return { error: `Unsupported architecture '${process.arch}'.` };
  }

  const asset = `leettui-${os}-${arch}`;
  if (!SUPPORTED_ASSETS.has(asset)) {
    return {
      error: `No prebuilt binary for ${os}/${arch}; build from source with 'bun run build'.`,
    };
  }
  return { asset };
}

/**
 * The release asset name when this platform can self-update, else null (win32,
 * unsupported arch). The silent background path needs the yes/no + asset without
 * the error prose, so this wraps the private resolveAsset for it.
 */
export function selfUpdateSupported(): string | null {
  const resolved = resolveAsset();
  return "error" in resolved ? null : resolved.asset;
}

/**
 * Pure decision: should the background auto-update download+install `tag`?
 * False when the `[update] auto` knob is off, on a dev/from-source build
 * (mirrors runUpdate's IS_RELEASE gate — LEETTUI_FAKE_UPDATE stays banner-only),
 * on a platform with no self-update, or when an equal-or-newer tag was already
 * installed this session — that last rule is what stops the 4h loop from
 * re-downloading the same release every tick.
 */
export function shouldAutoDownload(opts: {
  auto: boolean;
  isRelease: boolean;
  assetSupported: boolean;
  tag: string;
  installedTag: string | null;
}): boolean {
  if (!opts.auto || !opts.isRelease || !opts.assetSupported) return false;
  if (opts.installedTag && !isNewerVersion(opts.tag, opts.installedTag)) return false;
  return true;
}

/**
 * True when `latest` is a strictly newer semver tag than `current`. Tolerates a
 * leading `v` and ignores any `-suffix` (prerelease/build metadata). Returns
 * false on any unparseable input, so a garbled tag never raises a false banner.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (s: string): [number, number, number] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(s.trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  const [aMajor, aMinor, aPatch] = a;
  const [bMajor, bMinor, bPatch] = b;
  if (aMajor !== bMajor) return aMajor > bMajor;
  if (aMinor !== bMinor) return aMinor > bMinor;
  return aPatch > bPatch;
}

/** A published release's tag, its (markdown) notes body, and when it shipped. */
export interface ReleaseInfo {
  tag: string;
  body: string;
  /** ISO 8601 `published_at` from the GitHub API, absent when the API omits it. */
  publishedAt?: string;
}

/**
 * The changelog popup's payload: the recent releases newest-first plus which
 * tag to emphasize — the installed VERSION at boot (post-update), the latest
 * tag via the command palette. Lives here (not in the UI) so both openers and
 * the store share one shape without core importing UI.
 */
export interface ChangelogPayload {
  releases: ReleaseInfo[];
  highlightTag: string;
}

/** "YYYY-MM-DD" from an ISO `published_at`, or "" when absent/malformed. */
export function formatReleaseDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  return iso.slice(0, 10);
}

/**
 * The newer release tag to advertise in the in-app update banner, or null when
 * there's nothing newer / the check doesn't apply. Fail-silent: any network or
 * parse error resolves to null. Only official release builds check (mirrors
 * runUpdate's IS_RELEASE gate); LEETTUI_FAKE_UPDATE forces a tag for dev preview.
 * This drives only the "update available" banner — the changelog popup is a
 * separate, post-update concern (see fetchReleaseByTag / shouldShowChangelog).
 */
export async function checkForUpdate(): Promise<string | null> {
  const fake = process.env.LEETTUI_FAKE_UPDATE;
  if (fake) return fake;
  if (!IS_RELEASE) return null;
  try {
    const { tag } = await fetchLatestRelease();
    return isNewerVersion(tag, VERSION) ? tag : null;
  } catch {
    return null;
  }
}

/**
 * Whether to auto-open the "What's new" popup at boot (Stage 18, **post-update**
 * semantics): show the *running* version's notes once, the first launch after an
 * update. True only when a previous version was already recorded (so a **fresh
 * install** doesn't pop — `lastShownVersion === undefined` is the seed case the
 * caller handles), the running version differs from it, and we're in a calm
 * browse view (never yank the user out of a problem/modal). Pure so the
 * once-per-version semantics are unit-tested apart from BootFlow's promise wiring
 * + IS_RELEASE gate. `mode` is the UI mode string (typed loosely to keep core
 * free of UI imports).
 */
export function shouldShowChangelog(
  currentVersion: string,
  lastShownVersion: string | undefined,
  mode: string,
): boolean {
  if (lastShownVersion === undefined) return false; // fresh install → seed, don't pop
  if (currentVersion === lastShownVersion) return false; // already shown this version
  return mode === "browse";
}

const RELEASE_API_HEADERS = {
  "User-Agent": "leettui",
  Accept: "application/vnd.github+json",
};

// The subset of the GitHub release JSON the changelog cares about.
interface ReleaseJson {
  tag_name?: string;
  body?: string;
  published_at?: string;
  prerelease?: boolean;
}

/** Map one release JSON entry to a ReleaseInfo, or null when it has no tag_name. */
function parseRelease(json: ReleaseJson): ReleaseInfo | null {
  if (!json.tag_name) return null;
  return { tag: json.tag_name, body: json.body ?? "", publishedAt: json.published_at };
}

/** Shared release fetch from the GitHub API. `pathSuffix` is e.g. "latest" or "tags/v1.2.3". */
async function fetchRelease(pathSuffix: string): Promise<ReleaseInfo> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/${pathSuffix}`, {
    headers: RELEASE_API_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  }
  const release = parseRelease((await res.json()) as ReleaseJson);
  if (!release) {
    throw new Error("release has no tag_name");
  }
  return release;
}

/** Fetch the latest published release (tag + notes body). Throws on network/shape error. */
export function fetchLatestRelease(): Promise<ReleaseInfo> {
  return fetchRelease("latest");
}

/** Fetch a specific release by tag — the post-update popup fetches the running VERSION. */
export function fetchReleaseByTag(tag: string): Promise<ReleaseInfo> {
  return fetchRelease(`tags/${encodeURIComponent(tag)}`);
}

/**
 * Fetch the most recent published releases, newest-first, in one API call
 * (`/releases?per_page=N`). Backs the multi-release changelog popup. Skips
 * prereleases and malformed entries (the unauthenticated list endpoint includes
 * prereleases, never drafts); throws on network/shape error or an empty result,
 * mirroring fetchRelease's strictness — callers already have error paths.
 */
export async function fetchReleases(limit = 10): Promise<ReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`, {
    headers: RELEASE_API_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as ReleaseJson[];
  if (!Array.isArray(json)) {
    throw new Error("release list is not an array");
  }
  const releases = json
    .filter((r) => !r.prerelease)
    .map(parseRelease)
    .filter((r): r is ReleaseInfo => r !== null);
  if (releases.length === 0) {
    throw new Error("no published releases");
  }
  return releases;
}

/** The GitHub release-page URL for a tag — the changelog popup's "open on GitHub" (`o`). */
export function releaseUrl(tag: string): string {
  return `https://github.com/${REPO}/releases/tag/${tag}`;
}

/**
 * The gzip-compressed (`.gz`) and raw download URLs for a release asset (Stage
 * 19). Pure so the `.gz`-preferred / raw-fallback resolution is unit-testable.
 */
export function assetUrls(tag: string, asset: string): { gz: string; raw: string } {
  const raw = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;
  return { gz: `${raw}.gz`, raw };
}

/**
 * Fetch a release asset, **preferring the gzip sibling** (Stage 19 — ~half the
 * download bytes) and falling back to the raw binary when the `.gz` is absent
 * (any non-ok response — e.g. a 404 on a tag published before Stage 19). Returns
 * the live response plus whether the body still needs gunzip-ing. Throws when
 * the raw fallback also fails. GitHub serves `.gz` assets as opaque blobs (no
 * `Content-Encoding: gzip`), so `fetch` won't transparently decompress: the
 * `content-length` is the compressed size and the body is real gzip bytes.
 */
export async function fetchAsset(
  tag: string,
  asset: string,
): Promise<{ res: Response; compressed: boolean; url: string }> {
  const { gz, raw } = assetUrls(tag, asset);
  const gzRes = await fetch(gz);
  if (gzRes.ok && gzRes.body) {
    return { res: gzRes, compressed: true, url: gz };
  }
  const rawRes = await fetch(raw);
  if (!rawRes.ok || !rawRes.body) {
    throw new Error(`download failed (${rawRes.status}) from ${raw}`);
  }
  return { res: rawRes, compressed: false, url: raw };
}

// Temp files are pid-suffixed (`.leettui.update.<pid>.tmp`) so a background
// install and a concurrent manual `leettui update` in another terminal never
// interleave writes into one file and rename corrupt bytes over the binary.
// The legacy un-suffixed `.leettui.update.tmp` arm exists so the sweep can
// clean orphans left by pre-auto-update builds.
const UPDATE_TMP_RE = /^\.leettui\.update(?:\.(\d+))?\.tmp$/;

/**
 * Parse an update temp filename: `{ pid }` for a pid-suffixed name,
 * `{ pid: null }` for the legacy un-suffixed name, null for anything else.
 * Pure so the sweep's "is this ours to delete?" matching is unit-tested.
 */
export function parseUpdateTmpPid(filename: string): { pid: number | null } | null {
  const m = UPDATE_TMP_RE.exec(filename);
  if (!m) return null;
  return { pid: m[1] ? Number(m[1]) : null };
}

// True when `pid` is a live process. EPERM means "exists but not ours" — alive.
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Remove orphaned update temp files next to the binary — left behind when a
 * process died mid-download (crash/SIGKILL, where the exit-hook cleanup never
 * ran). A temp file whose pid is still a live process belongs to a concurrent
 * updater and is never touched; the legacy un-suffixed name has no owner to
 * check and predates pid-suffixing, so it's always stale. Best-effort and
 * fail-silent: a sweep failure must never affect boot or an update.
 */
export function sweepStaleUpdateTmp(): void {
  try {
    const dir = dirname(process.execPath);
    for (const name of readdirSync(dir)) {
      const parsed = parseUpdateTmpPid(name);
      if (!parsed) continue;
      if (parsed.pid !== null && (parsed.pid === process.pid || pidAlive(parsed.pid))) continue;
      rmSync(join(dir, name), { force: true });
    }
  } catch {
    // Fail-silent by contract.
  }
}

// The in-flight download's temp path, so the exit hook can remove it on a
// graceful quit mid-download (the async catch below never runs once the
// process is exiting).
let activeTmpPath: string | null = null;

/** Synchronously remove an in-flight download's temp file. Exit-hook safe. */
export function cleanupActiveTmp(): void {
  if (!activeTmpPath) return;
  try {
    rmSync(activeTmpPath, { force: true });
  } catch {
    // Best-effort — never let cleanup break the exit path.
  }
  activeTmpPath = null;
}

/**
 * Stream a release asset to a temp file next to process.execPath and atomically
 * rename it over the running binary. Silent — never writes to stdout/stderr
 * (the TUI owns the screen on the background path); progress goes through the
 * optional callback (runUpdate feeds its bar). Throws on any failure, after
 * removing the temp file — the rename is the only mutation of the real binary,
 * so an interrupted download can never leave it torn.
 */
export async function downloadAndInstall(
  tag: string,
  asset: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  const target = process.execPath;
  const tmp = join(dirname(target), `.leettui.update.${process.pid}.tmp`);
  activeTmpPath = tmp;
  try {
    // Prefer the gzip sibling (Stage 19), falling back to the raw asset on an
    // older tag without one.
    const { res, compressed } = await fetchAsset(tag, asset);
    // Stream to a temp file in the target's directory so the final rename is
    // atomic on the same filesystem. A `data` listener counts bytes for the
    // progress callback without disturbing `pipe`'s backpressure handling —
    // counting on `src` (pre-gunzip) measures the *compressed* bytes against
    // the compressed `content-length`. A corrupt/truncated gzip stream rejects
    // via the gunzip `error` event, lands in `catch`, and the temp file is
    // removed so the running binary is never clobbered.
    const total = Number(res.headers.get("content-length")) || 0;
    let received = 0;
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(tmp);
      out.on("error", reject);
      out.on("finish", resolve);
      const src = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      src.on("data", (chunk: Buffer) => {
        received += chunk.length;
        onProgress?.(received, total);
      });
      src.on("error", reject);
      if (compressed) {
        const gunzip = createGunzip();
        gunzip.on("error", reject);
        src.pipe(gunzip).pipe(out);
      } else {
        src.pipe(out);
      }
    });

    await chmod(tmp, 0o755);
    // Renaming over the running binary's inode is safe on Linux/macOS — the
    // running process keeps the old inode; the next launch uses the new one.
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  } finally {
    activeTmpPath = null;
  }
}

// Guards overlapping background installs (a slow download outlasting the next
// scheduler tick, or a re-check racing an in-flight one).
let installInFlight = false;

/**
 * The silent background install driver: download+install `tag`, returning
 * whether it succeeded. Never throws and never prints — the TUI owns the
 * screen; callers gate what the user is told through the store/exit-hook flags.
 */
export async function autoInstallUpdate(tag: string): Promise<boolean> {
  if (installInFlight) return false;
  const asset = selfUpdateSupported();
  if (!asset) return false;
  installInFlight = true;
  try {
    await downloadAndInstall(tag, asset);
    return true;
  } catch {
    return false;
  } finally {
    installInFlight = false;
  }
}

export async function runUpdate(opts: { force?: boolean } = {}): Promise<void> {
  process.stdout.write(`${brandBanner()}\n`);
  sweepStaleUpdateTmp();

  // Only official release binaries self-update. A from-source build (or
  // `bun src/index.tsx update`, where process.execPath is bun, not leettui) is
  // typically ahead of the latest release — replacing it with a published
  // binary would be a downgrade, so refuse.
  if (!IS_RELEASE) {
    console.log(
      `  This is not an official release build (version ${VERSION}) — nothing to self-update.\n` +
        "  Update from source with `git pull`, or install a release with:\n" +
        `    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh`,
    );
    return;
  }

  const resolved = resolveAsset();
  if ("error" in resolved) {
    console.error(updateError(resolved.error));
    return;
  }
  const { asset } = resolved;

  let tag: string;
  try {
    ({ tag } = await fetchLatestRelease());
  } catch (err) {
    console.error(updateError(`could not check for updates — ${(err as Error).message}`));
    return;
  }

  if (tag === VERSION && !opts.force) {
    console.log(`  Already on the latest version (${VERSION}).`);
    return;
  }

  const progress = startProgress(`Downloading ${asset} (${tag})`);
  try {
    await downloadAndInstall(tag, asset, progress.update);
  } catch (err) {
    progress.done();
    console.error(updateError((err as Error).message));
    return;
  }

  progress.done(updateSuccess(VERSION, tag));
}
