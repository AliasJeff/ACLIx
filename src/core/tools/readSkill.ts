import { tool } from 'ai';
import { z } from 'zod';

import { errorLogger } from '../../services/logger/index.js';
import type { SkillManager } from '../skills/manager.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { AclixError } from '../../shared/errors.js';
import { logToolEvent } from './toolEvent.js';

const readSkillInputSchema = z.object({
  skillName: z.string().describe('The precise name of the skill to load'),
});

export function createReadSkillTool(skillManager: SkillManager, callbacks: AgentCallbacks) {
  return tool({
    description:
      'Load the detailed instructions and standard operating procedures (SOP) for a specific skill. You MUST call this tool when you decide to use an available skill to read its exact rules.',
    inputSchema: readSkillInputSchema,
    execute: async ({ skillName }) => {
      logToolEvent('read_skill', { skillName: skillName.trim() });
      const command = `read_skill ${skillName}`;
      // Risk 'low' → UI prints e.g. 🛠️  Tool [read_skill] read_skill <name>
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute(
            'read_skill',
            command,
            'Loading skill instructions',
            'low',
          )
        : true;
      if (!isApproved) {
        return 'Execution rejected.';
      }

      try {
        const { content, skillDir }: { content: string; skillDir: string } =
          await skillManager.getSkillContent(skillName);
        return `[Skill Directory: ${skillDir}]\n\n${content}`;
      } catch (error: unknown) {
        errorLogger.error({ tool: 'read_skill', error }, 'Tool execution exception');
        if (error instanceof AclixError) {
          return `Failed to load skill "${skillName}": ${error.message}`;
        }
        return `Failed to load skill "${skillName}": ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
