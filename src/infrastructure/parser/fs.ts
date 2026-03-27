import fg from 'fast-glob';
import ignore from 'ignore';

export async function scanWorkspace(
  root: string,
  patterns: string[],
  ignoreRules: string[],
): Promise<string[]> {
  const matcher = ignore().add(ignoreRules);
  const paths = await fg(patterns, { cwd: root, dot: false });
  return paths.filter((path) => !matcher.ignores(path));
}
