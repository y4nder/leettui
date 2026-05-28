# db/

SQLite database layer via `bun:sqlite`. Stores LeetCode problems and topic mappings locally.

## Files

- `schema.ts` — `MIGRATIONS` array of CREATE TABLE/INDEX statements. Run on every startup (all use IF NOT EXISTS).
- `index.ts` — `openDatabase(path)` initializes SQLite with WAL mode and foreign keys. `getDb()` returns the singleton.
- `questions.ts` — CRUD for the `questions` table. Key exports:
  - `getAllQuestions()`, `getQuestionsByTopic(slug)`, `getQuestionBySlug(slug)`
  - `upsertQuestion(q)` — INSERT OR REPLACE
  - `upsertQuestionTopics(questionId, slugs[])` — inserts into both `topics` and `question_topics`
  - `markAccepted(id)`, `markAttempted(id)`, `getQuestionCount()`
- `topics.ts` — `getAllTopics()`, `getAllTopicsWithAll()` (prepends virtual "all" topic)

## Schema

```
questions(id PK, title, title_slug UNIQUE, difficulty, paid_only, status, ac_rate)
topics(slug PK)
question_topics(question_id, topic_slug) — M:N join, indexed on topic_slug
```

## Key types

- `DbQuestion` — `{ id, title, title_slug, difficulty, paid_only, status, ac_rate }`
- `DbTopic` — `{ slug }`

## Dependencies

None (only `bun:sqlite` and `node:fs`/`node:path`).
