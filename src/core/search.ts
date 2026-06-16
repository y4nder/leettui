import type { DbQuestion } from "../db/questions";

export function fuzzyMatch(needle: string, haystack: string): number {
  const lower = haystack.toLowerCase();
  const query = needle.toLowerCase();

  if (lower.includes(query)) return 1000 - lower.indexOf(query);

  let score = 0;
  let qi = 0;
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) {
      score += 1;
      qi++;
    }
  }

  return qi === query.length ? score : 0;
}

// Fuzzy-filter topic slugs (e.g. for the topics-panel search). Empty needle
// returns the list unchanged; otherwise scored highest-first, like questions.
export function filterTopics(topics: string[], needle: string): string[] {
  if (!needle.trim()) return topics;

  return topics
    .map((t) => ({ t, score: fuzzyMatch(needle, t) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.t);
}

export function filterQuestions(questions: DbQuestion[], needle: string): DbQuestion[] {
  if (!needle.trim()) return questions;

  const scored = questions
    .map((q) => {
      const titleScore = fuzzyMatch(needle, q.title);
      const idScore = fuzzyMatch(needle, String(q.id));
      const score = Math.max(titleScore, idScore);
      return { q, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.q);
}
