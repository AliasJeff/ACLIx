import { configManager } from '../../services/config/index.js';
import { ConfigError } from '../../shared/errors.js';

export function requireAuth(): void {
  try {
    configManager.hasAuth();
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError('Missing API key. Please run onboarding first.');
  }
}
