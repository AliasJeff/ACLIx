import type { ModelMessage as CoreMessage } from 'ai';

import { buildSystemPrompt } from './prompt.js';
import { createRuntimeContext } from '../context/index.js';
import type { RuntimeContext } from '../context/index.js';
import { createStandardToolRegistry } from '../tools/registry.js';
import { logger } from '../../services/logger/index.js';
import { LLMProvider } from '../../services/llm/provider.js';
import type { AgentCallbacks } from '../../shared/types.js';

export function executeChatWorkflow(
  messages: CoreMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
): ReturnType<LLMProvider['executeAgent']> {
  const ctx: RuntimeContext = createRuntimeContext();
  const basePrompt = buildSystemPrompt({
    cwd: ctx.cwd,
    os: ctx.platform,
    shell: ctx.shell,
  });
  // TODO: enhance system prompt
  let systemPrompt = `${basePrompt}

You are an autonomous AI CLI assistant. Use the shell tool to run commands and reach the user's goal step-by-step. If a command fails, read the error and adjust your plan. Do not tell the user to run commands manually; execute them via the tool. When the goal is done, reply with a clear natural-language summary.

CRITICAL ENVIRONMENT CONSTRAINTS: You are running in a headless, non-interactive shell. Commands that block and wait for user input (like 'mysql -p', 'sudo' without -S, 'vim', 'nano') will HANG FOREVER and timeout. YOU MUST NEVER EXECUTE INTERACTIVE COMMANDS.
If you need a password (e.g., for database connection or sudo), YOU MUST FIRST use the 'ask_user' tool with isSecret=true to get the password from the user. Then, execute the shell command non-interactively by injecting the password via environment variables (e.g., MYSQL_PWD='<pwd>' mysql ...) or stdin piping.

For every shell tool call you must set the risk field yourself:
- low: read-only or safe inspection (listing files, reading content, grep, git status/log/diff, pwd, environment inspection). These may run without a user confirmation prompt.
- medium: mutating but not catastrophic (installs, builds, moves, edits to project files, git commit, network fetches that write data).
- high: destructive, privileged, or system-wide impact (mass delete, chmod on sensitive paths, sudo, disk or service changes).

If you are unsure between medium and high, choose the higher level.`;

  systemPrompt += `

NEVER use shell commands like \`cat\`, \`head\`, \`tail\`, or \`less\` for reading files. YOU MUST use the dedicated \`file_read\` tool. When reading large files, use \`offset\` and \`limit\`. To create new files or completely overwrite them, use \`file_write\`.`;
  systemPrompt += `

To modify an EXISTING file, you MUST use the \`file_edit\` tool. NEVER use \`sed\`, \`awk\`, or \`echo >\`. NEVER use \`file_write\` to modify an existing file. For \`file_edit\`, your \`oldString\` must be an EXACT match of the file content. Do NOT include the line numbers from the \`file_read\` tool in your oldString.`;
  systemPrompt += `

NEVER use \`find\` or \`grep\` in the shell. To find files by name, use \`glob\` tool. To search text inside files, use \`grep\` tool. This prevents massive outputs from crashing your context.`;
  systemPrompt += `

You have access to a web_search tool powered by Tavily. Use it for up-to-date information, documentation, or current events.

IMPORTANT - Use the correct year in search queries:
The current month is ${ctx.currentDate}. You MUST use this year when searching for recent information.

CRITICAL REQUIREMENT:
- After answering the user's question using the web_search tool, you MUST include a "Sources:" section at the end of your response.
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: - [Title](URL)
- This is MANDATORY - never skip including sources in your response.

When using web_search:
- Prefer official documentation and authoritative sources
- If multiple sources conflict, mention the discrepancy`;

  logger.debug({ systemPrompt }, 'System prompt');
  logger.debug({ messages }, 'Messages');
  logger.debug({ ctx }, 'Context');

  const toolRegistry = createStandardToolRegistry(ctx, callbacks);
  const provider = new LLMProvider();
  return provider.executeAgent(
    messages,
    systemPrompt,
    toolRegistry.getTools(),
    signal,
    callbacks.onStepFinish,
  );
}
