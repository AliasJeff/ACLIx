import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import pino, { type Logger } from 'pino';

import { maskSensitiveData } from '../../core/security/masking.js';

const require = createRequire(import.meta.url);

const logDir = path.join(os.homedir(), '.aclix', 'logs');

const isAclixDebug = process.env.ACLI_DEBUG === '1';

function createFileLogger(filenamePrefix: string, level: string): Logger {
  const targets: { target: string; options: Record<string, unknown> }[] = [
    {
      target: 'pino-roll',
      options: {
        file: path.join(logDir, filenamePrefix),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        mkdir: true,
      },
    },
  ];

  if (isAclixDebug) {
    targets.push({
      target: require.resolve('pino-pretty'),
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'HH:MM:ss',
        destination: 1,
      },
    });
  }

  const MAX_DEPTH = 6;

  const maskValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (typeof value === 'string') {
      // Avoid spending too much time on huge strings.
      if (value.length > 200_000) {
        const head = value.slice(0, 100_000);
        const tail = value.slice(-20_000);
        return `${maskSensitiveData(head)}\n...[TRUNCATED FOR MASKING]...\n${maskSensitiveData(tail)}`;
      }
      return maskSensitiveData(value);
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (depth >= MAX_DEPTH) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return value;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => maskValue(v, depth + 1, seen));
    }

    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = maskValue(v, depth + 1, seen);
    }
    return out;
  };

  return pino(
    {
      level,
      formatters: {
        log(object) {
          const seen = new WeakSet<object>();
          const masked = maskValue(object, 0, seen);

          if (masked && typeof masked === 'object' && !Array.isArray(masked)) {
            return masked as Record<string, unknown>;
          }

          return { value: masked };
        },
      },
    },
    pino.transport({ targets }),
  );
}

export const appLogger = createFileLogger('app', 'debug');

export const errorLogger = createFileLogger('error', 'debug');

export const eventLogger = createFileLogger('event', 'debug');

export type CoreEventDomain = 'memory' | 'rules' | 'security' | 'skills' | 'subagents' | 'tools';

export function logCoreEvent(
  domain: CoreEventDomain,
  action: string,
  payload?: Record<string, unknown>,
): void {
  if (payload === undefined) {
    eventLogger.info({ domain, action }, 'core event');
  } else {
    eventLogger.info({ ...payload, domain, action }, 'core event');
  }
}

export const logger = errorLogger;

export function createLogger(): Logger {
  return errorLogger;
}
