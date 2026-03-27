import Conf from 'conf';

import { ConfigError } from '../../shared/errors.js';
import type { UserConfig } from '../../shared/types.js';

class ConfigManager {
  private static instance: ConfigManager | undefined;
  private readonly store: Conf;

  private constructor() {
    this.store = new Conf({
      projectName: 'aclix',
    });
  }

  static getInstance(): ConfigManager {
    ConfigManager.instance ??= new ConfigManager();

    return ConfigManager.instance;
  }

  get<K extends keyof UserConfig>(key: K): UserConfig[K] | undefined {
    const envKey = `ACLI_${key.toUpperCase()}`;
    const envValue = process.env[envKey];
    if (envValue) {
      return envValue as UserConfig[K];
    }

    return this.store.get(key as string) as UserConfig[K] | undefined;
  }

  set<K extends keyof UserConfig>(key: K, value: UserConfig[K]): void {
    this.store.set(key as string, value);
  }

  getAll(): Partial<UserConfig> {
    return this.store.store;
  }

  getConfigPath(): string {
    return this.store.path;
  }

  hasAuth(): true {
    const apiKey = this.get('apiKey');
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ConfigError('Missing API key. Please run onboarding or set apiKey in config.');
    }

    return true;
  }
}

export const configManager = ConfigManager.getInstance();
export { ConfigManager };
