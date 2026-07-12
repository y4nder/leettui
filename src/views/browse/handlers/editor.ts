// Browse handlers that spawn `$EDITOR`: open a single solution file (`e`), the
// whole problem folder (`w`), or the entire solutions dir (`W`). All three go
// through the shared `openInEditor` — terminal editors suspend/resume the TUI,
// GUI editors launch detached so the TUI stays live.

import { mkdirSync } from "node:fs";

import { useAppStore } from "@/ui/store";
import { htmlToMarkdown } from "@/core/markdown";
import { fetchQuestionContent } from "@/api/queries/question-content";
import { fetchEditorData } from "@/api/queries/editor-data";
import { fetchConsolePanelConfig } from "@/api/queries/console-panel-config";
import {
  createSolutionWithHarness,
  ensureNotesFile,
  ensureProblemDir,
  ensureProblemMd,
} from "@/core/solutions";
import { getSolutionsDir } from "@/config";
import { info } from "@/views/browse/resultView";
import {
  currentQuestion,
  openInEditor,
  reportError,
  type Renderer,
} from "@/views/browse/handlers/shared";

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

        // SelectPopup invokes this callback fire-and-forget, so the outer
        // try/catch has already returned — report failures here or they'd be
        // unhandled rejections.
        try {
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

          // Default cwd = the language folder, so the headless CLI's cwd-inference
          // (`leettui test`) and per-language LSP work from inside the editor.
          // A newly created file should immediately show the "solution exists" mark.
          await openInEditor(renderer, path, {
            onExit: () => useAppStore.getState().refreshSolutionFiles(),
          });
        } catch (e) {
          reportError(showResult, triggerKey, "handleOpenEditor", "Error opening editor", e);
        }
      },
    );
  } catch (e) {
    reportError(showResult, triggerKey, "handleOpenEditor", "Error fetching editor data", e);
  }
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

    // cwd = the dir itself so an editor opens it as a project (VS Code) / file
    // tree (vim netrw) — NOT the file's-parent default. (cwd = problem dir is
    // also why `leettui test` can't infer a langSlug from a workspace — that
    // path stays on `e`.)
    await openInEditor(renderer, problemDir, {
      cwd: problemDir,
      onExit: () => useAppStore.getState().refreshSolutionFiles(),
    });
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
    await openInEditor(renderer, dir, {
      cwd: dir,
      onExit: () => useAppStore.getState().refreshSolutionFiles(),
    });
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
