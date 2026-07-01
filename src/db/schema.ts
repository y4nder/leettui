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
  // D-07 cursor anchor: resume marker for an interrupted backfill run and the
  // high-water mark for a completed one. Unix milliseconds, nullable (never
  // backfilled yet = null).
  submissionsFetchedAt: integer("submissions_fetched_at"),
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

// Per-attempt submission history (Phase 1: submission store & backfill). Keyed
// by LeetCode's own `submissionId` so re-inserts (backfill re-runs, retries)
// are naturally idempotent via onConflictDoNothing. Stores every verdict
// (AC/WA/TLE/CE/RE/MLE) — `statusDisplay` is free text per D-08, the superset
// Phase 2's per-problem panel and Phase 3's dashboard read. `lang` is the API
// langSlug (e.g. "python3"), not a human-readable name. `submittedAt` is unix
// milliseconds (the API returns seconds — multiply by 1000 at insert), same
// convention as `recents.viewedAt`. `runtimePercentile`/`memoryPercentile` are
// only populated for live submits (CheckResponse); null for backfilled rows.
export const submissions = sqliteTable(
  "submissions",
  {
    submissionId: integer("submission_id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    titleSlug: text("title_slug").notNull(),
    lang: text("lang").notNull(),
    statusDisplay: text("status_display").notNull(),
    runtime: text("runtime"),
    memory: text("memory"),
    submittedAt: integer("submitted_at").notNull(),
    runtimePercentile: real("runtime_percentile"),
    memoryPercentile: real("memory_percentile"),
  },
  (t) => [
    index("idx_sub_question_time").on(t.questionId, t.submittedAt),
    index("idx_sub_submitted_at").on(t.submittedAt),
  ],
);
