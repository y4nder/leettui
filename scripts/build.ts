#!/usr/bin/env bun
// Local production build. Stamps the binary with a `git describe` version so
// source-built binaries are identifiable in `leettui --version` and bug reports.
// LEETTUI_IS_RELEASE is intentionally left unset, so self-update
// (src/core/update.ts) refuses to run — only the release workflow builds
// official, self-updating binaries.
import { $ } from "bun";

const version =
  (await $`git describe --tags --always --dirty`.nothrow().quiet().text()).trim() || "dev";

const defines = [`process.env.LEETTUI_VERSION=${JSON.stringify(version)}`].flatMap((d) => [
  "--define",
  d,
]);

// --production sets NODE_ENV=production AND enables minification, which lets the
// debug overlay (gated on NODE_ENV in src/index.tsx) be dead-code-eliminated.
// Do NOT use `--define process.env.NODE_ENV="production"` instead: a raw define
// makes React resolve to its production jsx-dev-runtime (which stubs
// `jsxDEV = void 0`) WITHOUT switching Bun's JSX transform off the dev
// `jsxDEV(...)` form, so the binary crashes at the first render. This matches
// how the release workflow (.github/workflows/release.yml) builds.
//
// The second entry point bundles OpenTUI's tree-sitter highlight worker (and
// its web-tree-sitter dependency + engine wasm) into the binary so <markdown>
// is actually syntax-highlighted; src/core/treeSitterWorker.ts points OpenTUI
// at the embedded copy. Without it the worker can't load and descriptions
// render flat. Keep this in sync with .github/workflows/release.yml.
await $`bun build ./src/index.tsx ./node_modules/@opentui/core/parser.worker.js --compile --production ${defines} --outfile leettui`;

console.log(`Built ./leettui (version ${version})`);
