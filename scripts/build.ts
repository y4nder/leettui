#!/usr/bin/env bun
// Local production build. Stamps the binary with a `git describe` version so
// source-built binaries are identifiable in `leettui --version` and bug reports.
// LEETTUI_IS_RELEASE is intentionally left unset, so self-update
// (src/core/update.ts) refuses to run — only the release workflow builds
// official, self-updating binaries.
import { $ } from "bun";

const version =
  (await $`git describe --tags --always --dirty`.nothrow().quiet().text()).trim() || "dev";

// NODE_ENV is defined explicitly (not via the ambient env) so it is statically
// inlined at compile time, letting --minify dead-code-eliminate the debug overlay.
// This matches how the release workflow (.github/workflows/release.yml) builds.
const defines = [
  `process.env.LEETTUI_VERSION=${JSON.stringify(version)}`,
  `process.env.NODE_ENV=${JSON.stringify("production")}`,
].flatMap((d) => ["--define", d]);

await $`bun build ./src/index.tsx --compile --minify ${defines} --outfile leettui`;

console.log(`Built ./leettui (version ${version})`);
