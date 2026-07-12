import { Database, type Statement } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "@/db/schema";
import { embeddedMigrations } from "@/db/migrations";

export type Db = BunSQLiteDatabase<typeof schema>;

// drizzle's `migrate()` only reads migrations from a folder, which doesn't
// exist in a compiled binary. The dialect's `migrate(migrations, session)`
// accepts pre-read migrations and owns the `__drizzle_migrations` tracking, so
// we feed it the embedded set instead. `dialect`/`session` are internal props.
type MigratableDb = Db & {
  dialect: {
    migrate: (migrations: ReturnType<typeof embeddedMigrations>, session: unknown) => void;
  };
  session: unknown;
};

let _db: Db | null = null;
let _sqlite: Database | null = null;
let _statements: Statement[] = [];

// Under `bun test` (NODE_ENV=test), every prepared statement is tracked so
// `closeDatabase` can finalize them deterministically. Without this, `close()`
// defers until the statements are GC'd (sqlite3_close_v2 semantics), the file
// handle stays held, and deleting the test's throwaway DB fails with EBUSY on
// Windows. Never enabled for the app: it opens one DB for its whole lifetime
// and never closes, so tracking would only accumulate.
const TRACK_STATEMENTS = process.env.NODE_ENV === "test";

export function openDatabase(dbPath: string): Db {
  if (_db) return _db;

  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  if (TRACK_STATEMENTS) {
    const prepare = sqlite.prepare.bind(sqlite);
    sqlite.prepare = ((...args: Parameters<Database["prepare"]>) => {
      const stmt = prepare(...args);
      _statements.push(stmt);
      return stmt;
    }) as Database["prepare"];
  }

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });

  // Apply any pending migrations on startup (creates tables on a fresh DB).
  const m = _db as MigratableDb;
  m.dialect.migrate(embeddedMigrations(), m.session);

  return _db;
}

export function getDb(): Db {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}

// Close the connection and drop the singleton so the next `openDatabase` opens
// a fresh one. Only used by tests, which open a throwaway DB per case for
// isolation (the app opens exactly one DB for its lifetime). The underlying
// handle must be genuinely closed — Windows refuses to delete a file that is
// still held open (EBUSY), unlike POSIX — so the tracked statements are
// finalized first (see TRACK_STATEMENTS above).
export function closeDatabase(): void {
  for (const stmt of _statements) {
    try {
      stmt.finalize();
    } catch {
      // Already finalized (e.g. collected by GC) — nothing to release.
    }
  }
  _statements = [];
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}
