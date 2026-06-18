# db/

SQLite database layer via [Drizzle ORM](https://orm.drizzle.team/docs/connect-bun-sqlite) on the `bun:sqlite` driver. Stores LeetCode problems and topic mappings locally.

## Files

- `schema.ts` — Drizzle table definitions (`questions`, `topics`, `question_topics`, `recents`) using `drizzle-orm/sqlite-core`. TS fields are camelCase mapped to snake_case columns (e.g. `titleSlug: text("title_slug")`). This file is the single source of truth for the schema and the input to `drizzle-kit generate`.
- `index.ts` — `openDatabase(path)` opens `bun:sqlite` with WAL mode + foreign keys, wraps it with `drizzle(sqlite, { schema })`, then applies **embedded** migrations on startup via `db.dialect.migrate(embeddedMigrations(), db.session)` (auto-applies pending migrations). `getDb()` returns the singleton typed `Db` (`BunSQLiteDatabase<typeof schema>`). `closeDatabase()` drops the singleton — **test-only** (each test opens a throwaway DB per case; the app opens exactly one for its lifetime).
- `migrations.ts` — Source of the embedded migration set. The stock `migrate(db, { migrationsFolder })` reads `drizzle/` from disk, which **does not exist in a `bun build --compile` binary**. This module instead imports the journal (JSON) and each `.sql` file as bundled text (`with { type: "text" }`) and rebuilds drizzle's `MigrationMeta[]` in-memory, so migrations travel inside the binary and behave identically in dev and when shipped. See the migration workflow below — keeping `SQL_BY_TAG` current is **mandatory**.
- `questions.ts` — CRUD for the `questions` table, written with the Drizzle query builder. Rows are mapped back to the snake_case `DbQuestion` shape at the boundary (`toDbQuestion`) so consumers are unchanged. Key exports:
  - `getAllQuestions()`, `getQuestionsByTopic(slug)`, `getQuestionBySlug(slug)`, `getTopicsForQuestion(id)` (topic slugs for a question, via the `idx_qt_question` index — backs the problem-view header tags)
  - `upsertQuestion(q)` — insert with `onConflictDoUpdate` on `id`
  - `upsertQuestionTopics(questionId, slugs[])` — `onConflictDoNothing` into both `topics` and `question_topics`
  - `markAccepted(id)`, `markAttempted(id)` (only sets `notac` when status is null), `getQuestionCount()`
  - `setSubmissionStats(id, runtime, memory)` — stores the latest accepted submission's runtime/memory
- `topics.ts` — `getAllTopics()`, `getAllTopicsWithAll()` (prepends virtual "all" topic)
- `recents.ts` — Recently-viewed history (Stage 20), backing the `h` modal. `recordRecent(id, now?, cap?)` upserts a single row keyed by the question PK — re-viewing bumps `viewed_at` (bump-to-top) rather than duplicating — then trims to `cap` (~50, `RECENTS_CAP`) via a `NOT IN` over the top-`cap` subquery. `getRecents()` inner-joins back to `questions` (newest first, so a stale id silently drops), returning `RecentQuestion[]` (a `DbQuestion` plus its `viewedAt` epoch-millis instant so the modal can show *when* it was opened). `now`/`cap` are injectable for deterministic tests (`recents.test.ts`). Reuses `questions.ts`'s exported `toDbQuestion` mapper.

## Migrations

Versioned SQL migration files live in `leettui/drizzle/` (checked into git) with a `meta/` journal. **Every schema change follows these steps in order — this is non-negotiable, because a compiled binary cannot read `drizzle/` from disk:**

1. Edit `schema.ts`.
2. `bun run db:generate` → drizzle-kit writes a new `drizzle/NNNN_<name>.sql` migration and updates the journal.
3. **Embed the new migration in `migrations.ts`** (the step that makes the shipped binary work):
   - Add a static text import: `import mNNNN from "../../drizzle/NNNN_<name>.sql" with { type: "text" };`
   - Add a `"NNNN_<name>": mNNNN` entry to `SQL_BY_TAG`.

   The import path must match the generated filename exactly, and the `SQL_BY_TAG` key must match the journal `tag`. Do **not** skip this — `embeddedMigrations()` throws at startup naming any tag in the journal that has no `SQL_BY_TAG` entry, so a forgotten embed fails fast in dev (and `bun run build` would otherwise ship a binary that crashes on first launch). The import must be **static** (literal path), or Bun won't bundle the file into the `--compile` binary.

4. Verify both modes before shipping:
   - dev: `bun src/index.tsx` (or any run that calls `openDatabase`) applies the migration.
   - binary: `bun run build && ./leettui` from a clean checkout — confirms the embed actually shipped.

Applied migrations are tracked in the `__drizzle_migrations` table, so startup is idempotent. `bun run db:studio` opens a browser DB inspector. Config: `leettui/drizzle.config.ts`. Never hand-edit a generated `.sql` file after embedding — regenerate instead, since `embeddedMigrations()` hashes the SQL text and a drift between the file and an already-applied migration is silent.

> Version note: `drizzle-orm` is pinned to `0.44.4` to match `drizzle-kit` 0.31.x. A newer `drizzle-orm` (0.45.x) produced corrupt generated SQL (duplicated composite-PK columns, wrong index targets) with this drizzle-kit. Bump both together if upgrading.

## Schema

```
questions(id PK, title, title_slug UNIQUE, difficulty, paid_only, status, ac_rate, last_runtime, last_memory)
topics(slug PK)
question_topics(question_id, topic_slug) — M:N join, composite PK, indexed on topic_slug and question_id
recents(question_id PK → questions.id, viewed_at) — recently-viewed history, capped ~50, indexed on viewed_at
```

`last_runtime`/`last_memory` are first-class columns in `schema.ts` (the old runtime `ensureColumn` hack is gone — additive columns now flow through generated migrations).

## Key types

- `DbQuestion` — `{ id, title, title_slug, difficulty, paid_only, status, ac_rate, last_runtime, last_memory }` (snake_case, app-facing)
- `DbTopic` — `{ slug }`
- `Db` (from `index.ts`) — the typed Drizzle instance

## Dependencies

`drizzle-orm` (runtime), `drizzle-kit` (dev, migration generation), `bun:sqlite`, `node:fs`/`node:path`.
