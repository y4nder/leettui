import { eq, and, asc, isNull, sql } from "drizzle-orm";
import { getDb } from "./index";
import { questions, questionTopics, topics } from "./schema";

export interface DbQuestion {
  id: number;
  title: string;
  title_slug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paid_only: number;
  status: string | null;
  ac_rate: number | null;
  last_runtime: string | null;
  last_memory: string | null;
}

// Drizzle infers camelCase fields from the schema; the rest of the app consumes
// the snake_case `DbQuestion` shape, so map at the data-access boundary.
function toDbQuestion(row: typeof questions.$inferSelect): DbQuestion {
  return {
    id: row.id,
    title: row.title,
    title_slug: row.titleSlug,
    difficulty: row.difficulty as DbQuestion["difficulty"],
    paid_only: row.paidOnly,
    status: row.status,
    ac_rate: row.acRate,
    last_runtime: row.lastRuntime,
    last_memory: row.lastMemory,
  };
}

export function getAllQuestions(): DbQuestion[] {
  return getDb()
    .select()
    .from(questions)
    .orderBy(asc(questions.id))
    .all()
    .map(toDbQuestion);
}

export function getQuestionsByTopic(topicSlug: string): DbQuestion[] {
  if (topicSlug === "all") return getAllQuestions();

  return getDb()
    .select()
    .from(questions)
    .innerJoin(questionTopics, eq(questions.id, questionTopics.questionId))
    .where(eq(questionTopics.topicSlug, topicSlug))
    .orderBy(asc(questions.id))
    .all()
    .map((row) => toDbQuestion(row.questions));
}

export function getQuestionBySlug(slug: string): DbQuestion | null {
  const row = getDb()
    .select()
    .from(questions)
    .where(eq(questions.titleSlug, slug))
    .get();
  return row ? toDbQuestion(row) : null;
}

export function upsertQuestion(q: {
  id: number;
  title: string;
  titleSlug: string;
  difficulty: string;
  paidOnly: boolean;
  status: string | null;
  acRate: number | null;
}): void {
  const values = {
    id: q.id,
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty,
    paidOnly: q.paidOnly ? 1 : 0,
    status: q.status,
    acRate: q.acRate,
  };

  getDb()
    .insert(questions)
    .values(values)
    .onConflictDoUpdate({
      target: questions.id,
      set: {
        title: values.title,
        titleSlug: values.titleSlug,
        difficulty: values.difficulty,
        paidOnly: values.paidOnly,
        status: values.status,
        acRate: values.acRate,
      },
    })
    .run();
}

export function upsertQuestionTopics(
  questionId: number,
  topicSlugs: string[]
): void {
  const db = getDb();
  for (const slug of topicSlugs) {
    db.insert(topics).values({ slug }).onConflictDoNothing().run();
    db.insert(questionTopics)
      .values({ questionId, topicSlug: slug })
      .onConflictDoNothing()
      .run();
  }
}

export function markAccepted(questionId: number): void {
  getDb()
    .update(questions)
    .set({ status: "ac" })
    .where(eq(questions.id, questionId))
    .run();
}

// Records the runtime/memory of the latest accepted submission so the question
// list can surface a problem's best-known stats at a glance.
export function setSubmissionStats(
  questionId: number,
  runtime: string | null,
  memory: string | null
): void {
  getDb()
    .update(questions)
    .set({ lastRuntime: runtime, lastMemory: memory })
    .where(eq(questions.id, questionId))
    .run();
}

export function markAttempted(questionId: number): void {
  getDb()
    .update(questions)
    .set({ status: "notac" })
    .where(and(eq(questions.id, questionId), isNull(questions.status)))
    .run();
}

export function getQuestionCount(): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(questions)
    .get();
  return row?.count ?? 0;
}

export interface StatusCounts {
  solved: number;
  attempted: number;
  total: number;
}

export function getStatusCounts(): StatusCounts {
  const row = getDb()
    .select({
      solved: sql<number>`SUM(CASE WHEN ${questions.status} = 'ac' THEN 1 ELSE 0 END)`,
      attempted: sql<number>`SUM(CASE WHEN ${questions.status} = 'notac' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(questions)
    .get();
  return {
    solved: row?.solved ?? 0,
    attempted: row?.attempted ?? 0,
    total: row?.total ?? 0,
  };
}
