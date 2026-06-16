import { fetchQuestionList } from "../api/queries/problemset-question-list";
import { upsertQuestion, upsertQuestionTopics, getQuestionCount } from "../db/questions";
import { getDb } from "../db/index";
import type { ApiQuestion } from "../api/types";

const PAGE_SIZE = 100;
const CONCURRENCY = 5;

function persistPage(questions: ApiQuestion[]): void {
  getDb().transaction(() => {
    for (const q of questions) {
      const id = parseInt(q.frontendQuestionId, 10);
      if (Number.isNaN(id)) continue;

      upsertQuestion({
        id,
        title: q.title,
        titleSlug: q.titleSlug,
        difficulty: q.difficulty,
        paidOnly: q.paidOnly,
        status: q.status,
        acRate: q.acRate,
      });

      const topicSlugs = q.topicTags.map((t) => t.slug);
      if (topicSlugs.length > 0) {
        upsertQuestionTopics(id, topicSlugs);
      }
    }
  });
}

export async function syncQuestions(
  onProgress?: (fetched: number, total: number) => void,
): Promise<number> {
  const first = await fetchQuestionList(PAGE_SIZE, 0);
  const total = first.problemsetQuestionList.total;

  persistPage(first.problemsetQuestionList.questions);
  let fetched = first.problemsetQuestionList.questions.length;
  onProgress?.(fetched, total);

  if (fetched >= total || first.problemsetQuestionList.questions.length === 0) {
    return fetched;
  }

  const skips: number[] = [];
  for (let s = fetched; s < total; s += PAGE_SIZE) skips.push(s);

  let cursor = 0;
  async function worker() {
    while (cursor < skips.length) {
      const skip = skips[cursor++]!;
      const data = await fetchQuestionList(PAGE_SIZE, skip);
      const questions = data.problemsetQuestionList.questions;
      if (questions.length === 0) return;
      persistPage(questions);
      fetched += questions.length;
      onProgress?.(Math.min(fetched, total), total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, skips.length) }, () => worker()));

  return fetched;
}

export async function syncIfEmpty(
  onProgress?: (fetched: number, total: number) => void,
): Promise<void> {
  const count = getQuestionCount();
  if (count === 0) {
    await syncQuestions(onProgress);
  }
}
