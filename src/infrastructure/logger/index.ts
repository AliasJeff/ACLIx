import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pino, { type Logger } from 'pino';

// FIXME: only print log to console in development mode
const require = createRequire(import.meta.url);
const isDebugEnabled = process.env.ACLI_DEBUG === '1';
const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultLevel = isDebugEnabled ? 'debug' : 'info';
const logDir = path.join(os.homedir(), '.aclix', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function buildTransport() {
  const targets: {
    target: string;
    options: Record<string, unknown>;
  }[] = [];

  if (isDevelopment || isDebugEnabled) {
    targets.push({
      target: require.resolve('pino-pretty'),
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'HH:MM:ss',
      },
    });
  }

  targets.push({
    target: require.resolve('pino-roll'),
    options: {
      file: path.join(logDir, 'acli'),
      extension: '.log',
      frequency: 'daily',
      mkdir: true,
    },
  });

  if (targets.length === 0) {
    return undefined;
  }

  try {
    return pino.transport({
      targets,
    });
  } catch {
    if (!isDevelopment && !isDebugEnabled) {
      return undefined;
    }

    return pino.transport({
      target: require.resolve('pino-pretty'),
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'HH:MM:ss',
      },
    });
  }
}

let loggerInstance: Logger | undefined;

function getLoggerInstance(): Logger {
  loggerInstance ??= pino(
    {
      level: defaultLevel,
    },
    buildTransport(),
  );

  return loggerInstance;
}

export const logger = getLoggerInstance();

export function createLogger(): Logger {
  return getLoggerInstance();
}
