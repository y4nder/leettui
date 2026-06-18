import { sqliteTable, integer, text, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  titleSlug: text("title_slug").notNull().unique(),
  difficulty: text("difficulty").notNull(),
  paidOnly: integer("paid_only").notNull().default(0),
  status: text("status"),
  acRate: real("ac_rate"),
  lastRuntime: text("last_runtime"),
  lastMemory: text("last_memory"),
});

export const topics = sqliteTable("topics", {
  slug: text("slug").primaryKey(),
});

export const questionTopics = sqliteTable(
  "question_topics",
  {
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topics.slug),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.topicSlug] }),
    index("idx_qt_topic").on(t.topicSlug),
    index("idx_qt_question").on(t.questionId),
  ],
);

// Recently-viewed questions (Stage 20). One row per question, keyed by its stable
// PK; re-viewing bumps `viewed_at` (upsert) so the list is recency-ordered and
// capped (~50, trimmed by the data layer). The `viewed_at` index backs both the
// newest-first read and the cap trim.
export const recents = sqliteTable(
  "recents",
  {
    questionId: integer("question_id")
      .primaryKey()
      .references(() => questions.id),
    viewedAt: integer("viewed_at").notNull(),
  },
  (t) => [index("idx_recents_viewed_at").on(t.viewedAt)],
);
