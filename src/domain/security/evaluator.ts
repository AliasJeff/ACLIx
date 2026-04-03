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
  const normalized = command.toLowerCase();
  const hasDangerousEditOrRead =
    /\bsed\s+-i\b|\bvi\s|\bvim\s|\bnano\s|\bcat\s|\bhead\s|\btail\s|\bfind\s|\bgrep\s/.test(
      normalized,
    );
  const hasDangerousRedirect = /(>>?|[0-9]>)\s*(?!\/dev\/null\b)/.test(normalized);

  if (hasDangerousEditOrRead || hasDangerousRedirect) {
    return 'high';
  }

  // FIXME: should use AST to evaluate the command
  const highPatterns = [
    'rm -rf /',
    'mkfs',
    'dd if=',
    ':(){ :|:& };:',
    'shutdown',
    'reboot',
    '> /dev/',
  ];
  if (highPatterns.some((p) => normalized.includes(p))) {
    return 'high';
  }

  const mediumRegex =
    /\b(rm|mv|chmod|chown|curl|wget|sudo)\b|npm\s+i|pnpm\s+i|yarn\s+add|git\s+push|git\s+reset\s+--hard|[>|]\s*tee\s/;
  if (mediumRegex.test(normalized)) {
    return 'medium';
  }

  return 'low';
}

export function mergeAgentAndServerRisk(agent: RiskLevel, command: string): RiskLevel {
  return maxRisk(agent, evaluateServerRiskFloor(command));
}
