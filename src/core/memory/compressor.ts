import type { ModelMessage as CoreMessage } from 'ai';
import { z } from 'zod';

import { appLogger, logCoreEvent } from '../../services/logger/index.js';
import type { LLMProvider } from '../../services/llm/provider.js';
import { countMessageTokens } from './tokenizer.js';

const TRUNCATE_SUFFIX = '\n... [Output truncated by ContextCompressor to save tokens]';
const LONG_OUTPUT_THRESHOLD = 1000;
const KEEP_OUTPUT_CHARS = 500;

const summarySchema = z.object({ summary: z.string() });

const SUMMARY_SYSTEM_PROMPT =
  'You are a precise assistant. Respond only with valid structured output matching the schema.';

const SUMMARY_USER_INSTRUCTION =
  'Summarize the following conversation history briefly. Focus on the user\'s main goals, key completed actions, and current system state.';

function cloneMessages(messages: CoreMessage[]): CoreMessage[] {
  try {
    return structuredClone(messages);
  } catch {
    return JSON.parse(JSON.stringify(messages)) as CoreMessage[];
  }
}

function middleSliceRange(messages: CoreMessage[]): { start: number; end: number } {
  const messageCount = messages.length;
  const prefixEnd = messages[0]?.role === 'system' ? 1 : 0;
  const suffixLen = Math.min(6, messageCount);
  const suffixStart = messageCount - suffixLen;
  return { start: prefixEnd, end: suffixStart };
}

function collectToolPairIds(message: CoreMessage, calls: Set<string>, results: Set<string>): void {
  if (message.role === 'assistant' && typeof message.content !== 'string') {
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        calls.add(part.toolCallId);
      }
    }
  }
  if (message.role === 'tool') {
    for (const part of message.content) {
      if (part.type === 'tool-result') {
        results.add(part.toolCallId);
      }
    }
  }
}

function isSelfContainedToolSegment(messages: CoreMessage[], from: number, to: number): boolean {
  if (from >= to) {
    return false;
  }
  const calls = new Set<string>();
  const results = new Set<string>();
  for (let i = from; i < to; i++) {
    const msg = messages[i];
    if (msg === undefined) {
      continue;
    }
    collectToolPairIds(msg, calls, results);
  }
  if (calls.size !== results.size) {
    return false;
  }
  for (const id of calls) {
    if (!results.has(id)) {
      return false;
    }
  }
  for (const id of results) {
    if (!calls.has(id)) {
      return false;
    }
  }
  return true;
}

/** Largest `to` in (from, limit] such that [from, to) is tool-call/result self-contained. */
function findMaxSelfContainedEnd(messages: CoreMessage[], from: number, limit: number): number {
  if (from >= limit) {
    return from;
  }
  for (let to = limit; to > from; to--) {
    if (isSelfContainedToolSegment(messages, from, to)) {
      return to;
    }
  }
  return from;
}

function truncateToolResultOutputInPlace(output: unknown): void {
  if (output === null || output === undefined || typeof output !== 'object') {
    return;
  }
  const o = output as Record<string, unknown>;
  const t = o.type;
  if (t === 'text' || t === 'error-text') {
    if (typeof o.value === 'string' && o.value.length > LONG_OUTPUT_THRESHOLD) {
      o.value = `${o.value.slice(0, KEEP_OUTPUT_CHARS)}${TRUNCATE_SUFFIX}`;
    }
    return;
  }
  if (t === 'json' || t === 'error-json') {
    const raw = JSON.stringify(o.value);
    if (raw.length > LONG_OUTPUT_THRESHOLD) {
      o.type = 'text';
      o.value = `${raw.slice(0, KEEP_OUTPUT_CHARS)}${TRUNCATE_SUFFIX}`;
    }
    return;
  }
  if (t === 'execution-denied') {
    if (typeof o.reason === 'string' && o.reason.length > LONG_OUTPUT_THRESHOLD) {
      o.reason = `${o.reason.slice(0, KEEP_OUTPUT_CHARS)}${TRUNCATE_SUFFIX}`;
    }
    return;
  }
  if (t === 'content') {
    const raw = JSON.stringify(o.value);
    if (raw.length > LONG_OUTPUT_THRESHOLD) {
      o.type = 'text';
      o.value = `${raw.slice(0, KEEP_OUTPUT_CHARS)}${TRUNCATE_SUFFIX}`;
    }
  }
}

function phase1TruncateMiddleToolResults(working: CoreMessage[], start: number, end: number): void {
  for (let i = start; i < end; i++) {
    const m = working[i];
    if (m?.role !== 'tool') {
      continue;
    }
    for (const part of m.content) {
      if (part.type !== 'tool-result') {
        continue;
      }
      const legacy = part as { result?: unknown; output?: unknown };
      if (typeof legacy.result === 'string' && legacy.result.length > LONG_OUTPUT_THRESHOLD) {
        legacy.result = `${legacy.result.slice(0, KEEP_OUTPUT_CHARS)}${TRUNCATE_SUFFIX}`;
      }
      truncateToolResultOutputInPlace(legacy.output);
    }
  }
}

function serializeMessagesForSummary(messages: CoreMessage[]): string {
  try {
    return JSON.stringify(messages, (_key, value: unknown) => (value instanceof URL ? value.toString() : value));
  } catch {
    return messages
      .map(m => {
        try {
          return JSON.stringify(m);
        } catch {
          return '';
        }
      })
      .join('\n---\n');
  }
}

