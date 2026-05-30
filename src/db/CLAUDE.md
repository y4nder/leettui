# db/

SQLite database layer via [Drizzle ORM](https://orm.drizzle.team/docs/connect-bun-sqlite) on the `bun:sqlite` driver. Stores LeetCode problems and topic mappings locally.

## Files

- `schema.ts` — Drizzle table definitions (`questions`, `topics`, `question_topics`) using `drizzle-orm/sqlite-core`. TS fields are camelCase mapped to snake_case columns (e.g. `titleSlug: text("title_slug")`). This file is the single source of truth for the schema and the input to `drizzle-kit generate`.
- `index.ts` — `openDatabase(path)` opens `bun:sqlite` with WAL mode + foreign keys, wraps it with `drizzle(sqlite, { schema })`, then runs `migrate()` from `drizzle-orm/bun-sqlite/migrator` (auto-applies pending migrations on startup). `getDb()` returns the singleton typed `Db` (`BunSQLiteDatabase<typeof schema>`).
- `questions.ts` — CRUD for the `questions` table, written with the Drizzle query builder. Rows are mapped back to the snake_case `DbQuestion` shape at the boundary (`toDbQuestion`) so consumers are unchanged. Key exports:
  - `getAllQuestions()`, `getQuestionsByTopic(slug)`, `getQuestionBySlug(slug)`
  - `upsertQuestion(q)` — insert with `onConflictDoUpdate` on `id`
  - `upsertQuestionTopics(questionId, slugs[])` — `onConflictDoNothing` into both `topics` and `question_topics`
  - `markAccepted(id)`, `markAttempted(id)` (only sets `notac` when status is null), `getQuestionCount()`
  - `setSubmissionStats(id, runtime, memory)` — stores the latest accepted submission's runtime/memory
- `topics.ts` — `getAllTopics()`, `getAllTopicsWithAll()` (prepends virtual "all" topic)

## Migrations

Versioned SQL migration files live in `leettui/drizzle/` (checked into git) with a `meta/` journal. Workflow for any schema change:

1. Edit `schema.ts`.
2. `bun run db:generate` → drizzle-kit writes a new `drizzle/NNNN_*.sql` migration.
3. Next app launch (or `bun run db:migrate`) auto-applies pending migrations via `migrate()`.

Applied migrations are tracked in the `__drizzle_migrations` table, so startup is idempotent. `bun run db:studio` opens a browser DB inspector. Config: `leettui/drizzle.config.ts`.

> Version note: `drizzle-orm` is pinned to `0.44.4` to match `drizzle-kit` 0.31.x. A newer `drizzle-orm` (0.45.x) produced corrupt generated SQL (duplicated composite-PK columns, wrong index targets) with this drizzle-kit. Bump both together if upgrading.

## Schema

```
questions(id PK, title, title_slug UNIQUE, difficulty, paid_only, status, ac_rate, last_runtime, last_memory)
topics(slug PK)
question_topics(question_id, topic_slug) — M:N join, composite PK, indexed on topic_slug and question_id
```

`last_runtime`/`last_memory` are first-class columns in `schema.ts` (the old runtime `ensureColumn` hack is gone — additive columns now flow through generated migrations).

## Key types

- `DbQuestion` — `{ id, title, title_slug, difficulty, paid_only, status, ac_rate, last_runtime, last_memory }` (snake_case, app-facing)
- `DbTopic` — `{ slug }`
- `Db` (from `index.ts`) — the typed Drizzle instance

## Dependencies

`drizzle-orm` (runtime), `drizzle-kit` (dev, migration generation), `bun:sqlite`, `node:fs`/`node:path`.
