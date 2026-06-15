// Resolves the active problem for a headless CLI verb purely from the current
// working directory — no problem argument to type from inside an editor. Feeds
// `cwd` to `resolveProblemFromCwd` (the path → {id, slug, lang} parser from
// Stage 8 item 1), then does the DB lookup the resolver intentionally leaves to
// its caller. The folder slug round-trips through `getProblemDir`, so a slug
// lookup (`getQuestionBySlug`) is the right join back to a `DbQuestion`.

import { resolveProblemFromCwd } from "../core/solutions";
import { getQuestionBySlug, type DbQuestion } from "../db/questions";

export interface ResolvedTarget {
  question: DbQuestion;
  langSlug: string;
}

export type TargetResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; error: string };

export function resolveTarget(cwd: string): TargetResult {
  const resolved = resolveProblemFromCwd(cwd);
  if (!resolved) {
    return {
      ok: false,
      error:
        "Not inside a solution folder. cd into solutions/{id}_{slug}/{lang}/ first.",
    };
  }
  if (!resolved.langSlug) {
    return {
      ok: false,
      error:
        "No language selected. cd into a language subfolder (e.g. python3/) inside the problem.",
    };
  }

  const question = getQuestionBySlug(resolved.titleSlug);
  if (!question) {
    return {
      ok: false,
      error: `Unknown problem '${resolved.titleSlug}' (id ${resolved.questionId}). Sync the problem list first.`,
    };
  }

  return { ok: true, target: { question, langSlug: resolved.langSlug } };
}
