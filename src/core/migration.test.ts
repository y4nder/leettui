import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { migrateSolutionsLayout } from "./migration";

let dir: string;

beforeEach(() => {
  dir = join(tmpdir(), `leettui-migration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content = "code") {
  const full = join(dir, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("migrateSolutionsLayout", () => {
  test("moves flat files into {id}_{slug}/{langSlug}/solution.{ext}", () => {
    write("0001_two-sum.py", "py-code");
    write("0001_two-sum.cpp", "cpp-code");

    const res = migrateSolutionsLayout(dir);

    expect(res.moved).toBe(2);
    expect(res.skipped).toBe(0);
    expect(readFileSync(join(dir, "0001_two-sum/python3/solution.py"), "utf-8")).toBe("py-code");
    expect(readFileSync(join(dir, "0001_two-sum/cpp/solution.cpp"), "utf-8")).toBe("cpp-code");
    expect(existsSync(join(dir, "0001_two-sum.py"))).toBe(false);
  });

  test("preserves slugs that contain digits and hyphens", () => {
    write("0010_3sum-closest.js", "x");
    migrateSolutionsLayout(dir);
    expect(existsSync(join(dir, "0010_3sum-closest/javascript/solution.js"))).toBe(true);
  });

  test("is idempotent — a second run is a no-op", () => {
    write("0001_two-sum.py");
    expect(migrateSolutionsLayout(dir).moved).toBe(1);
    const second = migrateSolutionsLayout(dir);
    expect(second.moved).toBe(0);
    expect(second.skipped).toBe(0);
  });

  test("never overwrites an existing target; leaves the flat file", () => {
    write("0001_two-sum/python3/solution.py", "already-here");
    write("0001_two-sum.py", "flat-version");

    const res = migrateSolutionsLayout(dir);

    expect(res.moved).toBe(0);
    expect(res.skipped).toBe(1);
    expect(readFileSync(join(dir, "0001_two-sum/python3/solution.py"), "utf-8")).toBe("already-here");
    expect(existsSync(join(dir, "0001_two-sum.py"))).toBe(true);
  });

  test("leaves unknown-extension and non-matching files untouched", () => {
    write("0001_two-sum.xyz", "unknown-ext");
    write("README.md", "readme");
    write(".DS_Store", "junk");

    const res = migrateSolutionsLayout(dir);

    expect(res.moved).toBe(0);
    expect(existsSync(join(dir, "0001_two-sum.xyz"))).toBe(true); // unknown ext counted as skipped
    expect(res.skipped).toBe(1);
    expect(existsSync(join(dir, "README.md"))).toBe(true); // non-matching, not counted
  });

  test("no-op when the solutions dir does not exist", () => {
    const missing = join(dir, "does-not-exist");
    const res = migrateSolutionsLayout(missing);
    expect(res).toEqual({ moved: 0, skipped: 0 });
  });
});
