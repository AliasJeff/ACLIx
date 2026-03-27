export type RiskLevel = 'low' | 'high';

const HIGH_RISK_PATTERNS = ['rm -rf /', 'mkfs', 'shutdown', 'reboot'];

export function evaluateCommandRisk(command: string): RiskLevel {
  const normalized = command.toLowerCase();
  return HIGH_RISK_PATTERNS.some((pattern) => normalized.includes(pattern))
    ? 'high'
    : 'low';
}
