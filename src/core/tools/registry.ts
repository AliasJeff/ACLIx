import type { Tool } from 'ai';

import type { RuntimeContext } from '../context/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { runHostCommand } from '../../services/executor/host.js';
import { createAskUserTool } from './ask.js';
import { createFileEditTool } from './fileEdit.js';
import { createFileReadTool } from './fileRead.js';
import { createFileWriteTool } from './fileWrite.js';
import { createGlobTool } from './glob.js';
import { createGrepTool } from './grep.js';
import { createPythonTool } from './python.js';
import { createReadSkillTool } from './readSkill.js';
import { SkillManager } from '../skills/manager.js';
import { createAgentTool } from './agent.js';
import { createShellTool } from './shell.js';
import { createWebSearchTool } from './webSearch.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  getTools(): Record<string, Tool> {
    return Object.fromEntries(this.tools);
  }
}

export function createStandardToolRegistry(
  ctx: RuntimeContext,
  callbacks: AgentCallbacks,
  allowedTools?: string[],
  disallowedTools?: string[],
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('agent', createAgentTool(ctx, callbacks));
  registry.register('shell', createShellTool(runHostCommand, callbacks));
  registry.register('python', createPythonTool(callbacks));
  registry.register('ask_user', createAskUserTool(callbacks));
  registry.register('file_read', createFileReadTool(callbacks));
  registry.register('file_edit', createFileEditTool(callbacks));
  registry.register('file_write', createFileWriteTool(callbacks));
  registry.register('glob', createGlobTool(ctx.cwd, callbacks));
  registry.register('grep', createGrepTool(ctx.cwd, callbacks));
  registry.register('web_search', createWebSearchTool(callbacks));
  registry.register('read_skill', createReadSkillTool(SkillManager.getInstance(), callbacks));

  if (Array.isArray(disallowedTools) && disallowedTools.length > 0) {
    for (const name of disallowedTools) {
      registry.unregister(name);
    }
  }

  if (Array.isArray(allowedTools) && allowedTools.length > 0 && !allowedTools.includes('*')) {
    const allow = new Set(allowedTools);
    for (const name of registry.getToolNames()) {
      if (!allow.has(name)) {
        registry.unregister(name);
      }
    }
  }

  return registry;
}
