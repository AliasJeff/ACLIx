import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fg from 'fast-glob';
import matter from 'gray-matter';

import { logger } from '../../services/logger/index.js';
import { AclixError } from '../../shared/errors.js';
import { findAclixPackageRoot } from '../../shared/utils.js';
import type { SkillMetadata } from '../../shared/types.js';

/**
 * Resolve builtin skills directory:
 * 1. `dist/builtin-skills` — copied by `copyfiles` next to bundled `dist/index.js`
 * 2. `src/builtin-skills` — dev when this module lives under `src/core/skills`
 * 3. `<packageRoot>/builtin-skills` — optional checkout beside package.json
 */
function resolveBuiltinSkillsDir(): string {
  const nextToBundle = path.join(import.meta.dirname, 'builtin-skills');
  if (existsSync(nextToBundle)) {
    return nextToBundle;
  }
  const srcTreePath = path.join(import.meta.dirname, '../../builtin-skills');
  if (existsSync(srcTreePath)) {
    return srcTreePath;
  }
  return path.join(findAclixPackageRoot(import.meta.dirname), 'builtin-skills');
}

const SKILL_GLOB_IGNORES = ['**/node_modules/**', '**/.git/**'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export class SkillManager {
  private static instance: SkillManager | undefined;

  private readonly byName = new Map<string, SkillMetadata>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- singleton
  private constructor() {}

  static getInstance(): SkillManager {
    SkillManager.instance ??= new SkillManager();
    return SkillManager.instance;
  }

  async scanSkills(cwd: string): Promise<void> {
    this.byName.clear();

    const sources: { dir: string; scope: SkillMetadata['scope'] }[] = [
      { dir: resolveBuiltinSkillsDir(), scope: 'builtin' },
      { dir: path.join(os.homedir(), '.aclix', 'skills'), scope: 'user' },
      { dir: path.join(cwd, '.aclix', 'skills'), scope: 'project' },
    ];

    for (const { dir, scope } of sources) {
      if (!existsSync(dir)) {
        continue;
      }

      const files = await fg('**/SKILL.md', {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        dot: false,
        ignore: SKILL_GLOB_IGNORES,
      });

      for (const filePath of files) {
        await this.ingestMarkdownFile(filePath, scope);
      }
    }
  }

  private async ingestMarkdownFile(filePath: string, scope: SkillMetadata['scope']): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error: unknown) {
      logger.debug({ filePath, error }, 'skill scan: failed to read file');
      return;
    }

    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(raw);
    } catch (error: unknown) {
      logger.debug({ filePath, error }, 'skill scan: gray-matter parse failed');
      return;
    }

    const fm: Record<string, unknown> = parsed.data as unknown as Record<string, unknown>;
    const nameRaw = fm.name;
    const descriptionRaw = fm.description;

    const skillDir = path.dirname(filePath);
    const folderName = path.basename(skillDir);
    const name = isNonEmptyString(nameRaw) ? nameRaw.trim() : folderName;
    const description = isNonEmptyString(descriptionRaw)
      ? descriptionRaw.trim()
      : 'Skill: ' + folderName;

    const meta: SkillMetadata = {
      name,
      description,
      filePath,
      skillDir,
      scope,
    };

    this.byName.set(meta.name, meta);
  }

  getAvailableSkills(): SkillMetadata[] {
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkillContent(name: string): Promise<{ content: string; skillDir: string }> {
    const key = name.trim();
    const meta = this.byName.get(key);
    if (!meta) {
      throw new AclixError(
        'SKILL_NOT_FOUND',
        `Skill not found: "${name}". Run a skill scan or check the name matches frontmatter "name".`,
      );
    }

    let raw: string;
    try {
      raw = await readFile(meta.filePath, 'utf8');
    } catch (error: unknown) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new AclixError(
        'SKILL_READ_ERROR',
        `Failed to read skill file for "${name}" at ${meta.filePath}: ${cause}`,
      );
    }

    const parsed = matter(raw);
    const content = typeof parsed.content === 'string' ? parsed.content : String(parsed.content);
    return { content, skillDir: meta.skillDir };
  }
}
