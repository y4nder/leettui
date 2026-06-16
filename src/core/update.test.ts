import { describe, expect, test } from "bun:test";
import { isNewerVersion } from "./update";

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
