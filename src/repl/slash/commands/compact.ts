import pc from 'picocolors';

import { ContextCompressor } from '../../../core/memory/compressor.js';
import { errorLogger } from '../../../services/logger/index.js';
import { LLMProvider } from '../../../services/llm/provider.js';
import { spinner } from '../../../ui/spinner.js';
import type { SlashCommand } from '../types.js';

export const compactCommand: SlashCommand = {
  name: 'compact',
  description: 'Manually compress context to save tokens',
  async execute(_args, session): Promise<'continue'> {
    const before = session.getTokenCount();
    try {
      spinner.start('Compressing context...');
      const compressed = await ContextCompressor.compress(
        session.getMessages(),
        0,
        40000,
        new LLMProvider(),
      );
      session.setMessages(compressed);
      const after = session.getTokenCount();
      const saved = Math.max(0, before - after);
      console.info(
        pc.green(
          `Context compressed. Tokens: ${pc.bold(String(before))} → ${pc.bold(String(after))} (${pc.bold(String(saved))} saved).`,
        ),
      );
    } catch (error) {
      errorLogger.error({ error }, 'Manual context compact failed');
      console.info(pc.red('Context compression failed. See logs for details.'));
    } finally {
      spinner.stop();
    }
    return 'continue';
  },
};
