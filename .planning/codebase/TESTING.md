# Testing Patterns

**Analysis Date:** 2026-06-25

## Test Framework

**Runner:**
- Bun's built-in test framework (`bun:test`)
- Config: None (defaults to Bun conventions; no `.test.ts` glob override needed)

**Assertion Library:**
- `expect()` from `bun:test` (chai-style assertions)

**Run Commands:**
```bash
bun test                       # Run all tests (pre-push hook + CI gate)
bun run check                  # Full gate: lint + typecheck + test
```

## Test File Organization

**Location:**
- Co-located with source: `src/{module}/{file}.test.ts` in the same directory as `{file}.ts`

**Naming:**
- Pattern: `{name}.test.ts` (one test file per module being tested, not per scenario)

**Structure:**
```
src/
├── config/
│   ├── index.ts
│   └── persist.test.ts          # Tests for config/index.ts
├── core/
│   ├── git.ts
│   └── git.test.ts              # Tests for core/git.ts
└── core/harness/
    ├── rust.ts
    └── rust.test.ts             # Tests for the rust harness generator
```

**29 test files total**, covering:
- `src/config/` — config persistence, path resolution, editor-command parsing
- `src/core/` — sync, search, session, migration, relocate, git, testRunner, update, submission
- `src/core/auth/` — paste parsing
- `src/core/harness/` — python, javascript, typescript, rust, csharp, java (6 generators)
- `src/db/` — recents table
- `src/ui/` — progress, relativeTime, keymap
- `src/cli/` — headless verb dispatch
- `src/views/` — view-level helpers

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("Module feature", () => {
  test("behavior when X happens", () => {
    expect(result).toBe(expected);
  });

  test("edge case with Y", () => {
    expect(fn(input)).toEqual(expectedOutput);
  });
});
```

**Patterns:**
- Each `describe` block tests one function/feature
- Test names describe the expected behavior ("appends a new section", "true for a ubiquitous binary")
- Tests are synchronous unless exercising async code

## Setup and Teardown

```typescript
import { beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

beforeAll(() => { /* create a temp dir, seed a child script */ });
afterAll(() => { /* clean up temp directories */ });
beforeEach(() => { dir = freshDir("test-case"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
```

## Mocking

**Approach:** No external mocking library; stubbing via reassigning `globalThis`.

```typescript
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(status: number, payload: unknown): void {
  globalThis.fetch = (async (_url: string) =>
    new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

test("fetches and parses the response", async () => {
  stubFetch(200, { tag: "v1.0.0" });
  const result = await fetchLatestRelease();
  expect(result.tag).toBe("v1.0.0");
});
```

**What to mock:** External APIs (`fetch`, GitHub/LeetCode responses); the real home dir (use a temp `$HOME` instead).

**What NOT to mock:** Pure functions (call directly); filesystem ops on temp dirs (use real fs with `mkdtempSync`/`rmSync`); local git/toolchain ops (gate behind conditional tests instead).

## Fixtures and Factories

```typescript
// Reusable metadata constant at top of file
const TWO_SUM_META = JSON.stringify({
  name: "twoSum",
  params: [
    { name: "nums", type: "integer[]" },
    { name: "target", type: "integer" },
  ],
  return: { type: "integer[]" },
});

// Unique temp dirs to avoid cross-test collisions
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "leettui-test-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
```

Fixtures are created in `beforeEach` with unique names (e.g. the `freshDir(tag)` helper in `src/core/git.test.ts`).

## Coverage

**Requirements:** Not enforced (no coverage config in `package.json` or `bunfig.toml`).

**Observed coverage emphasis:**
- Pure parsing/transformation functions (`parseEditorCommand`, `renderTemplate`, `compareOutput`)
- Git operations with conditional gates (`describe.skipIf(!HAS_GIT)`)
- Harness generation with toolchain gates (`describe.if(HAS_CARGO)`)
- Session state merging via subprocess cross-boot tests
- Error paths and normalization edge cases (trailing whitespace, CRLF, JSON spacing)

## Test Types

**Unit tests** — pure functions, single-responsibility modules. Direct calls with predefined inputs.
- `src/config/persist.test.ts` (TOML rewrite with comment preservation)
- `src/config/editorCommand.test.ts` (command-line parsing with quotes/backslashes)
- `src/ui/progress.test.ts` (bar geometry with fractional characters)
- `src/core/update.test.ts` (semver comparison)
- `src/core/auth/paste.test.ts` (cookie parsing)

**Integration tests** — multiple modules together; set up a temp dir, call the integration point, verify filesystem state.
- `src/core/solutions.test.ts` (end-to-end create-flow with template overlays)
- `src/core/git.test.ts` (git ops + defensive `.gitignore` secrets validation)
- `src/core/testRunner.test.ts` (case pairing + output normalization)

**Subprocess E2E tests** — cross-boot state (`session.json`), runtime-fixed paths (`os.homedir()`). Create a temp `$HOME`, spawn a child with that env, inspect the result. Necessary because Bun fixes `os.homedir()` at process launch.
- `src/core/session.test.ts` — session merge invariants over two spawns sharing one `session.json`
- `src/core/harness/rust.test.ts` — a real `cargo` build in a subprocess to prove the feature-on harness compiles

**Conditional (gated) tests** — `test.if` / `describe.if` / `describe.skipIf` gate on `Bun.which(tool)` so a missing toolchain skips rather than fails.
```typescript
const HAS_CARGO = Bun.which("cargo") !== null;
const HAS_GIT = Bun.which("git") !== null;

describe.skipIf(!HAS_GIT)("git e2e", () => { /* ... */ });
describe.if(HAS_CARGO)("rust harness e2e", () => { /* ... */ });
```
Toolchains gated: `git`, `cargo` (rust), `dotnet` (csharp), `javac`/`java` (java).

## Async + Subprocess Patterns

```typescript
test("async function resolves", async () => {
  expect(await asyncFn()).toBe(expected);
});

test("promise rejects on error", async () => {
  expect(asyncFn(badInput)).rejects.toThrow("error message");
});

// Synchronous subprocess
const result = Bun.spawnSync(["git", "log", "--oneline"], { cwd: dir });
expect(result.exitCode).toBe(0);

// With environment overrides (temp $HOME)
const child = Bun.spawnSync(["bun", childScript], {
  cwd: tmpdir(),
  env: { ...process.env, HOME: tempHome },
});
```

## Output Normalization

The harness runner compares actual vs expected with JSON-aware normalization (spacing, key order, float representation), falling back to CRLF/trailing-whitespace-insensitive string equality. See `compareOutput(actual, expected)` in `src/core/testRunner.ts`.

```typescript
expect(compareOutput("[0,1]", "[0, 1]")).toBe(true);       // JSON spacing
expect(compareOutput('{"a":1,"b":2}', '{ "b": 2, "a": 1 }')).toBe(true); // key order
expect(compareOutput("1.0", "1")).toBe(true);              // float repr
expect(compareOutput("a\r\nb", "a\nb")).toBe(true);        // CRLF
expect(compareOutput("hello", "world")).toBe(false);       // string fallback
```

---

*Testing analysis: 2026-06-25*
