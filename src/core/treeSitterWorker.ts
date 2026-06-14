// Make OpenTUI's tree-sitter syntax highlighting work inside the `bun build
// --compile` standalone binary.
//
// OpenTUI highlights <markdown>/<code> by spawning a Worker from
// `@opentui/core/parser.worker.js`, whose resolver looks for it next to the
// bundled core module. That fails two different ways in a compiled binary:
//
//   1. The worker isn't in the bundle at all -> resolver falls back to
//      `parser.worker.ts` -> `new Worker("/$bunfs/root/parser.worker.ts")`
//      throws ModuleNotFound.
//   2. Even if the worker *bytes* are embedded (e.g. via a `type: "file"`
//      import), the worker itself does `import "web-tree-sitter"` and
//      `import("web-tree-sitter/tree-sitter.wasm")`. A raw file asset is not
//      part of the module graph, so those deps are NOT bundled; the worker then
//      throws `Cannot find package 'web-tree-sitter'` — unless a node_modules
//      happens to sit next to the running binary (which is why it looked fine
//      in dev and broke only in shipped releases).
//
// Either way the highlighter silently degrades to a single unstyled chunk, so
// every <markdown> renders flat and `buildMarkdownSyntaxStyle()` does nothing.
//
// The fix has two halves:
//   - Build: add `node_modules/@opentui/core/parser.worker.js` as a second
//     `--compile` entry point (see scripts/build.ts and the release workflow).
//     As a real entry point it's bundled as a module, so web-tree-sitter and the
//     engine wasm are embedded with it. Bun places it in the binary at
//     `/$bunfs/root/node_modules/@opentui/core/parser.worker.js`.
//   - Runtime (this module): point OpenTUI at that worker via the documented
//     `OTUI_TREE_SITTER_WORKER_PATH` override. Imported first in src/index.tsx,
//     before anything touches the tree-sitter client.
//
// Resolving the path: in a compiled binary every module's `import.meta.url`
// flattens to `file:///$bunfs/root/<exe>` (source nesting is lost and
// `import.meta.resolve` throws), so the embedded worker is one `./` away. On
// disk this module sits at `src/core/`, so the worker is `../../` away. We try
// the on-disk path first and fall back to the bundled one — existence, not a
// brittle `$bunfs` string match, distinguishes the two.
//
// (The path reaches into node_modules directly because @opentui/core@0.2.16's
// `./parser.worker` export entry is stale — it points at a `lib/tree-sitter/…`
// file that isn't shipped; only the top-level `parser.worker.js` exists.)
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const onDiskWorker = fileURLToPath(
  new URL("../../node_modules/@opentui/core/parser.worker.js", import.meta.url),
);

process.env.OTUI_TREE_SITTER_WORKER_PATH = existsSync(onDiskWorker)
  ? onDiskWorker
  : fileURLToPath(
      new URL("./node_modules/@opentui/core/parser.worker.js", import.meta.url),
    );
