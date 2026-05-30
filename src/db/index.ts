import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { MIGRATIONS } from "./schema";

let _db: Database | null = null;

export function openDatabase(dbPath: string): Database {
  if (_db) return _db;

  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");

  for (const sql of MIGRATIONS) {
    _db.exec(sql);
  }

  // Additive columns introduced after the initial schema. `ALTER TABLE ... ADD
  // COLUMN` is not idempotent, so guard each against the live column set.
  ensureColumn(_db, "questions", "last_runtime", "TEXT");
  ensureColumn(_db, "questions", "last_memory", "TEXT");

  return _db;
}

function ensureColumn(db: Database, table: string, column: string, type: string): void {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}
