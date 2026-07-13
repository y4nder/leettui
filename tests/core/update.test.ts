import { afterEach, describe, expect, test } from "bun:test";
import {
  assetUrls,
  fetchAsset,
  fetchLatestRelease,
  fetchReleaseByTag,
  fetchReleases,
  formatReleaseDate,
  isNewerVersion,
  parseUpdateTmpPid,
  shouldAutoDownload,
  shouldShowChangelog,
} from "@/core/update";

describe("isNewerVersion", () => {
  test("true when latest is strictly newer", () => {
    expect(isNewerVersion("v0.5.0", "v0.4.0")).toBe(true);
    expect(isNewerVersion("v1.0.0", "v0.9.9")).toBe(true);
    expect(isNewerVersion("v0.4.1", "v0.4.0")).toBe(true);
    expect(isNewerVersion("v0.10.0", "v0.9.0")).toBe(true); // numeric, not lexical
  });

  test("false when equal", () => {
    expect(isNewerVersion("v0.4.0", "v0.4.0")).toBe(false);
  });

  test("false when latest is older", () => {
    expect(isNewerVersion("v0.4.0", "v0.5.0")).toBe(false);
    expect(isNewerVersion("v0.9.0", "v0.10.0")).toBe(false);
  });

  test("tolerates a missing 'v' prefix on either side", () => {
    expect(isNewerVersion("0.5.0", "v0.4.0")).toBe(true);
    expect(isNewerVersion("v0.5.0", "0.4.0")).toBe(true);
  });

  test("ignores a prerelease/build suffix", () => {
    expect(isNewerVersion("v0.5.0-rc1", "v0.4.0")).toBe(true);
    expect(isNewerVersion("v0.4.0-5-gabc123", "v0.4.0")).toBe(false);
  });

  test("false on unparseable input (no false banner)", () => {
    expect(isNewerVersion("dev", "v0.4.0")).toBe(false);
    expect(isNewerVersion("v0.5.0", "dev")).toBe(false);
    expect(isNewerVersion("", "")).toBe(false);
    expect(isNewerVersion("garbage", "nonsense")).toBe(false);
  });
});

