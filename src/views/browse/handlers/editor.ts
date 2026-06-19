// Browse handlers that spawn `$EDITOR`: open a single solution file (`e`), the
// whole problem folder (`w`), or the entire solutions dir (`W`). All three reuse
// the suspend/spawn/resume handover via `withSuspendedRenderer`.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { useAppStore } from "../../../ui/store";
import { htmlToMarkdown } from "../../../core/markdown";
import { fetchQuestionContent } from "../../../api/queries/question-content";
import { fetchEditorData } from "../../../api/queries/editor-data";
import { fetchConsolePanelConfig } from "../../../api/queries/console-panel-config";
import {
  createSolutionWithHarness,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
} from "../../../core/solutions";
import { getEditorArgv, getSolutionsDir } from "../../../config";
import { info } from "../resultView";
import { currentQuestion, reportError, withSuspendedRenderer, type Renderer } from "./shared";

export async function handleOpenEditor(triggerKey: string, renderer: Renderer) {
  const q = currentQuestion();
  if (!q) return;
  const { showSelect, hideSelect, showResult } = useAppStore.getState();

  try {
    const editorData = await fetchEditorData(q.title_slug);
    const snippets = editorData.question.codeSnippets;
    if (!snippets || snippets.length === 0) {
      showResult(info("No code snippets available for this problem."));
      return;
    }

    showSelect(
      "Select Language",
      snippets.map((s) => s.lang),
      async (index) => {
        hideSelect();
        if (index === null) return;

        const snippet = snippets[index]!;
        // metaData + example cases drive harness generation / tests seeding (cached fetch).
        const cfg = await fetchConsolePanelConfig(q.title_slug).catch(() => null);
        const path = createSolutionWithHarness(
          q.id,
          q.title_slug,
          snippet.langSlug,
          snippet.code,
          cfg?.question.metaData,
          cfg?.question.exampleTestcaseList,
        );

        const editor = getEditorArgv();
        await withSuspendedRenderer(renderer, async () => {
          const proc = Bun.spawn([...editor, path], {
            // cwd = the language folder, so the headless CLI's cwd-inference
            // (`leettui test`) and per-language LSP work from inside the editor.
            cwd: dirname(path),
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          });
          await proc.exited;
        });
        // A newly created file should immediately show the "solution exists" mark.
        useAppStore.getState().refreshSolutionFiles();
      },
    );
  } catch (e) {
    reportError(showResult, triggerKey, "handleOpenEditor", "Error fetching editor data", e);
  }
}

// Spawn `$EDITOR {dir}` as a workspace (Stage 13): cwd is the dir itself, so an
// editor opens it as a project (VS Code) / file tree (vim netrw). Deliberately
// NOT `openInEditorPath` — that sets cwd to the file's *parent*; here cwd must be
// the problem dir itself. (cwd = problem dir is also why `leettui test` can't
// infer a langSlug from a workspace — that path stays on `e`.)
async function spawnEditorInDir(renderer: Renderer, dir: string) {
  const editor = getEditorArgv();
  await withSuspendedRenderer(renderer, async () => {
    const proc = Bun.spawn([...editor, dir], {
      cwd: dir,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  });
}

// Open the whole problem folder as a workspace (Stage 13): ensure the problem
// dir, a create-if-absent `problem.md` (description fetched like the problem
// view), and `notes.md`, then spawn `$EDITOR {problemDir}` so the language
// subfolders + notes + statement are all in the editor's file tree at once.
// A premium-only problem (no description) still opens, with a placeholder
// `problem.md` — only a genuine fetch failure aborts (mirrors the other handlers).
export async function handleOpenWorkspace(triggerKey: string, renderer: Renderer) {
  const q = currentQuestion();
  if (!q) return;
  const { showResult } = useAppStore.getState();
  try {
    const content = await fetchQuestionContent(q.title_slug);
    const html = content.question?.content;
    const description = html
      ? htmlToMarkdown(html)
      : "_No description available (problem may be premium-only)._";

    const problemDir = ensureProblemDir(q.id, q.title_slug);
    ensureProblemMd(q.id, q.title_slug, description, q.title);
    ensureNotesFile(q.id, q.title_slug, q.title);

    await spawnEditorInDir(renderer, problemDir);
    useAppStore.getState().refreshSolutionFiles();
  } catch (e) {
    reportError(showResult, triggerKey, "handleOpenWorkspace", "Error opening workspace", e);
  }
}

// Open the *entire solutions directory* as a workspace — the unscoped sibling of
// `w`/handleOpenWorkspace. Same `$EDITOR {dir}` (cwd = dir) handover, but rooted at
// the solutions dir so every problem folder is in the editor's file tree at once.
// mkdir -p first: on a fresh install the dir may not exist yet (no solution created),
// and spawning `$EDITOR` on a missing path is unfriendly. Not question-targeted, so
// it's a global binding (browse + problem) rather than a panel one.
export async function handleOpenSolutionsWorkspace(triggerKey: string, renderer: Renderer) {
  const { showResult } = useAppStore.getState();
  try {
    const dir = getSolutionsDir();
    mkdirSync(dir, { recursive: true });
    await spawnEditorInDir(renderer, dir);
    useAppStore.getState().refreshSolutionFiles();
  } catch (e) {
    reportError(
      showResult,
      triggerKey,
      "handleOpenSolutionsWorkspace",
      "Error opening solutions workspace",
      e,
    );
  }
}
