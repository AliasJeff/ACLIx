import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import type { ModelMessage as CoreMessage } from 'ai';

import { maskSensitiveData } from '../../core/security/masking.js';
import { errorLogger } from '../logger/index.js';

interface SqliteStatement {
  // Keep this generic so new queries don't require widening types everywhere.
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
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
  db.exec(
    [
      'CREATE TABLE IF NOT EXISTS file_snapshots (',
      'id INTEGER PRIMARY KEY AUTOINCREMENT,',
      'cwd TEXT,',
      'file_path TEXT,',
      'content TEXT,',
      'is_new INTEGER,',
      'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
      ')',
    ].join(' '),
  );

  return db;
}

export function loadSession(cwd: string): CoreMessage[] {
  const row = getDb()
    .prepare('SELECT messages FROM sessions WHERE cwd = ?')
    .get(cwd);

  if (!row || typeof row !== 'object' || !('messages' in row) || typeof row.messages !== 'string') {
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
  const payloadRaw = JSON.stringify(messages);
  const payload = maskSensitiveData(payloadRaw);
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO sessions (cwd, messages, updated_at) VALUES (?, ?, datetime('now'))",
    )
    .run(cwd, payload);
}

export function clearSession(cwd: string): void {
  getDb().prepare('DELETE FROM sessions WHERE cwd = ?').run(cwd);
}

export interface SnapshotRecord {
  id: number;
  cwd: string;
  file_path: string;
  content: string | null;
  is_new: 0 | 1;
  created_at: string;
}

export function saveSnapshot(cwd: string, filePath: string, content: string | null): void {
  const isNew = content === null ? 1 : 0;

  try {
    getDb()
      .prepare(
        'INSERT INTO file_snapshots (cwd, file_path, content, is_new) VALUES (?, ?, ?, ?)',
      )
      .run(cwd, filePath, content, isNew);
  } catch (error) {
    errorLogger.error({ cwd, filePath, error }, 'Failed to save file snapshot');
  }
}

export function popLatestSnapshot(cwd: string): SnapshotRecord | null {
  const database = getDb();

  try {
    database.exec('BEGIN IMMEDIATE');

    const row = database
      .prepare(
        'SELECT id, cwd, file_path, content, is_new, created_at FROM file_snapshots WHERE cwd = ? ORDER BY id DESC LIMIT 1',
      )
      .get(cwd);

    if (!row || typeof row !== 'object') {
      database.exec('COMMIT');
      return null;
    }

    const record = row as SnapshotRecord;

    database.prepare('DELETE FROM file_snapshots WHERE id = ?').run(record.id);
    database.exec('COMMIT');

    // Normalize is_new to 0/1 (SQLite may return any integer-like value).
    return {
      ...record,
      is_new: record.is_new === 1 ? 1 : 0,
      content: record.content ?? null,
    };
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (rollbackError) {
      errorLogger.error({ cwd, error: rollbackError }, 'Failed to rollback snapshot pop');
    }

    errorLogger.error({ cwd, error }, 'Failed to pop latest file snapshot');
    return null;
  }
}
