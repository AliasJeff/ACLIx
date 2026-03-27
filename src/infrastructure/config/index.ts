import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  logLevel: string;
}

export function getAppConfig(cliOverrides: Partial<AppConfig> = {}): AppConfig {
  return {
    logLevel: cliOverrides.logLevel ?? process.env.ACLIX_LOG_LEVEL ?? 'info',
  };
}
