import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ACLIX_PACKAGE_NAME = '@aliasjeff/acli';

export function findAclixPackageRoot(fromDir: string): string {
  let dir = path.resolve(fromDir);
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === ACLIX_PACKAGE_NAME) {
          return dir;
        }
      } catch {
        /* ignore invalid package.json */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(fromDir);
    }
    dir = parent;
  }
}

export function getAclixVersion(): string {
  try {
    const root = findAclixPackageRoot(import.meta.dirname);
    const pkgPath = path.join(root, 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
