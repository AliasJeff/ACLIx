import pino, { type Logger } from 'pino';

import { getAppConfig } from '../config/index.js';

export function createLogger(): Logger {
  const { logLevel } = getAppConfig();
  return pino({ level: logLevel });
}
