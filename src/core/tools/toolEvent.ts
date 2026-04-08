import path from 'node:path';

import { logCoreEvent } from '../../services/logger/index.js';

const PREFIX_LEN = 48;
const QUERY_PREVIEW_LEN = 120;

/** Structured tool invocation log (domain `tools`, action = tool name). */
export function logToolEvent(toolName: string, payload: Record<string, unknown>): void {
  logCoreEvent('tools', toolName, payload);
}

export function fileBasename(filePath: string): string {
  return path.basename(filePath);
}

export function textMeta(text: string): { len: number; prefix: string } {
  return { len: text.length, prefix: text.slice(0, PREFIX_LEN) };
}

export function queryPreview(query: string): { queryLen: number; queryPrefix: string } {
  return { queryLen: query.length, queryPrefix: query.slice(0, QUERY_PREVIEW_LEN) };
}
