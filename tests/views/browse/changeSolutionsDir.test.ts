import { describe, expect, it } from "bun:test";
import { isAbsolute, resolve } from "node:path";

import { changeSolutionsDir, type ChangeLocationDeps } from "@/views/browse/handlers";
import type { RelocateResult } from "@/core/relocate";

// A spy harness that records the order of dependency calls, so the ordering
// invariant ("read the current dir BEFORE persisting") is locked, not just hoped.
function makeDeps(currentDir: string) {
  const calls: string[] = [];
  const args: { persist?: string; from?: string; to?: string; lastKnown?: string } = {};
  const result: RelocateResult = { moved: 3, skipped: 1 };
  const deps: ChangeLocationDeps = {
    getSolutionsDir: () => {
      calls.push("get");
      return currentDir;
    },
    persistSolutionsDir: (raw) => {
      calls.push("persist");
      args.persist = raw;
    },
    relocateSolutions: (from, to) => {
      calls.push("relocate");
      args.from = from;
      args.to = to;
      return result;
    },
    setLastKnownSolutionsDir: (dir) => {
      calls.push("setLastKnown");
      args.lastKnown = dir;
    },
  };
  return { deps, calls, args, result };
}

describe("changeSolutionsDir", () => {
  it("reads the current dir before persisting, then migrates old→new", () => {
    const { deps, calls, args } = makeDeps("/home/u/.local/share/leettui/solutions");
    const out = changeSolutionsDir("/home/u/leetcode", deps);

    expect(out.status).toBe("changed");
    // The invariant: get happens before persist (a reorder would no-op the move).
    expect(calls).toEqual(["get", "persist", "relocate", "setLastKnown"]);
    // relocate moves FROM the pre-persist dir TO the resolved new dir.
    expect(args.from).toBe("/home/u/.local/share/leettui/solutions");
    expect(args.to).toBe("/home/u/leetcode");
    expect(out.toDir).toBe("/home/u/leetcode");
  });

  it("persists the raw input verbatim but migrates to the resolved absolute path", () => {
    const { deps, args } = makeDeps("/abs/old");
    // A relative input is resolved (against $HOME) for the move, but written raw.
    const out = changeSolutionsDir("leetcode-here", deps);

    expect(out.status).toBe("changed");
    expect(args.persist).toBe("leetcode-here"); // raw value lands in TOML
    expect(isAbsolute(args.to!)).toBe(true); // move target is resolved/absolute
    expect(args.to).toBe(resolve(args.to!)); // and normalized
    expect(args.lastKnown).toBe(args.to); // last-known tracks the resolved dir
  });

  it("is a no-op (writes nothing) when the resolved target equals the current dir", () => {
    const { deps, calls } = makeDeps("/abs/same");
    const out = changeSolutionsDir("/abs/same", deps);

    expect(out.status).toBe("unchanged");
    expect(out.result).toEqual({ moved: 0, skipped: 0 });
    expect(calls).toEqual(["get"]); // never persisted, never moved
  });

  it("treats a trailing-slash variant of the current dir as unchanged", () => {
    const { deps, calls } = makeDeps("/abs/same");
    const out = changeSolutionsDir("/abs/same/", deps);

    expect(out.status).toBe("unchanged");
    expect(calls).toEqual(["get"]);
  });
});
