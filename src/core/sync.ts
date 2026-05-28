import { fetchQuestionList } from "../api/queries/problemset-question-list";
import { upsertQuestion, upsertQuestionTopics, getQuestionCount } from "../db/questions";
import { getDb } from "../db/index";

const PAGE_SIZE = 1000;

export async function syncQuestions(
  onProgress?: (fetched: number, total: number) => void
): Promise<number> {
  let skip = 0;
  let total = 0;
  let fetched = 0;

  const db = getDb();

  do {
    const data = await fetchQuestionList(PAGE_SIZE, skip);
    const list = data.problemsetQuestionList;
    total = list.total;

    const insertAll = db.transaction(() => {
      for (const q of list.questions) {
        const id = parseInt(q.frontendQuestionId, 10);
        if (isNaN(id)) continue;

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

    insertAll();

    fetched += list.questions.length;
    skip += PAGE_SIZE;
    onProgress?.(fetched, total);
  } while (fetched < total);

  return fetched;
}

export async function syncIfEmpty(
  onProgress?: (fetched: number, total: number) => void
): Promise<void> {
  const count = getQuestionCount();
  if (count === 0) {
    await syncQuestions(onProgress);
  }
}
