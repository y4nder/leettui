#!/usr/bin/env bun
// Local production build. Stamps the binary with a `git describe` version so
// source-built binaries are identifiable in `leettui --version` and bug reports.
// LEETTUI_IS_RELEASE is intentionally left unset, so self-update
// (src/core/update.ts) refuses to run — only the release workflow builds
// official, self-updating binaries.
import { $ } from "bun";

const version =
  (await $`git describe --tags --always --dirty`.nothrow().quiet().text()).trim() || "dev";

const define = `process.env.LEETTUI_VERSION=${JSON.stringify(version)}`;

await $`bun build ./src/index.tsx --compile --minify --define ${define} --outfile leettui`.env({
  ...process.env,
  NODE_ENV: "production",
});

console.log(`Built ./leettui (version ${version})`);
