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
import { createReadSkillTool } from './readSkill.js';
import { SkillManager } from '../skills/manager.js';
import { createShellTool } from './shell.js';
import { createWebSearchTool } from './webSearch.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  getTools(): Record<string, Tool> {
    return Object.fromEntries(this.tools);
  }
}

export function createStandardToolRegistry(
  ctx: RuntimeContext,
  callbacks: AgentCallbacks,
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('shell', createShellTool(runHostCommand, callbacks));
  registry.register('ask_user', createAskUserTool(callbacks));
  registry.register('file_read', createFileReadTool(callbacks));
  registry.register('file_edit', createFileEditTool(callbacks));
  registry.register('file_write', createFileWriteTool(callbacks));
  registry.register('glob', createGlobTool(ctx.cwd, callbacks));
  registry.register('grep', createGrepTool(ctx.cwd, callbacks));
  registry.register('web_search', createWebSearchTool(callbacks));
  registry.register('read_skill', createReadSkillTool(SkillManager.getInstance(), callbacks));
  return registry;
}