describe("release fetch", () => {
  const realFetch = globalThis.fetch;
  let lastUrl = "";
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(status: number, payload: unknown): void {
    lastUrl = "";
    globalThis.fetch = (async (url: string) => {
      lastUrl = String(url);
      return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
        status,
      });
    }) as unknown as typeof fetch;
  }

  test("fetchLatestRelease hits /releases/latest and returns tag + notes + date", async () => {
    stubFetch(200, {
      tag_name: "v9.9.9",
      body: "## What's new\n\nstuff",
      published_at: "2026-07-01T12:00:00Z",
    });
    expect(await fetchLatestRelease()).toEqual({
      tag: "v9.9.9",
      body: "## What's new\n\nstuff",
      publishedAt: "2026-07-01T12:00:00Z",
    });
    expect(lastUrl).toContain("/releases/latest");
  });

  test("fetchReleaseByTag hits /releases/tags/{tag} and parses it", async () => {
    stubFetch(200, { tag_name: "v1.2.3", body: "notes" });
    expect(await fetchReleaseByTag("v1.2.3")).toEqual({
      tag: "v1.2.3",
      body: "notes",
      publishedAt: undefined,
    });
    expect(lastUrl).toContain("/releases/tags/v1.2.3");
  });

  test("defaults body to empty string when the release has no notes", async () => {
    stubFetch(200, { tag_name: "v9.9.9" });
    expect(await fetchLatestRelease()).toMatchObject({ tag: "v9.9.9", body: "" });
  });

  test("throws when the payload has no tag_name", async () => {
    stubFetch(200, { body: "orphaned notes" });
    expect(fetchLatestRelease()).rejects.toThrow("no tag_name");
  });

  test("throws on a non-ok response", async () => {
    stubFetch(404, {});
    expect(fetchLatestRelease()).rejects.toThrow("GitHub API returned 404");
  });

  test("fetchReleases hits /releases?per_page=10 and parses the list newest-first", async () => {
    stubFetch(200, [
      { tag_name: "v0.6.0", body: "new", published_at: "2026-07-01T00:00:00Z" },
      { tag_name: "v0.5.0", body: "old", published_at: "2026-06-01T00:00:00Z" },
    ]);
    expect(await fetchReleases()).toEqual([
      { tag: "v0.6.0", body: "new", publishedAt: "2026-07-01T00:00:00Z" },
      { tag: "v0.5.0", body: "old", publishedAt: "2026-06-01T00:00:00Z" },
    ]);
    expect(lastUrl).toContain("/releases?per_page=10");
  });

  test("fetchReleases passes a custom limit through as per_page", async () => {
    stubFetch(200, [{ tag_name: "v1.0.0" }]);
    expect(await fetchReleases(3)).toEqual([{ tag: "v1.0.0", body: "", publishedAt: undefined }]);
    expect(lastUrl).toContain("/releases?per_page=3");
  });

  test("fetchReleases skips prereleases and entries with no tag_name", async () => {
    stubFetch(200, [
      { tag_name: "v0.7.0-rc1", body: "rc", prerelease: true },
      { body: "orphaned" },
      { tag_name: "v0.6.0", body: "stable" },
    ]);
    const releases = await fetchReleases();
    expect(releases.map((r) => r.tag)).toEqual(["v0.6.0"]);
  });

  test("fetchReleases throws on a non-ok response", async () => {
    stubFetch(500, []);
    expect(fetchReleases()).rejects.toThrow("GitHub API returned 500");
  });

  test("fetchReleases throws on a non-array payload", async () => {
    stubFetch(200, { message: "rate limited" });
    expect(fetchReleases()).rejects.toThrow("not an array");
  });

  test("fetchReleases throws when nothing survives the filter", async () => {
    stubFetch(200, [{ tag_name: "v0.7.0-rc1", prerelease: true }]);
    expect(fetchReleases()).rejects.toThrow("no published releases");
  });
});

describe("formatReleaseDate", () => {
  test("YYYY-MM-DD from an ISO published_at", () => {
    expect(formatReleaseDate("2026-07-01T12:34:56Z")).toBe("2026-07-01");
  });

  test("empty string when absent or malformed", () => {
    expect(formatReleaseDate(undefined)).toBe("");
    expect(formatReleaseDate("")).toBe("");
    expect(formatReleaseDate("not a date")).toBe("");
  });
});

describe("asset download URL resolution (.gz-preferred, raw fallback)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Resolve responses per requested URL so the .gz / raw branch is exercised.
  function stubFetchByUrl(byUrl: Record<string, { status: number; body?: string }>): void {
    globalThis.fetch = (async (url: string) => {
      const entry = byUrl[String(url)] ?? { status: 404 };
      return new Response(entry.status === 404 ? "" : (entry.body ?? ""), {
        status: entry.status,
      });
    }) as unknown as typeof fetch;
  }

  test("assetUrls appends .gz to the raw download URL", () => {
    const { gz, raw } = assetUrls("v1.2.3", "leettui-linux-x64");
    expect(raw).toBe(
      "https://github.com/y4nder/leettui/releases/download/v1.2.3/leettui-linux-x64",
    );
    expect(gz).toBe(`${raw}.gz`);
  });

  test("fetchAsset prefers the .gz sibling when present", async () => {
    const { gz, raw } = assetUrls("v1.2.3", "leettui-linux-x64");
    stubFetchByUrl({ [gz]: { status: 200, body: "gz" }, [raw]: { status: 200, body: "raw" } });
    const r = await fetchAsset("v1.2.3", "leettui-linux-x64");
    expect(r.compressed).toBe(true);
    expect(r.url).toBe(gz);
  });

  test("fetchAsset falls back to the raw asset when the .gz is absent (404)", async () => {
    const { raw } = assetUrls("v0.1.0", "leettui-linux-x64");
    stubFetchByUrl({ [raw]: { status: 200, body: "raw" } }); // gz → 404
    const r = await fetchAsset("v0.1.0", "leettui-linux-x64");
    expect(r.compressed).toBe(false);
    expect(r.url).toBe(raw);
  });

  test("fetchAsset throws when neither the .gz nor the raw asset resolves", async () => {
    stubFetchByUrl({}); // both → 404
    expect(fetchAsset("v0.0.0", "leettui-linux-x64")).rejects.toThrow("download failed");
  });
});

