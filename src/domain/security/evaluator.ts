import { parseCommandAst } from '../../infrastructure/parser/ast.js';

export type RiskLevel = 'low' | 'medium' | 'high';

const ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/**
 * Server-side floor so obviously dangerous commands are not treated as low
 * if the model mislabels them. Does not downgrade the agent's assessment.
 */
export function evaluateServerRiskFloor(command: string): RiskLevel {
  // Fork bomb defense (keep existing logic)
  if (command.includes(':(){ :|:& };:')) return 'high';

  let ast: unknown[];
  try {
    ast = parseCommandAst(command) as unknown[];
  } catch {
    // Malformed syntax defaults to high risk
    return 'high';
  }

  const isOpToken = (t: unknown): t is { op: string } => {
    if (typeof t !== 'object' || t === null) return false;
    const obj = t as Record<string, unknown>;
    return typeof obj.op === 'string';
  };

  const isGlobToken = (t: unknown): t is { pattern: string } => {
    if (typeof t !== 'object' || t === null) return false;
    const obj = t as Record<string, unknown>;
    return typeof obj.pattern === 'string';
  };

  const CONTROL_OPS = new Set([';', '|', '&&', '||', '&', '(', ')']);

  const REDIRECT_OPS = new Set(['>', '>>', '1>', '2>', '&>']);

  const highCommands = new Set([
    'vi',
    'vim',
    'nano',
    'cat',
    'head',
    'tail',
    'less',
    'find',
    'grep',
    'mkfs',
    'dd',
    'shutdown',
    'reboot',
  ]);

  const mediumCommands = new Set(['rm', 'mv', 'chmod', 'chown', 'curl', 'wget', 'tee']);

  let currentRisk: RiskLevel = 'low';

  // Split AST into command blocks by control operators
  const blocks: unknown[][] = [];
  let currentBlock: unknown[] = [];
  for (const token of ast) {
    if (isOpToken(token) && CONTROL_OPS.has(token.op)) {
      if (currentBlock.length > 0) blocks.push(currentBlock);
      currentBlock = [];
      continue;
    }
    currentBlock.push(token);
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  for (const block of blocks) {
    // Redirect detection: if redirect target isn't /dev/null => high
    for (let i = 0; i < block.length; i++) {
      const t = block[i];
      if (!isOpToken(t) || !REDIRECT_OPS.has(t.op)) continue;

      const next = block[i + 1];
      const target = typeof next === 'string' ? next : isGlobToken(next) ? next.pattern : undefined;
      if (target !== '/dev/null') {
        return 'high';
      }
    }

    // Extract string args (also unwrap glob pattern)
    const argv = block
      .filter((t) => !isOpToken(t))
      .map((t) => (typeof t === 'string' ? t : isGlobToken(t) ? t.pattern : undefined))
      .filter((t): t is string => typeof t === 'string' && t.length > 0);

    if (argv.length === 0) continue;

    // Locate main command (skip env assignments like FOO=bar at start)
    let idx = 0;
    while (idx < argv.length) {
      const word = argv[idx];
      if (!word) {
        idx++;
        continue;
      }
      if (
        word.includes('=') &&
        !word.startsWith('=') &&
        !word.includes('/') &&
        !word.includes('\\')
      ) {
        idx++;
        continue;
      }
      break;
    }
    if (idx >= argv.length) continue;

    const mainWord = argv[idx];
    if (!mainWord) continue;
    let main = mainWord.toLowerCase();
    const rest = argv.slice(idx + 1);

    // sudo handling
    if (main === 'sudo') {
      currentRisk = maxRisk(currentRisk, 'medium');
      if (rest.length === 0) continue;
      const sudoMain = rest[0];
      if (!sudoMain) continue;
      main = sudoMain.toLowerCase();
    }

    // High command detection
    if (highCommands.has(main)) {
      return 'high';
    }

    // Destructive modifications (high)
    if (main === 'sed') {
      const hasInPlace = rest.some((a) => a === '-i' || a === '--in-place');
      if (hasInPlace) return 'high';
    }

    if (main === 'rm') {
      const flags = rest.filter((a) => a.startsWith('-'));
      const hasRf = flags.some((f) => f.includes('r') || f.includes('f'));
      const hasRootPath = rest.some((a) => a === '/' || a === '/*');
      if (hasRf && hasRootPath) return 'high';
    }

    // State modifications (medium)
    if (mediumCommands.has(main)) {
      currentRisk = maxRisk(currentRisk, 'medium');
    }

    if (main === 'npm' || main === 'pnpm' || main === 'yarn') {
      const args = rest.map((a) => a.toLowerCase());
      if (args.includes('i') || args.includes('install') || args.includes('add')) {
        currentRisk = maxRisk(currentRisk, 'medium');
      }
    }

    if (main === 'git') {
      const args = rest.map((a) => a.toLowerCase());
      if (args.includes('push') || args.includes('reset')) {
        currentRisk = maxRisk(currentRisk, 'medium');
      }
    }
  }

  return currentRisk;
}

export function mergeAgentAndServerRisk(agent: RiskLevel, command: string): RiskLevel {
  return maxRisk(agent, evaluateServerRiskFloor(command));
}
