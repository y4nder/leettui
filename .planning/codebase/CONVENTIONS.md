# Coding Conventions

**Analysis Date:** 2026-06-25

## Naming Patterns

**Files:**
- TypeScript source files: `camelCase.ts` (e.g., `search.ts`, `testRunner.ts`, `migration.ts`)
- React components: `PascalCase.tsx` (e.g., `ResultPopup.tsx`, `ChangeLocationPrompt.tsx`, `HelpPopup.tsx`)
- Test files: `*.test.ts` suffix (e.g., `search.test.ts`, `persist.test.ts`)
- Config/barrel files: named explicitly (`index.ts`, `types.ts`, `paths.ts`)

**Functions:**
- camelCase: `fuzzyMatch()`, `filterQuestions()`, `parseMetaData()`, `createSolutionWithHarness()`
- Async functions: same camelCase pattern, `async function handleOpenEditor(...)`
- Exported functions are typically documented with JSDoc-style comments for public APIs
- Factory functions: `create*()` or `make*()` pattern (e.g., `createClient()`, `makeCommand()`)
- Predicate functions: `is*()` or `has*()` pattern (e.g., `hasTokens()`, `isGitRepo()`, `commandExists()`)
- Accessor functions: `get*()` pattern (e.g., `getDbPath()`, `getSolutionsDir()`, `getRunnerSpec()`)

**Variables:**
- camelCase throughout: `currentDir`, `pending`, `valueRef`, `themeVersion`, `titleScore`, `qi`
- React hooks: `const` (never `let` unless reassignment needed)
- Refs: `const xRef = useRef(...)` (trailing `Ref` suffix)
- State setters: `const [phase, setPhase] = useState(...)`
- Loop indices: single letters or descriptive: `for (let i = 0; i < arr.length; i++)` or `for (const q of questions)`

**Types:**
- PascalCase: `DbQuestion`, `LocalRunReport`, `CommandSpec`, `CommandEntry`, `HarnessFile`, `Config`, `CaseStatus`
- Interface names: no `I` prefix, just `MyInterface`
- Type aliases for discriminated unions: `type LocalRunReport = { kind: "..." } | { kind: "..." }`
- Callback types: `type MyCallback = (arg: Type) => void`

**Constants:**
- UPPER_SNAKE_CASE for module-level constants: `DEFAULT_TOML`, `TIMEOUT_MS`, `COMPILE_TIMEOUT_MS`, `CONFIG_FILE`, `DEFAULT_JUMP_ROWS`, `KEY_WIDTH`, `GRAPHQL_URL`, `BASE_URL`
- Immutable collections are constants: `RUNNERS`, `COMMAND_BY_NAME`, `SHORT_BY_NAME`
- All exports with capital letters are module constants: `PANEL_ORDER`, `PROBLEM_PANEL_ORDER`, `DEFERRED_TYPES`

**Components:**
- PascalCase function names: `export function ResultPopup({ view }: ResultPopupProps)`
- Props interfaces: `{ComponentName}Props` (e.g., `ResultPopupProps`, `DeleteSolutionPromptProps`)
- Internal state/refs: camelCase (e.g., `const [phase, setPhase] = useState(...)`)

## Code Style

**Formatting:**
- Tool: Biome 2.5.0
- Indent: 2 spaces (configured in `biome.json`: `indentWidth: 2`)
- Line width: 100 characters (configured: `lineWidth: 100`)
- Quotes: double quotes for strings (configured: `quoteStyle: "double"`)
- Semicolons: always present (Biome default)
- Trailing commas: multi-line (Biome default)

**Linting:**
- Tool: Biome 2.5.0 with strict configuration
- Mode: **zero-tolerance** — run with `--error-on-warnings`, so any warning is a build failure
- Recommended rule set: enabled
- Key enforced rules:
  - `noExplicitAny`: error (all `any` types must be explicitly justified)
  - `noArrayIndexKey`: error (array index as React key is forbidden)
  - `useExhaustiveDependencies`: error (exhaustive React dependency arrays required)
  - `noNonNullAssertion`: **off** (deliberately permitted for strict indexed access — use `!` on validated array indices)
  - `noUncheckedIndexedAccess`: enabled in TypeScript config

**Exceptions:**
- Biome suppressions: `// biome-ignore <rule>: <reason>` (inline, with justification required)
- Example: `// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${VAR} in the test name is intentional`
- Valid use cases: static render lists keyed by index, React `useMemo` cache-bust patterns via `themeVersion`

**TypeScript:**
- Strict mode: `strict: true` (all strict flags enabled)
- Key strictness flags:
  - `noUncheckedIndexedAccess: true` (indexing objects/arrays without key check requires validation)
  - `noImplicitOverride: true` (overriding a parent method must be explicit)
  - `noFallthroughCasesInSwitch: true` (switch case must have break/return)
- Target: `ESNext`
- Module: `Preserve` (no module transformation)
- No unused locals/parameters checked (set to `false` — intentional during dev)
- JSX: `react-jsx` from `@opentui/react`

## Import Organization

**Order:**
1. Node.js built-ins (e.g., `import { join } from "node:path"`)
2. Third-party packages (e.g., `import { create } from "zustand"`, `import { Database } from "bun:sqlite"`)
3. Type imports (e.g., `import type { DbQuestion } from "../db/questions"`)
4. Local relative imports (e.g., `import { useAppStore } from "../store"`, `import { colors } from "../theme"`)

**Path Aliases:**
- `@/*` → `src/*` (`tsconfig.json` `paths`), used by **test files** in `tests/` to import source (e.g. `import { filterTopics } from "@/core/search"`). Source files under `src/` still use relative imports among themselves.
- Exception: Bun/Node.js namespaced imports (`bun:sqlite`, `node:fs`, `node:path`, etc.)

