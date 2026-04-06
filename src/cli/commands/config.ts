import type { CAC } from 'cac';
import os from 'node:os';
import path from 'node:path';

import pc from 'picocolors';
import type { Logger } from 'pino';

import { configManager } from '../../services/config/index.js';
import { appLogger } from '../../services/logger/index.js';
import type { UserConfig } from '../../shared/types.js';
import { askPassword, askSelect } from '../../ui/prompts.js';
import { modelOptionsByProvider, providerOptions } from './onboard.js';

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return '***';
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

type ConfigSelection = 'Provider' | 'Model' | 'API Key' | 'Tavily API Key' | 'Exit';

function isSupportedProvider(value: unknown): value is keyof typeof modelOptionsByProvider {
  return typeof value === 'string' && value in modelOptionsByProvider;
}

export async function configAction(signal?: AbortSignal): Promise<void> {
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
  } else {
    for (const [key, rawValue] of entries) {
      const value =
        key === 'apiKey' && typeof rawValue === 'string'
          ? maskApiKey(rawValue)
          : String(rawValue);
      console.info(`  ${pc.green(key)}: ${pc.white(value)}`);
    }
  }

  for (;;) {
    const selection = await askSelect<ConfigSelection>(
      'Select a configuration to modify:',
      [
        { value: 'Provider', label: 'Provider' },
        { value: 'Model', label: 'Model' },
        { value: 'API Key', label: 'API Key' },
        { value: 'Tavily API Key', label: 'Tavily API Key' },
        { value: 'Exit', label: 'Exit' },
      ],
      signal,
    );

    if (selection === 'Exit') {
      break;
    }

    if (selection === 'Provider') {
      const provider = await askSelect('Choose your LLM provider', providerOptions, signal);
      configManager.set('provider', provider);
      console.info(pc.green('Updated provider successfully.'));
      continue;
    }

    if (selection === 'Model') {
      let provider = configManager.get('provider');
      if (!isSupportedProvider(provider)) {
        provider = await askSelect('Choose your LLM provider', providerOptions, signal);
        configManager.set('provider', provider);
      }

      const model: UserConfig['model'] = await askSelect(
        'Choose your default model',
        modelOptionsByProvider[provider],
        signal,
      );
      configManager.set('model', model);
      console.info(pc.green('Updated model successfully.'));
      continue;
    }

    if (selection === 'API Key') {
      const apiKey = await askPassword('Enter your API Key', '*', signal);
      configManager.set('apiKey', apiKey);
      console.info(pc.green('Updated apiKey successfully.'));
      continue;
    }

    const tavilyApiKey = await askPassword(
      'Enter your Tavily API Key (optional, press Enter to skip)',
      '*',
      signal,
    );
    const normalizedTavilyApiKey = tavilyApiKey.length > 0 ? tavilyApiKey : undefined;
    configManager.set('tavilyApiKey', normalizedTavilyApiKey);
    console.info(pc.green('Updated tavilyApiKey successfully.'));
  }
}

export function registerConfigCommand(cli: CAC, logger: Logger): void {
  cli.command('config', 'Inspect and manage local config').action(async () => {
    await configAction();
    logger.info('config displayed');
  });
}
