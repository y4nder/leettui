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

  return _db;
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}
