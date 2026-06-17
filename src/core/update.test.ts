import { afterEach, describe, expect, test } from "bun:test";
import {
  assetUrls,
  fetchAsset,
  fetchLatestRelease,
  fetchReleaseByTag,
  isNewerVersion,
  shouldShowChangelog,
} from "./update";

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

  test("fetchLatestRelease hits /releases/latest and returns tag + notes body", async () => {
    stubFetch(200, { tag_name: "v9.9.9", body: "## What's new\n\nstuff" });
    expect(await fetchLatestRelease()).toEqual({ tag: "v9.9.9", body: "## What's new\n\nstuff" });
    expect(lastUrl).toContain("/releases/latest");
  });

  test("fetchReleaseByTag hits /releases/tags/{tag} and parses it", async () => {
    stubFetch(200, { tag_name: "v1.2.3", body: "notes" });
    expect(await fetchReleaseByTag("v1.2.3")).toEqual({ tag: "v1.2.3", body: "notes" });
    expect(lastUrl).toContain("/releases/tags/v1.2.3");
  });

  test("defaults body to empty string when the release has no notes", async () => {
    stubFetch(200, { tag_name: "v9.9.9" });
    expect(await fetchLatestRelease()).toEqual({ tag: "v9.9.9", body: "" });
  });

  test("throws when the payload has no tag_name", async () => {
    stubFetch(200, { body: "orphaned notes" });
    expect(fetchLatestRelease()).rejects.toThrow("no tag_name");
  });

  test("throws on a non-ok response", async () => {
    stubFetch(404, {});
    expect(fetchLatestRelease()).rejects.toThrow("GitHub API returned 404");
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
