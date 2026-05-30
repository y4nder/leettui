# db/

SQLite database layer via `bun:sqlite`. Stores LeetCode problems and topic mappings locally.

## Files

- `schema.ts` — `MIGRATIONS` array of CREATE TABLE/INDEX statements. Run on every startup (all use IF NOT EXISTS).
- `index.ts` — `openDatabase(path)` initializes SQLite with WAL mode and foreign keys, runs `MIGRATIONS`, then `ensureColumn()` for additive columns (`last_runtime`/`last_memory`) — guarded against the live column set since `ALTER TABLE ADD COLUMN` is not idempotent. `getDb()` returns the singleton.
- `questions.ts` — CRUD for the `questions` table. Key exports:
  - `getAllQuestions()`, `getQuestionsByTopic(slug)`, `getQuestionBySlug(slug)`
  - `upsertQuestion(q)` — INSERT OR REPLACE
  - `upsertQuestionTopics(questionId, slugs[])` — inserts into both `topics` and `question_topics`
  - `markAccepted(id)`, `markAttempted(id)`, `getQuestionCount()`
  - `setSubmissionStats(id, runtime, memory)` — stores the latest accepted submission's runtime/memory
- `topics.ts` — `getAllTopics()`, `getAllTopicsWithAll()` (prepends virtual "all" topic)

## Schema

```
questions(id PK, title, title_slug UNIQUE, difficulty, paid_only, status, ac_rate, last_runtime, last_memory)
topics(slug PK)
question_topics(question_id, topic_slug) — M:N join, indexed on topic_slug
```

`last_runtime`/`last_memory` are added via `ensureColumn` in `index.ts`, not the `MIGRATIONS` array.

## Key types

- `DbQuestion` — `{ id, title, title_slug, difficulty, paid_only, status, ac_rate, last_runtime, last_memory }`
- `DbTopic` — `{ slug }`

## Dependencies

None (only `bun:sqlite` and `node:fs`/`node:path`).
