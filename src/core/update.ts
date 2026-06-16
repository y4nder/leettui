// Self-update: download the latest release binary for this platform and swap it
// in over the running executable. Mirrors the platform/asset logic in
// install.sh — keep the two in sync if the release matrix changes.
import { chmod, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import { IS_RELEASE, VERSION } from "./version";

const REPO = "y4nder/leettui";

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

/**
 * Returns the newer release tag to advertise in the in-app banner, or null when
 * there's nothing to show / the check doesn't apply. Fail-silent: any network or
 * parse error resolves to null. Only official release builds check (mirrors
 * runUpdate's IS_RELEASE gate); LEETTUI_FAKE_UPDATE forces a tag for dev preview.
 */
export async function checkForUpdate(): Promise<string | null> {
  const fake = process.env.LEETTUI_FAKE_UPDATE;
  if (fake) return fake;
  if (!IS_RELEASE) return null;
  try {
    const tag = await fetchLatestTag();
    return isNewerVersion(tag, VERSION) ? tag : null;
  } catch {
    return null;
  }
}

/** Fetch the latest published release tag from the GitHub API. */
async function fetchLatestTag(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      "User-Agent": "leettui",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { tag_name?: string };
  if (!body.tag_name) {
    throw new Error("latest release has no tag_name");
  }
  return body.tag_name;
}

export async function runUpdate(opts: { force?: boolean } = {}): Promise<void> {
  // Only official release binaries self-update. A from-source build (or
  // `bun src/index.tsx update`, where process.execPath is bun, not leettui) is
  // typically ahead of the latest release — replacing it with a published
  // binary would be a downgrade, so refuse.
  if (!IS_RELEASE) {
    console.log(
      `This is not an official release build (version ${VERSION}) — nothing to self-update.\n` +
        "Update from source with `git pull`, or install a release with:\n" +
        `  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh`,
    );
    return;
  }

  const resolved = resolveAsset();
  if ("error" in resolved) {
    console.error(`error: ${resolved.error}`);
    return;
  }
  const { asset } = resolved;

  let tag: string;
  try {
    tag = await fetchLatestTag();
  } catch (err) {
    console.error(`error: could not check for updates — ${(err as Error).message}`);
    return;
  }

  if (tag === VERSION && !opts.force) {
    console.log(`Already on the latest version (${VERSION}).`);
    return;
  }

  const target = process.execPath;
  const tmp = join(dirname(target), ".leettui.update.tmp");
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  console.log(`Downloading ${asset} (${tag})...`);
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`download failed (${res.status}) from ${url}`);
    }
    // Stream to a temp file in the target's directory so the final rename is
    // atomic on the same filesystem.
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(tmp);
      out.on("error", reject);
      out.on("finish", resolve);
      Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).pipe(out);
    });

    await chmod(tmp, 0o755);
    // Renaming over the running binary's inode is safe on Linux/macOS — the
    // running process keeps the old inode; the next launch uses the new one.
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    console.error(`error: ${(err as Error).message}`);
    return;
  }

  console.log(`Updated leettui ${VERSION} -> ${tag}. Restart to use it.`);
}
