// Path-string resolution shared by the path layer (paths.ts) and the user-config
// accessors (index.ts). Each function reads `homedir()` / `process.env` at call
// time and takes its inputs as explicit args, so they stay pure and unit-testable
// even though Bun fixes `os.homedir()` at process launch.

import { homedir } from "os";
import { isAbsolute, join } from "path";

// Expand a raw path string for use as a filesystem location:
//   - `$VAR` / `${VAR}` are substituted with the matching env value (empty string
//     when unset, matching shell behavior — note `$UNSET/x` therefore yields `/x`).
//   - a leading `~` or `~/` becomes the user's home directory. Only a bare `~` or
//     `~/...` is treated as home; `~user` is left untouched (we don't resolve other
//     users' homes) rather than corrupted into `${home}user`.
// Order: env vars first, then the leading tilde. This is a pure string transform —
// the result may still be relative; callers apply their own policy via `isAbsolute`.
export function expandPath(raw: string): string {
  const withEnv = raw.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match, braced, bare) => process.env[braced ?? bare] ?? "",
  );
  if (withEnv === "~" || withEnv.startsWith("~/")) {
    return join(homedir(), withEnv.slice(1));
  }
  return withEnv;
}

// XDG base-dir policy: use the env value only when it expands to an *absolute*
// path; per the XDG Base Directory spec a relative value must be ignored in favor
// of the default.
export function resolveBase(raw: string | undefined, fallback: string): string {
  if (raw) {
    const expanded = expandPath(raw);
    if (isAbsolute(expanded)) return expanded;
  }
  return fallback;
}

// User-config path policy: expand, then anchor a still-relative result to $HOME
// (cwd-independent — the headless CLI runs from arbitrary working directories, so
// resolving relative to cwd would scatter solutions depending on where it ran).
export function resolveConfigPath(raw: string): string {
  const expanded = expandPath(raw);
  return isAbsolute(expanded) ? expanded : join(homedir(), expanded);
}
