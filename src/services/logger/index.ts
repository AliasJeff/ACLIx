import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import pino, { type Logger } from 'pino';

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

  return pino({ level }, pino.transport({ targets }));
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
    eventLogger.info({ domain, action, ...payload }, 'core event');
  }
}

export const logger = errorLogger;

export function createLogger(): Logger {
  return errorLogger;
}
