export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS questions (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    title_slug TEXT NOT NULL UNIQUE,
    difficulty TEXT NOT NULL,
    paid_only  INTEGER NOT NULL DEFAULT 0,
    status     TEXT,
    ac_rate    REAL
  )`,
  `CREATE TABLE IF NOT EXISTS topics (
    slug TEXT PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS question_topics (
    question_id INTEGER NOT NULL REFERENCES questions(id),
    topic_slug  TEXT NOT NULL REFERENCES topics(slug),
    PRIMARY KEY (question_id, topic_slug)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_qt_topic ON question_topics(topic_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_qt_question ON question_topics(question_id)`,
];
