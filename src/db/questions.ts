import { getDb } from "./index";

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

export function getAllQuestions(): DbQuestion[] {
  return getDb()
    .query("SELECT * FROM questions ORDER BY id")
    .all() as DbQuestion[];
}

export function getQuestionsByTopic(topicSlug: string): DbQuestion[] {
  if (topicSlug === "all") return getAllQuestions();

  return getDb()
    .query(
      `SELECT q.* FROM questions q
       JOIN question_topics qt ON q.id = qt.question_id
       WHERE qt.topic_slug = ?
       ORDER BY q.id`
    )
    .all(topicSlug) as DbQuestion[];
}

export function getQuestionBySlug(slug: string): DbQuestion | null {
  return getDb()
    .query("SELECT * FROM questions WHERE title_slug = ?")
    .get(slug) as DbQuestion | null;
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
  getDb()
    .query(
      `INSERT INTO questions (id, title, title_slug, difficulty, paid_only, status, ac_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         title_slug = excluded.title_slug,
         difficulty = excluded.difficulty,
         paid_only = excluded.paid_only,
         status = excluded.status,
         ac_rate = excluded.ac_rate`
    )
    .run(
      q.id,
      q.title,
      q.titleSlug,
      q.difficulty,
      q.paidOnly ? 1 : 0,
      q.status,
      q.acRate
    );
}

export function upsertQuestionTopics(
  questionId: number,
  topicSlugs: string[]
): void {
  const db = getDb();
  const insertTopic = db.query(
    "INSERT OR IGNORE INTO topics (slug) VALUES (?)"
  );
  const insertMapping = db.query(
    "INSERT OR IGNORE INTO question_topics (question_id, topic_slug) VALUES (?, ?)"
  );

  for (const slug of topicSlugs) {
    insertTopic.run(slug);
    insertMapping.run(questionId, slug);
  }
}

export function markAccepted(questionId: number): void {
  getDb()
    .query("UPDATE questions SET status = 'ac' WHERE id = ?")
    .run(questionId);
}

// Records the runtime/memory of the latest accepted submission so the question
// list can surface a problem's best-known stats at a glance.
export function setSubmissionStats(
  questionId: number,
  runtime: string | null,
  memory: string | null
): void {
  getDb()
    .query("UPDATE questions SET last_runtime = ?, last_memory = ? WHERE id = ?")
    .run(runtime, memory, questionId);
}

export function markAttempted(questionId: number): void {
  getDb()
    .query(
      "UPDATE questions SET status = 'notac' WHERE id = ? AND status IS NULL"
    )
    .run(questionId);
}

export function getQuestionCount(): number {
  const row = getDb()
    .query("SELECT COUNT(*) as count FROM questions")
    .get() as { count: number };
  return row.count;
}

export interface StatusCounts {
  solved: number;
  attempted: number;
  total: number;
}

export function getStatusCounts(): StatusCounts {
  const row = getDb()
    .query(
      `SELECT
         SUM(CASE WHEN status = 'ac' THEN 1 ELSE 0 END) as solved,
         SUM(CASE WHEN status = 'notac' THEN 1 ELSE 0 END) as attempted,
         COUNT(*) as total
       FROM questions`
    )
    .get() as { solved: number | null; attempted: number | null; total: number };
  return {
    solved: row.solved ?? 0,
    attempted: row.attempted ?? 0,
    total: row.total,
  };
}
