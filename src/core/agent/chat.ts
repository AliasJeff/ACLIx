import type { ModelMessage as CoreMessage } from 'ai';

import { buildSystemPrompt } from './prompt.js';
import { createRuntimeContext } from '../context/index.js';
import type { RuntimeContext } from '../context/index.js';
import { RuleManager } from '../rules/manager.js';
import { SkillManager } from '../skills/manager.js';
import { SubagentManager } from '../subagents/manager.js';
import { createStandardToolRegistry } from '../tools/registry.js';
import { appLogger } from '../../services/logger/index.js';
import { LLMProvider } from '../../services/llm/provider.js';
import type { AgentCallbacks } from '../../shared/types.js';

function escapeXmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function executeChatWorkflow(
  messages: CoreMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
): Promise<ReturnType<LLMProvider['executeAgent']>> {
  const ctx: RuntimeContext = await createRuntimeContext();
  await SkillManager.getInstance().scanSkills(ctx.cwd);
  await RuleManager.getInstance().scanRules(ctx.cwd);
  await SubagentManager.getInstance().scanSubagents(ctx.cwd);

  const { userLTM, projectLTM } = ctx.longTermMemory;

  const basePrompt = buildSystemPrompt({
    cwd: ctx.cwd,
    os: ctx.platform,
    shell: ctx.shell,
  });
  // TODO: enhance system prompt
  let systemPrompt = `${basePrompt}

You are the Master Orchestrator. For complex tasks, multi-file edits, or extensive research, YOU MUST delegate work using the \`agent\` tool rather than executing low-level commands yourself.
- **Plan-first Output**: After receiving a user task, you MUST FIRST output a concise execution plan before calling any tools. The plan must specify which subagent(s) you will spawn, whether you will run them in parallel, and what artifacts/results you expect back.
- **Parallelism**: You can spawn up to 3 subagents in parallel by calling the \`agent\` tool multiple times in a single response.
- **Resource Locks**: ONLY ONE read-write subagent (e.g., 'executor') can run at a time to prevent conflicts. Read-only subagents (e.g., 'explorer', 'planner') can run concurrently safely.
- **Context Isolation**: Subagents have NO access to our conversation history. You MUST provide them with extremely detailed and self-contained \`task\` descriptions.
- **Dynamic Creation**: You can dynamically invent new subagents! Use \`file_write\` to create a \`.aclix/subagents/<name>/SUBAGENT.md\` with YAML frontmatter (name, description, mode: 'read-only'|'read-write') and markdown body (system prompt), and then immediately spawn it!

You are an autonomous AI CLI assistant. Use the shell tool to run commands and reach the user's goal step-by-step. If a command fails, read the error and adjust your plan. Do not tell the user to run commands manually; execute them via the tool. When the goal is done, reply with a clear natural-language summary.

CRITICAL ENVIRONMENT CONSTRAINTS: You are running in a headless, non-interactive shell. Commands that block and wait for user input (like 'mysql -p', 'sudo' without -S, 'vim', 'nano') will HANG FOREVER and timeout. YOU MUST NEVER EXECUTE INTERACTIVE COMMANDS.
If you need a password (e.g., for database connection or sudo), YOU MUST FIRST use the 'ask_user' tool with isSecret=true to get the password from the user. Then, execute the shell command non-interactively by injecting the password via environment variables (e.g., MYSQL_PWD='<pwd>' mysql ...) or stdin piping.

For every shell tool call you must set the risk field yourself:
- low: read-only or safe inspection (listing files, reading content, grep, git status/log/diff, pwd, environment inspection). These may run without a user confirmation prompt.
- medium: mutating but not catastrophic (installs, builds, moves, edits to project files, git commit, network fetches that write data).
- high: destructive, privileged, or system-wide impact (mass delete, chmod on sensitive paths, sudo, disk or service changes).

If you are unsure between medium and high, choose the higher level.`;

  const subagents = SubagentManager.getInstance().getAvailableSubagents();
  if (subagents.length > 0) {
    const blocks = subagents
      .map((s) => {
        const allowed = Array.isArray(s.allowedTools) ? s.allowedTools.join(', ') : '';
        const disallowed = Array.isArray(s.disallowedTools) ? s.disallowedTools.join(', ') : '';
        return (
          `  <subagent>\n` +
          `    <name>${escapeXmlText(s.name)}</name>\n` +
          `    <description>${escapeXmlText(s.description)}</description>\n` +
          `    <mode>${escapeXmlText(s.mode)}</mode>\n` +
          `    <scope>${escapeXmlText(s.scope)}</scope>\n` +
          `    <allowed_tools>${escapeXmlText(allowed)}</allowed_tools>\n` +
          `    <disallowed_tools>${escapeXmlText(disallowed)}</disallowed_tools>\n` +
          `  </subagent>`
        );
      })
      .join('\n');
    systemPrompt += `

<available_subagents>
${blocks}
</available_subagents>

CRITICAL: When delegating, pick a subagent by \`subagentName\` from <available_subagents>. If none fit, dynamically create one under \`.aclix/subagents\` and then spawn it.`;
  }

  if (userLTM !== null || projectLTM !== null) {
    const safeUserLTM = userLTM ?? '';
    const safeProjectLTM = projectLTM ?? '';

    systemPrompt += `

CRITICAL: You are equipped with a layered memory system. The <long_term_memory> contains permanent instructions and facts. You MUST prioritize and adhere to these memories.

<long_term_memory>
  <user_level_memory>${escapeXmlText(safeUserLTM)}</user_level_memory>
  <project_level_memory>${escapeXmlText(safeProjectLTM)}</project_level_memory>
</long_term_memory>`;
  }

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

  const skills = SkillManager.getInstance().getAvailableSkills();
  if (skills.length > 0) {
    const skillBlocks = skills
      .map(
        (s) =>
          `  <skill>\n    <name>${escapeXmlText(s.name)}</name>\n    <description>${escapeXmlText(s.description)}</description>\n  </skill>`,
      )
      .join('\n');
    systemPrompt += `

<available_skills>
${skillBlocks}
</available_skills>

CRITICAL: You have access to specialized skills listed in <available_skills>. If the user's request matches a skill's description, you MUST FIRST use the read_skill tool to fetch its detailed instructions. Once loaded, strictly follow the skill's Standard Operating Procedure (SOP) without inventing steps.`;
  }

  const rulesPrompt = RuleManager.getInstance().getRulesPrompt();
  if (rulesPrompt.trim().length > 0) {
    systemPrompt += `\n\n<global_rules>\n${rulesPrompt}\n</global_rules>\n\nCRITICAL: You MUST strictly adhere to the instructions and constraints defined in the <global_rules> block at all times during this conversation. Project-level rules override user rules, which override builtin rules.`;
  }

  appLogger.info(
    {
      scope: 'agent',
      cwd: ctx.cwd,
      systemPrompt,
      systemPromptLength: systemPrompt.length,
      messageCount: messages.length,
    },
    'Agent workflow started',
  );

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
