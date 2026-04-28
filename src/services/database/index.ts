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
  all: (...params: unknown[]) => unknown[];
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
  db.exec(
    'CREATE TABLE IF NOT EXISTS tool_outputs (id TEXT PRIMARY KEY, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, cwd TEXT, title TEXT, status TEXT, dependencies TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
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

export function saveToolOutput(id: string, content: string): void {
  try {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO tool_outputs (id, content, created_at) VALUES (?, ?, datetime('now'))",
      )
      .run(id, content);
  } catch (error) {
    errorLogger.error({ id, error }, 'Failed to save tool output');
  }
}

export function getToolOutput(id: string): string | null {
  try {
    const row = getDb().prepare('SELECT content FROM tool_outputs WHERE id = ?').get(id);
    if (!row || typeof row !== 'object' || !('content' in row)) {
      return null;
    }
    return typeof row.content === 'string' ? row.content : null;
  } catch (error) {
    errorLogger.error({ id, error }, 'Failed to load tool output');
    return null;
  }
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  cwd: string;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  created_at: string;
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === 'in_progress' || value === 'completed' || value === 'failed') {
    return value;
  }
  return 'pending';
}

function parseDependencies(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function saveTask(
  id: string,
  cwd: string,
  title: string,
  status: TaskStatus,
  dependencies: string[],
): void {
  try {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO tasks (id, cwd, title, status, dependencies, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      )
      .run(id, cwd, title, status, JSON.stringify(dependencies));
  } catch (error) {
    errorLogger.error({ id, cwd, error }, 'Failed to save task');
  }
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  try {
    getDb().prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  } catch (error) {
    errorLogger.error({ id, error }, 'Failed to update task status');
  }
}

export function getActiveTaskGraph(cwd: string): TaskRecord[] {
  try {
    const rows = getDb()
      .prepare(
        "SELECT id, cwd, title, status, dependencies, created_at FROM tasks WHERE cwd = ? AND status != 'completed' ORDER BY created_at ASC, id ASC",
      )
      .all(cwd);

    return rows
      .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
      .map((row) => ({
        id: typeof row.id === 'string' ? row.id : '',
        cwd: typeof row.cwd === 'string' ? row.cwd : cwd,
        title: typeof row.title === 'string' ? row.title : '',
        status: normalizeTaskStatus(row.status),
        dependencies: parseDependencies(row.dependencies),
        created_at: typeof row.created_at === 'string' ? row.created_at : '',
      }))
      .filter((row) => row.id.length > 0);
  } catch (error) {
    errorLogger.error({ cwd, error }, 'Failed to load active task graph');
    return [];
  }
}
