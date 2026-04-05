import type { CAC } from 'cac';
import os from 'node:os';
import path from 'node:path';

import pc from 'picocolors';
import type { Logger } from 'pino';

import { configManager } from '../../services/config/index.js';
import { appLogger } from '../../services/logger/index.js';

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return '***';
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function configAction(): void {
  appLogger.info({ scope: 'user' }, 'User executed config command');
  const configPath = configManager.getConfigPath();
  const logPath = path.join(os.homedir(), '.aclix', 'logs');
  const config = configManager.getAll();

  console.info(pc.bold('ACLIx Configuration'));
  console.info(`${pc.cyan('Config file:')} ${configPath}`);
  console.info(`${pc.cyan('Log directory:')} ${logPath}`);
  console.info(pc.cyan('Values:'));

  const entries = Object.entries(config);
  if (entries.length === 0) {
    console.info(`  ${pc.dim('(empty)')}`);
    return;
  }

  for (const [key, rawValue] of entries) {
    const value =
      key === 'apiKey' && typeof rawValue === 'string' ? maskApiKey(rawValue) : String(rawValue);
    console.info(`  ${pc.green(key)}: ${pc.white(value)}`);
  }
}

export function registerConfigCommand(cli: CAC, logger: Logger): void {
  cli.command('config', 'Inspect and manage local config').action(() => {
    configAction();
    logger.info('config displayed');
  });
}
