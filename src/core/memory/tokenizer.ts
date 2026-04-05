import type { ModelMessage as CoreMessage } from 'ai';
import { getEncoding, type Tiktoken } from 'js-tiktoken';

/** GPT-4o family (OpenAI `o200k_base`). Lazily initialized; failures are cached. */
let o200kEncoding: Tiktoken | null | undefined;

function getO200kEncoding(): Tiktoken | null {
  if (o200kEncoding !== undefined) {
    return o200kEncoding;
  }
  try {
    o200kEncoding = getEncoding('o200k_base');
    return o200kEncoding;
  } catch {
    o200kEncoding = null;
    return null;
  }
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function appendToolResultOutput(chunks: string[], output: unknown): void {
  if (output === null || output === undefined) {
    return;
  }
  if (typeof output !== 'object') {
    chunks.push(stringifyUnknown(output));
    return;
  }
  const o = output as Record<string, unknown>;
  const t = o.type;
  if (t === 'text' || t === 'error-text') {
    chunks.push(typeof o.value === 'string' ? o.value : stringifyUnknown(o.value));
    return;
  }
  if (t === 'json' || t === 'error-json') {
    chunks.push(stringifyUnknown(o.value));
    return;
  }
  if (t === 'execution-denied') {
    if (typeof o.reason === 'string') {
      chunks.push(o.reason);
    }
    chunks.push(stringifyUnknown(output));
    return;
  }
  if (t === 'content' && Array.isArray(o.value)) {
    for (const item of o.value) {
      appendContentPart(chunks, item);
    }
    return;
  }
  chunks.push(stringifyUnknown(output));
}

function appendContentPart(chunks: string[], part: unknown): void {
  if (part === null || part === undefined) {
    return;
  }
  if (typeof part !== 'object') {
    chunks.push(stringifyUnknown(part));
    return;
  }
  const p = part as Record<string, unknown>;
  const ty = p.type;
  if (ty === 'text' || ty === 'reasoning') {
    chunks.push(typeof p.text === 'string' ? p.text : stringifyUnknown(part));
    return;
  }
  if (ty === 'tool-call') {
    chunks.push(
      typeof p.toolName === 'string' ? p.toolName : stringifyUnknown(p.toolName),
      typeof p.toolCallId === 'string' ? p.toolCallId : stringifyUnknown(p.toolCallId),
      stringifyUnknown(p.input),
    );
    return;
  }
  if (ty === 'tool-result') {
    chunks.push(
      typeof p.toolName === 'string' ? p.toolName : stringifyUnknown(p.toolName),
      typeof p.toolCallId === 'string' ? p.toolCallId : stringifyUnknown(p.toolCallId),
    );
    appendToolResultOutput(chunks, p.output);
    return;
  }
  if (ty === 'tool-approval-request' || ty === 'tool-approval-response') {
    chunks.push(stringifyUnknown(part));
    return;
  }
  chunks.push(stringifyUnknown(part));
}

function appendMessagePayload(chunks: string[], message: CoreMessage): void {
  chunks.push(message.role);
  if (message.role === 'system') {
    chunks.push(message.content);
    return;
  }
  if (message.role === 'user' || message.role === 'assistant') {
    const { content } = message;
    if (typeof content === 'string') {
      chunks.push(content);
    } else {
      for (const part of content) {
        appendContentPart(chunks, part);
      }
    }
    return;
  }
  for (const part of message.content) {
    appendContentPart(chunks, part);
  }
}

function approximateTokensFromChars(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countTokens(text: string): number {
  try {
    const enc = getO200kEncoding();
    if (enc) {
      return enc.encode(text).length;
    }
  } catch {
    // fall through to heuristic
  }
  return approximateTokensFromChars(text);
}

export function countMessageTokens(messages: CoreMessage[]): number {
  try {
    const chunks: string[] = [];
    for (const message of messages) {
      appendMessagePayload(chunks, message);
      if (message.providerOptions !== undefined) {
        chunks.push(stringifyUnknown(message.providerOptions));
      }
    }
    return countTokens(chunks.join('\n'));
  } catch {
    let total = 0;
    for (const message of messages) {
      try {
        total += countTokens(stringifyUnknown(message));
      } catch {
        total += approximateTokensFromChars(stringifyUnknown(message));
      }
    }
    return total;
  }
}