describe("shouldShowChangelog (post-update)", () => {
  test("false on a fresh install — no version recorded yet (seed, don't pop)", () => {
    expect(shouldShowChangelog("v0.5.2", undefined, "browse")).toBe(false);
  });

  test("false when this version's changelog was already shown (once-per-version)", () => {
    expect(shouldShowChangelog("v0.5.2", "v0.5.2", "browse")).toBe(false);
  });

  test("false when not in a calm browse view (never interrupt a problem/modal)", () => {
    expect(shouldShowChangelog("v0.5.2", "v0.5.1", "problem")).toBe(false);
    expect(shouldShowChangelog("v0.5.2", "v0.5.1", "result")).toBe(false);
  });

  test("true on the first launch after an update (new version + browse mode)", () => {
    expect(shouldShowChangelog("v0.5.2", "v0.5.1", "browse")).toBe(true);
  });
});

describe("shouldAutoDownload (background auto-update decision)", () => {
  // All gates open — the baseline each refusal case flips one field of.
  const open = {
    auto: true,
    isRelease: true,
    assetSupported: true,
    tag: "v0.6.0",
    installedTag: null,
  };

  test("true when auto is on, the build is a release, and the platform supports it", () => {
    expect(shouldAutoDownload(open)).toBe(true);
  });

  test("false when the [update] auto knob is off", () => {
    expect(shouldAutoDownload({ ...open, auto: false })).toBe(false);
  });

  test("false on a dev/from-source build (LEETTUI_FAKE_UPDATE stays banner-only)", () => {
    expect(shouldAutoDownload({ ...open, isRelease: false })).toBe(false);
  });

  test("false when the platform has no self-update (win32/unsupported arch)", () => {
    expect(shouldAutoDownload({ ...open, assetSupported: false })).toBe(false);
  });

  test("false when the tag is already installed — no re-download every tick", () => {
    expect(shouldAutoDownload({ ...open, installedTag: "v0.6.0" })).toBe(false);
  });

  test("false when a newer tag is already installed", () => {
    expect(shouldAutoDownload({ ...open, installedTag: "v0.7.0" })).toBe(false);
  });

  test("true when a strictly newer tag arrives after an install", () => {
    expect(shouldAutoDownload({ ...open, tag: "v0.7.0", installedTag: "v0.6.0" })).toBe(true);
  });
});

describe("parseUpdateTmpPid (stale temp-file sweep matching)", () => {
  test("extracts the pid from a pid-suffixed temp name", () => {
    expect(parseUpdateTmpPid(".leettui.update.12345.tmp")).toEqual({ pid: 12345 });
  });

  test("recognizes the legacy un-suffixed name with a null pid", () => {
    expect(parseUpdateTmpPid(".leettui.update.tmp")).toEqual({ pid: null });
  });

  test("null for anything that isn't an update temp file", () => {
    expect(parseUpdateTmpPid("leettui")).toBeNull();
    expect(parseUpdateTmpPid("leettui-linux-x64.gz")).toBeNull();
    expect(parseUpdateTmpPid(".leettui.update.abc.tmp")).toBeNull();
    expect(parseUpdateTmpPid(".leettui.update.12345.tmp.bak")).toBeNull();
    expect(parseUpdateTmpPid("x.leettui.update.tmp")).toBeNull();
  });
});
