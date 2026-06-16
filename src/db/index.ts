import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { embeddedMigrations } from "./migrations";

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

export function openDatabase(dbPath: string): Db {
  if (_db) return _db;

  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

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