**Example block:**
```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyEvent, Renderable } from "@opentui/core";
import { create } from "zustand";

import type { DbQuestion } from "../db/questions";
import { useAppStore } from "../store";
```

**Re-exports (barrel modules):**
- Used in `core/solutions/index.ts`, `ui/keymap/commands/index.ts`, `views/browse/handlers/index.ts`
- Pattern: `export { name } from "./file"` (lightweight re-export, no re-interpretation)
- Purpose: maintain backward-compatible import paths when splitting large modules

## Error Handling

**Patterns:**
- Custom error classes extend `Error` and set `this.name`:
  ```typescript
  export class AuthError extends Error {
    constructor(
      public readonly status: number,
      message = `LeetCode session rejected (${status})...`,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }
  ```

- Try/catch for validation and recovery:
  ```typescript
  function tryCanonicalJson(s: string): string | null {
    try {
      return JSON.stringify(JSON.parse(s));
    } catch {
      return null;
    }
  }
  ```

- "Never throws" pattern for infrastructure code (e.g., test runner, harness generator):
  - Returns discriminated unions for different outcomes
  - Catches all exceptions internally and returns `null` / error object
  - Example: `runLocalTests()` returns `LocalRunReport` (discriminated union, never throws)
  - Example: `generateHarness()` returns `GeneratedHarness | null`

- Transparent error propagation:
  - Most async functions (`createClient`, `graphql`, `post`) propagate HTTP errors
  - Status 401/403 throw `AuthError` specifically, others throw generic `Error`

- Debug logging on error:
  ```typescript
  const cmd: Command = {
    run: () => {
      try {
        spec.run();
      } catch (err) {
        logKey(spec.name, "", useAppStore.getState().mode, `error: ${(err as Error).message}`);
      }
    },
  };
  ```

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Boot-level info: `console.log(...)` (config creation, migrations)
- Debug overlay: `logKey(action, binding, mode, message)` in `src/debug.ts` (development only)
- Error context: `errMessage(err)` helper in `src/debug.ts` converts error objects to strings
- No runtime logging in production (console calls are compile-time removed in release builds)
- Test output: `console.log` within test suites is visible with `bun test --verbose`

## Comments

**When to Comment:**
- Public API functions: JSDoc-style for function signature, parameters, return value, and example
- Complex algorithms: explain the approach (e.g., fuzzy matching scoring logic)
- Non-obvious workarounds: explain why (e.g., `#[cfg(feature = "harness")]` for rust, `new Bun.Transpiler` for TypeScript)
- Design decisions: multi-line comments at the top of a component or module explaining the architecture choice
- Setup/configuration: comments in `biome.json`, `tsconfig.json` explaining flags

**JSDoc/TSDoc:**
- Used sparingly; most functions have clear names and types
- Common patterns:
  ```typescript
  // One-line description of what it does.
  export function getName(config: Config = loadConfig()): string {
    ...
  }

  // Multi-line comment for complex logic:
  // Scores `needle` against `haystack` using two-tier matching:
  // 1. Substring match (highest score)
  // 2. Fuzzy/subsequence match (lower score)
  // Returns 0 if no match.
  export function fuzzyMatch(needle: string, haystack: string): number {
    ...
  }
  ```

**Inline Comments:**
- Explain "why", not "what" (the code shows what it does)
- Reference related files or stages: `// Stage 21 (LSP fix)`
- Flag workarounds: `// biome-ignore lint/... <reason>`

## Function Design

**Size:**
- Keep functions focused and single-responsibility
- Larger orchestrators (`createSolutionWithHarness`, `runLocalTests`) are well-documented at the top with multi-line comments
- Most functions: 10–40 lines

**Parameters:**
- Prefer explicit parameters over config objects for ≤3 params
- Use object parameters for optional/named arguments:
  ```typescript
  async runUpdate({ force }: { force: boolean }): Promise<void>
  ```
- Dependency injection for testability:
  ```typescript
  export function changeSolutionsDir(rawInput: string, deps?: Deps): Promise<ChangeLocationOutcome>
  ```

**Return Values:**
- Explicit types always (no implicit `void`, return `Promise<T>` for async)
- Prefer specific return types (discriminated unions, not generic objects)
- Example: `LocalRunReport = { kind: "unsupported", langSlug } | { kind: "ran", cases: ... }`

## Module Design

**Exports:**
- Named exports for regular values/functions: `export function getName() { ... }`
- Named exports for types: `export type Config = { ... }` or `export interface Props { ... }`
- Default exports: avoided (all are named)
- Re-exports in barrel files: `export { name } from "./submodule"`

**Barrel Files:**
- Used to maintain import path stability when refactoring large modules
- Example: `core/solutions/index.ts` re-exports from `paths.ts`, `discovery.ts`, `create.ts`, `remove.ts`
- Pattern: one re-export line per item, no local definitions in barrel files
- Allows importers to keep `from "../core/solutions"` when internal structure changes

**Module Dependencies:**
- Acyclic: circular imports are forbidden
- Leaf modules (e.g., `debug.ts`, `views/shared.ts`) have no dependents outside their subtree
- Strict boundaries:
  - `ui/` never imports from `views/` (UI is infrastructure, views use it)
  - `views/` imports from `ui/`, `core/`, `api/`, `db/`
  - `core/` imports from `api/`, `db/`, `config/` but not `views/` or `ui/`

**Singleton patterns:**
- Config: `loadConfig()` with memo via `_config` variable
- Database: `openDatabase()` with memo via `_db` variable
- Both return early if already initialized

---

*Convention analysis: 2026-06-25*
