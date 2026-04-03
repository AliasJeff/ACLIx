import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import type { ModelMessage as CoreMessage } from 'ai';

interface SqliteStatement {
  get: (cwd: string) => { messages: string } | undefined;
  run: (cwd: string, messages?: string) => unknown;
}

interface SqliteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  pragma: (value: string) => unknown;
}

type BetterSqlite3Constructor = new (filename: string) => SqliteDatabase;

const require = createRequire(import.meta.url);

let db: SqliteDatabase | undefined;

function getDb(): SqliteDatabase {
  if (db) {
    return db;
  }

  const dbPath = path.join(os.homedir(), '.aclix', 'acli.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Lazy-load for performance: do NOT import better-sqlite3 at module top-level.
  const Database = require('better-sqlite3') as unknown as BetterSqlite3Constructor;
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.exec(
    'CREATE TABLE IF NOT EXISTS sessions (cwd TEXT PRIMARY KEY, messages JSON, updated_at DATETIME)',
  );

  return db;
}

export function loadSession(cwd: string): CoreMessage[] {
  const row = getDb()
    .prepare('SELECT messages FROM sessions WHERE cwd = ?')
    .get(cwd);

  if (!row?.messages) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(row.messages);
    return Array.isArray(parsed) ? (parsed as CoreMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(cwd: string, messages: CoreMessage[]): void {
  const payload = JSON.stringify(messages);
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO sessions (cwd, messages, updated_at) VALUES (?, ?, datetime('now'))",
    )
    .run(cwd, payload);
}

export function clearSession(cwd: string): void {
  getDb().prepare('DELETE FROM sessions WHERE cwd = ?').run(cwd);
}
