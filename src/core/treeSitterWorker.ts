// Make OpenTUI's tree-sitter syntax highlighting work inside the `bun build
// --compile` standalone binary.
//
// OpenTUI highlights <markdown>/<code> by spawning a Worker from
// `parser.worker.js`. Its resolver (TreeSitterClient.resolveWorkerPath) looks
// for that file next to the bundled `@opentui/core` module via
// `new URL("./parser.worker.js", import.meta.url)`. In the compiled binary
// `import.meta.url` is `/$bunfs/root/…`, the worker was never embedded, so the
// `existsSync` check fails and it falls back to `./parser.worker.ts` —
// `new Worker("/$bunfs/root/parser.worker.ts")` then throws ModuleNotFound. The
// highlighter silently degrades to a single unstyled chunk, so every markdown
// description renders flat and `buildMarkdownSyntaxStyle()` never applies. (Run
// via `bun src/index.tsx` it works, because the worker is a real file on disk —
// which is why this only showed up in release binaries.)
//
// Fix: import the worker with `type: "file"` so Bun embeds it as an asset and
// hands back its in-binary path, then point OpenTUI at it via the documented
// `OTUI_TREE_SITTER_WORKER_PATH` override. Importing this module for its side
// effect (first, before anything touches @opentui/core's tree-sitter client)
// installs the override. Outside the compiled binary the import resolves to the
// real on-disk path, so dev runs are unaffected.
//
// The path reaches into node_modules directly because @opentui/core@0.2.16's
// `./parser.worker` export entry is stale — it points at a `lib/tree-sitter/…`
// file that isn't shipped; only the top-level `parser.worker.js` exists, and it
// is the exact file the runtime resolver targets.
import workerPath from "../../node_modules/@opentui/core/parser.worker.js" with { type: "file" };

process.env.OTUI_TREE_SITTER_WORKER_PATH = workerPath;
