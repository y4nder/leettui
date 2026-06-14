// Build-time version metadata, inlined by Bun via `--define`.
//
// VERSION identifies the build for `leettui --version` and bug reports:
//   - Release workflow stamps the pushed git tag (e.g. "v0.2.0").
//   - Local `bun run build` stamps `git describe` (e.g. "v0.1.1-5-gabc123").
//   - `bun src/index.tsx` and untagged builds fall back to "dev".
//
// IS_RELEASE is true ONLY for official release-workflow binaries. It gates
// self-update: a from-source build (which is usually ahead of or diverged from
// the latest release) must never be silently overwritten by an older published
// binary, so `update` refuses unless this is a real release.
export const VERSION = process.env.LEETTUI_VERSION ?? "dev";
export const IS_RELEASE = process.env.LEETTUI_IS_RELEASE === "1";
