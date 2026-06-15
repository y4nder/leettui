import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { relocateSolutions } from "./relocate";

let base: string;
let from: string;
let to: string;

beforeEach(() => {
  base = join(tmpdir(), `leettui-relocate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  from = join(base, "from");
  to = join(base, "to");
  mkdirSync(from, { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function write(root: string, rel: string, content = "code") {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("relocateSolutions", () => {
  test("moves whole problem folders (with nested notes/tests/lang dirs) into the target", () => {
    write(from, "0001_two-sum/python3/solution.py", "py");
    write(from, "0001_two-sum/notes.md", "my notes");
    write(from, "0001_two-sum/tests/case-01.txt", "[2,7]\n9");
    write(from, "0010_3sum-closest/javascript/solution.js", "js");

    const res = relocateSolutions(from, to);

    expect(res).toEqual({ moved: 2, skipped: 0 });
    expect(readFileSync(join(to, "0001_two-sum/python3/solution.py"), "utf-8")).toBe("py");
    expect(readFileSync(join(to, "0001_two-sum/notes.md"), "utf-8")).toBe("my notes");
    expect(readFileSync(join(to, "0001_two-sum/tests/case-01.txt"), "utf-8")).toBe("[2,7]\n9");
    expect(readFileSync(join(to, "0010_3sum-closest/javascript/solution.js"), "utf-8")).toBe("js");
    // Source entries are gone (the dir is left in place but empty).
    expect(readdirSync(from)).toEqual([]);
  });

  test("moves non-problem top-level entries too (e.g. a .git repo / README)", () => {
    write(from, "0001_two-sum/python3/solution.py", "py");
    write(from, ".git/config", "[core]");
    write(from, "README.md", "readme");

    const res = relocateSolutions(from, to);

    expect(res.moved).toBe(3);
    expect(readFileSync(join(to, ".git/config"), "utf-8")).toBe("[core]");
    expect(readFileSync(join(to, "README.md"), "utf-8")).toBe("readme");
  });

  test("is idempotent — a second run is a no-op", () => {
    write(from, "0001_two-sum/python3/solution.py");
    expect(relocateSolutions(from, to).moved).toBe(1);
    expect(relocateSolutions(from, to)).toEqual({ moved: 0, skipped: 0 });
  });

  test("collision-safe — never overwrites an existing target entry; leaves the source", () => {
    write(from, "0001_two-sum/python3/solution.py", "new-version");
    write(to, "0001_two-sum/python3/solution.py", "already-here");

    const res = relocateSolutions(from, to);

    expect(res).toEqual({ moved: 0, skipped: 1 });
    expect(readFileSync(join(to, "0001_two-sum/python3/solution.py"), "utf-8")).toBe("already-here");
    expect(existsSync(join(from, "0001_two-sum/python3/solution.py"))).toBe(true);
  });

  test("partial collision — moves the fresh entry, skips the colliding one", () => {
    write(from, "0001_two-sum/python3/solution.py", "from");
    write(from, "0002_add-two/python3/solution.py", "fresh");
    write(to, "0001_two-sum/python3/solution.py", "existing");

    const res = relocateSolutions(from, to);

    expect(res).toEqual({ moved: 1, skipped: 1 });
    expect(existsSync(join(to, "0002_add-two/python3/solution.py"))).toBe(true);
    expect(existsSync(join(from, "0001_two-sum"))).toBe(true); // colliding one stays
  });

  test("no-op when from === to", () => {
    write(from, "0001_two-sum/python3/solution.py");
    expect(relocateSolutions(from, from)).toEqual({ moved: 0, skipped: 0 });
    expect(existsSync(join(from, "0001_two-sum/python3/solution.py"))).toBe(true);
  });

  test("no-op when the source dir does not exist", () => {
    expect(relocateSolutions(join(base, "nope"), to)).toEqual({ moved: 0, skipped: 0 });
  });

  test("refuses a nested move (target inside source) without touching anything", () => {
    write(from, "0001_two-sum/python3/solution.py", "py");
    const nested = join(from, "archive");

    const res = relocateSolutions(from, nested);

    expect(res).toEqual({ moved: 0, skipped: 0 });
    expect(existsSync(join(from, "0001_two-sum/python3/solution.py"))).toBe(true);
    expect(existsSync(nested)).toBe(false);
  });
});