/** Namespace-style API with a single entrypoint (static `compress`). */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- spec requires a class with static method
export class ContextCompressor {
  static async rollingCompress(
    messages: CoreMessage[],
    keepRecent: number,
    provider: LLMProvider,
  ): Promise<CoreMessage[]> {
    logCoreEvent('memory', 'ContextCompressor.rollingCompress', {
      messageCount: messages.length,
      keepRecent,
    });
    if (keepRecent < 0) {
      throw new Error('keepRecent must be non-negative');
    }

    const total = messages.length;
    if (total <= keepRecent + 5) {
      return messages;
    }

    const splitIndex = total - keepRecent;
    const safeEnd = findMaxSelfContainedEnd(messages, 0, splitIndex);

    if (safeEnd <= 0) {
      return messages;
    }

    const toCompress = messages.slice(0, safeEnd);
    const recent = messages.slice(safeEnd);
    const serialized = serializeMessagesForSummary(toCompress);

    try {
      const { summary } = await provider.generateStructured(
        `${SUMMARY_USER_INSTRUCTION}\n\n${serialized}`,
        SUMMARY_SYSTEM_PROMPT,
        summarySchema,
      );

      const summaryMessage: CoreMessage = {
        role: 'assistant',
        content: `[Historical Context Summary]\n${summary}`,
      };

      const combined = [summaryMessage, ...recent];

      appLogger.info(
        {
          scope: 'context',
          phase: 'rolling',
          totalMessagesBefore: total,
          totalMessagesAfter: combined.length,
          keepRecent,
          compressedCount: toCompress.length,
        },
        'ContextCompressor: rolling compression applied',
      );

      return combined;
    } catch (error) {
      appLogger.info(
        {
          scope: 'context',
          phase: 'rolling_failed',
          totalMessagesBefore: total,
          keepRecent,
          compressedCount: toCompress.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'ContextCompressor: rolling compression failed; returning original messages',
      );

      return messages;
    }
  }

  static async compress(
    messages: CoreMessage[],
    maxTokens: number,
    targetTokens: number,
    provider: LLMProvider,
  ): Promise<CoreMessage[]> {
    logCoreEvent('memory', 'ContextCompressor.compress', {
      messageCount: messages.length,
      maxTokens,
      targetTokens,
    });
    const tokensBefore = countMessageTokens(messages);

    if (messages.length === 0) {
      appLogger.info(
        { scope: 'context', phase: 'noop', tokensBefore: 0, tokensAfter: 0, reduction: 0 },
        'ContextCompressor: empty messages',
      );
      return [];
    }

    let working = cloneMessages(messages);
    let tokens = countMessageTokens(working);

    if (tokens <= targetTokens) {
      appLogger.info(
        { scope: 'context', phase: 'noop', tokensBefore, tokensAfter: tokens, reduction: 0 },
        'ContextCompressor: already within target token budget',
      );
      return working;
    }

    let ranPhase1 = false;

    if (tokens > maxTokens) {
      const { start, end } = middleSliceRange(working);
      if (start < end) {
        phase1TruncateMiddleToolResults(working, start, end);
        ranPhase1 = true;
      }
      tokens = countMessageTokens(working);
    }

    const tokensAfterPhase1 = tokens;

    if (tokens <= targetTokens) {
      const reduction = tokensBefore - tokens;
      appLogger.info(
        {
          scope: 'context',
          phase: ranPhase1 ? 'phase1' : 'noop',
          tokensBefore,
          tokensAfter: tokens,
          reduction,
          tokensAfterPhase1,
        },
        'ContextCompressor: within target after Phase 1 or no compression needed',
      );
      return working;
    }

    const { start: midStart, end: midEnd } = middleSliceRange(working);
    if (midStart >= midEnd) {
      const reduction = tokensBefore - tokens;
      appLogger.info(
        {
          scope: 'context',
          phase: ranPhase1 ? 'phase1' : 'noop',
          tokensBefore,
          tokensAfter: tokens,
          reduction,
          reason: 'no_middle_slice',
        },
        'ContextCompressor: cannot run Phase 2 (no middle segment)',
      );
      return working;
    }

    const extractTo = findMaxSelfContainedEnd(working, midStart, midEnd);
    if (extractTo <= midStart) {
      const reduction = tokensBefore - tokens;
      appLogger.info(
        {
          scope: 'context',
          phase: ranPhase1 ? 'phase1' : 'noop',
          tokensBefore,
          tokensAfter: tokens,
          reduction,
          reason: 'no_safe_extract_block',
        },
        'ContextCompressor: Phase 2 skipped (no self-contained block in middle)',
      );
      return working;
    }

    const extracted = working.slice(midStart, extractTo);
    const serialized = serializeMessagesForSummary(extracted);

    try {
      const { summary } = await provider.generateStructured(
        `${SUMMARY_USER_INSTRUCTION}\n\n${serialized}`,
        SUMMARY_SYSTEM_PROMPT,
        summarySchema,
      );

      const replacement: CoreMessage = {
        role: 'assistant',
        content: `[Historical Context Summary]\n${summary}`,
      };

      working = [...working.slice(0, midStart), replacement, ...working.slice(extractTo)];
      const tokensAfter = countMessageTokens(working);
      const reduction = tokensBefore - tokensAfter;

      appLogger.info(
        {
          scope: 'context',
          phase: 'phase2',
          tokensBefore,
          tokensAfterPhase1,
          tokensAfter,
          reduction,
          extractedMessageCount: extracted.length,
        },
        'ContextCompressor: Phase 2 semantic compression applied',
      );

      return working;
    } catch (error) {
      const reduction = tokensBefore - tokens;
      appLogger.info(
        {
          scope: 'context',
          phase: 'phase2_failed',
          ranPhase1,
          tokensBefore,
          tokensAfter: tokens,
          reduction,
          error: error instanceof Error ? error.message : String(error),
        },
        'ContextCompressor: Phase 2 failed; returning Phase 1 output',
      );
      return working;
    }
  }
}
