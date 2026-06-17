import { afterEach, describe, expect, test } from "bun:test";
import {
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
