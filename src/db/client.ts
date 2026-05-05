import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

export function openDb(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

function applySchema(db: DB) {
  const schemaPath = resolve(__dirname, "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  db.exec(sql);
}
