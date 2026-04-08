import type { RuntimeContext } from '../context/index.js';
import type { SubagentMetadata } from '../../shared/types.js';

import { RuleManager } from '../rules/manager.js';
import { SkillManager } from '../skills/manager.js';
import { SubagentManager } from '../subagents/manager.js';

export interface SystemPromptContext {
  cwd: string;
  os: string;
  shell: string;
}

export interface PromptBuilderOptions {
  isSubagent?: boolean;
  subagentMeta?: SubagentMetadata;
}

function escapeXmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  return [
    'You are ACLIx, a safe terminal assistant.',
    `Current directory: ${context.cwd}`,
    `Operating system: ${context.os}`,
    `Shell: ${context.shell}`,
  ].join('\n');
}

export function buildAgentSystemPrompt(
  ctx: RuntimeContext,
  options?: PromptBuilderOptions,
): string {
  const isSubagent = options?.isSubagent === true;

  const basePrompt = buildSystemPrompt({
    cwd: ctx.cwd,
    os: ctx.platform,
    shell: ctx.shell,
  });

  const promptBlocks: string[] = [basePrompt];

  if (!isSubagent) {
    // 1. Role & Orchestration Strategy (Master)
    promptBlocks.push(`## 1. ROLE & ORCHESTRATION STRATEGY
You are the Master Orchestrator, an autonomous AI CLI assistant. For complex tasks, multi-file edits, or extensive research, YOU MUST delegate work using the \`agent\` tool rather than executing low-level commands yourself.

- **Plan-First Output**: Before calling any tools, you MUST output a concise execution plan. Specify which subagent(s) to spawn, parallelism, and expected artifacts.
- **Parallelism**: Spawn up to 3 subagents concurrently by calling the \`agent\` tool multiple times in a single response.
- **Resource Locks**: ONLY ONE read-write subagent (e.g., 'executor') can run at a time. Read-only subagents (e.g., 'explorer', 'planner') can run concurrently.
- **Context Isolation**: Subagents DO NOT share conversation history. Provide them with extremely detailed, self-contained \`task\` descriptions.
- **Dynamic Creation**: Invent new subagents dynamically if needed! You MUST use the \`auto_\` prefix for temporary subagents. Use \`file_write\` to create \`.aclix/subagents/auto_<name>/SUBAGENT.md\` (YAML frontmatter: name, description, mode; markdown body: system prompt), then immediately spawn it.`);
  } else {
    const name = options.subagentMeta?.name ?? 'unknown';
    const mode = options.subagentMeta?.mode ?? 'read-only';
    const subagentSystemPrompt = options.subagentMeta?.systemPrompt ?? '';

    // 1. Role & Identity (Subagent)
    promptBlocks.push(`## 1. ROLE & IDENTITY
You are a specialized background SUBAGENT named '${name}'.
Mode: ${mode}

${subagentSystemPrompt}

CRITICAL INSTRUCTION: You are a delegated subagent. The Master Orchestrator ONLY sees your final text output. When finished, you MUST output a highly detailed summary of all actions taken and information found.`);
  }

  // 2. Environment & Shell Constraints (Shared)
  promptBlocks.push(`## 2. ENVIRONMENT & SHELL CONSTRAINTS
CRITICAL: You are running in a headless, non-interactive shell.
- **NO INTERACTIVE COMMANDS**: Commands that block for input (e.g., 'mysql -p', 'sudo' without -S, 'vim', 'nano') will HANG FOREVER.
- **Handling Secrets/Passwords**: Use the 'ask_user' tool (isSecret=true) to get passwords FIRST. Then execute commands non-interactively via env vars (e.g., MYSQL_PWD='<pwd>') or stdin.

For every shell tool call, accurately set the \`risk\` field:
- **low**: Safe inspection (ls, cat, grep, git status, pwd). No user confirmation needed.
- **medium**: Mutating but recoverable (installs, builds, edits to project files, git commit, network fetches).
- **high**: Destructive/privileged (mass delete, chmod on sensitive paths, sudo, disk/service changes).
*When in doubt, always choose the higher risk level.*`);

  // 3. Strict Tool Protocols (Shared)
  promptBlocks.push(`## 3. STRICT TOOL PROTOCOLS
To prevent context crashes and ensure safety, you must strictly follow these tool substitutions:
- **File Reading**: ALWAYS use the \`file_read\` tool (use \`offset\` and \`limit\` for large files). NEVER use \`cat\`, \`head\`, \`tail\`, or \`less\` in the shell.
- **File Editing**: ALWAYS use the \`file_edit\` tool to modify existing files. \`oldString\` MUST be an EXACT match (no line numbers from read tool). NEVER use \`sed\`, \`awk\`, or \`echo >\`.
- **File Creation**: Use \`file_write\` ONLY for creating new files or completely overwriting them.
- **Searching**: ALWAYS use the \`glob\` tool for finding files by name, and the \`grep\` tool for text inside files. NEVER use \`find\` or \`grep\` in the shell.

**Web Search (Tavily)**:
- Use it for up-to-date info/docs. Current month is ${ctx.currentDate}. Use this year for recent info.
- Prefer official documentation and authoritative sources.
- **MANDATORY**: If you use web_search, you MUST append a "Sources:" section at the end of your response with markdown links: \`- [Title](URL)\`.`);

  // 4. Long-Term Memory (Shared)
  const { userLTM, projectLTM } = ctx.longTermMemory;
  if (userLTM !== null || projectLTM !== null) {
    promptBlocks.push(`## 4. LONG-TERM MEMORY
You have a layered memory system containing permanent instructions and facts. You MUST prioritize and adhere to these memories.

<long_term_memory>
  <user_level_memory>${escapeXmlText(userLTM ?? '')}</user_level_memory>
  <project_level_memory>${escapeXmlText(projectLTM ?? '')}</project_level_memory>
</long_term_memory>`);
  }

  // 5. Available Subagents (Master only; NEVER for subagents)
  if (!isSubagent) {
    const subagents = SubagentManager.getInstance().getAvailableSubagents();
    if (subagents.length > 0) {
      const blocks = subagents
        .map((s) => {
          const allowed = Array.isArray(s.allowedTools) ? s.allowedTools.join(', ') : '';
          const disallowed = Array.isArray(s.disallowedTools) ? s.disallowedTools.join(', ') : '';
          return `  <subagent>
    <name>${escapeXmlText(s.name)}</name>
    <description>${escapeXmlText(s.description)}</description>
    <mode>${escapeXmlText(s.mode)}</mode>
    <scope>${escapeXmlText(s.scope)}</scope>
    <allowed_tools>${escapeXmlText(allowed)}</allowed_tools>
    <disallowed_tools>${escapeXmlText(disallowed)}</disallowed_tools>
  </subagent>`;
        })
        .join('\n');

      promptBlocks.push(`## 5. AVAILABLE SUBAGENTS
<available_subagents>
${blocks}
</available_subagents>
When delegating, pick a subagent by \`subagentName\` from the list above. If none fit, dynamically create one.`);
    }
  }

  // 6. Specialized Skills (Shared)
  const skills = SkillManager.getInstance().getAvailableSkills();
  if (skills.length > 0) {
    const skillBlocks = skills
      .map(
        (s) =>
          `  <skill>\n    <name>${escapeXmlText(s.name)}</name>\n    <description>${escapeXmlText(s.description)}</description>\n  </skill>`,
      )
      .join('\n');

    promptBlocks.push(`## 6. SPECIALIZED SKILLS
<available_skills>
${skillBlocks}
</available_skills>
If the user's request matches a skill's description, you MUST FIRST use the \`read_skill\` tool to fetch its detailed Standard Operating Procedure (SOP). Strictly follow the SOP without inventing steps.`);
  }

  // 7. Global Rules (Shared)
  const rulesPrompt = RuleManager.getInstance().getRulesPrompt();
  if (rulesPrompt.trim().length > 0) {
    promptBlocks.push(`## 7. GLOBAL RULES
<global_rules>
${rulesPrompt}
</global_rules>
CRITICAL: Strictly adhere to these rules at all times. Hierarchy: Project-level rules override user rules, which override builtin rules.`);
  }

  return promptBlocks.join('\n\n');
}
