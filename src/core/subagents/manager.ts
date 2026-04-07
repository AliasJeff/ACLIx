import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fg from 'fast-glob';
import matter from 'gray-matter';

import { errorLogger } from '../../services/logger/index.js';
import { AclixError } from '../../shared/errors.js';
import { findAclixPackageRoot } from '../../shared/utils.js';
import type { SubagentMetadata, SubagentMode } from '../../shared/types.js';

const SUBAGENT_GLOB_IGNORES = ['**/node_modules/**', '**/.git/**'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isSubagentMode(value: unknown): value is SubagentMode {
  return value === 'read-only' || value === 'read-write';
}

/**
 * Resolve builtin subagents directory:
 * 1. `dist/builtin-subagents` — copied by `copyfiles` next to bundled `dist/index.js`
 * 2. `src/builtin-subagents` — dev when this module lives under `src/core/subagents`
 * 3. `<packageRoot>/builtin-subagents` — optional checkout beside package.json
 */
function resolveBuiltinSubagentsDir(): string {
  const nextToBundle = path.join(import.meta.dirname, 'builtin-subagents');
  if (existsSync(nextToBundle)) {
    return nextToBundle;
  }
  const srcTreePath = path.join(import.meta.dirname, '../../builtin-subagents');
  if (existsSync(srcTreePath)) {
    return srcTreePath;
  }
  return path.join(findAclixPackageRoot(import.meta.dirname), 'builtin-subagents');
}

export class SubagentManager {
  private static instance: SubagentManager | undefined;

  private readonly byName = new Map<string, SubagentMetadata>();

  private activeCount = 0;
  private writerActive = false;

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- singleton
  private constructor() {}

  static getInstance(): SubagentManager {
    SubagentManager.instance ??= new SubagentManager();
    return SubagentManager.instance;
  }

  acquireSlot(mode: SubagentMode): () => void {
    if (this.activeCount >= 3) {
      throw new AclixError('SUBAGENT_BUSY', 'Max 3 concurrent subagents reached. Please wait.');
    }
    if (mode === 'read-write' && this.writerActive) {
      throw new AclixError(
        'SUBAGENT_BUSY',
        'A read-write subagent is already running. Please wait or spawn a read-only subagent.',
      );
    }

    this.activeCount += 1;
    if (mode === 'read-write') {
      this.writerActive = true;
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;

      this.activeCount = Math.max(0, this.activeCount - 1);
      if (mode === 'read-write') {
        this.writerActive = false;
      }
    };
  }

  async scanSubagents(cwd: string): Promise<void> {
    this.byName.clear();

    const sources: { dir: string; scope: SubagentMetadata['scope'] }[] = [
      { dir: resolveBuiltinSubagentsDir(), scope: 'builtin' },
      { dir: path.join(os.homedir(), '.aclix', 'subagents'), scope: 'user' },
      { dir: path.join(cwd, '.aclix', 'subagents'), scope: 'project' },
    ];

    for (const { dir, scope } of sources) {
      if (!existsSync(dir)) {
        continue;
      }

      const files = await fg('**/SUBAGENT.md', {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        dot: false,
        ignore: SUBAGENT_GLOB_IGNORES,
      });

      for (const filePath of files) {
        await this.ingestMarkdownFile(filePath, scope);
      }
    }
  }

  private async ingestMarkdownFile(
    filePath: string,
    scope: SubagentMetadata['scope'],
  ): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error: unknown) {
      errorLogger.error({ filePath, error }, 'Failed to read or parse metadata');
      return;
    }

    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(raw);
    } catch (error: unknown) {
      errorLogger.error({ filePath, error }, 'Failed to read or parse metadata');
      return;
    }

    const fm: Record<string, unknown> = parsed.data as unknown as Record<string, unknown>;

    const subagentDir = path.dirname(filePath);
    const folderName = path.basename(subagentDir);

    const nameRaw = fm.name;
    const descriptionRaw = fm.description;
    const modeRaw = fm.mode;
    const allowedToolsRaw = fm.allowedTools;
    const disallowedToolsRaw = fm.disallowedTools;

    const name = isNonEmptyString(nameRaw) ? nameRaw.trim() : folderName;
    const description = isNonEmptyString(descriptionRaw)
      ? descriptionRaw.trim()
      : 'Subagent: ' + folderName;

    const mode: SubagentMode = isSubagentMode(modeRaw) ? modeRaw : 'read-only';

    const systemPrompt =
      typeof parsed.content === 'string' ? parsed.content.trim() : String(parsed.content).trim();

    const allowedTools = isStringArray(allowedToolsRaw) ? allowedToolsRaw : undefined;
    const disallowedTools = isStringArray(disallowedToolsRaw) ? disallowedToolsRaw : undefined;

    const meta: SubagentMetadata = {
      name,
      description,
      mode,
      systemPrompt,
      allowedTools,
      disallowedTools,
      scope,
      filePath,
      subagentDir,
    };

    this.byName.set(meta.name, meta);
  }

  getAvailableSubagents(): SubagentMetadata[] {
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getSubagent(name: string): SubagentMetadata {
    const key = name.trim();
    const meta = this.byName.get(key);
    if (!meta) {
      throw new AclixError(
        'SUBAGENT_NOT_FOUND',
        `Subagent not found: "${name}". Run a subagent scan or check the name matches frontmatter "name".`,
      );
    }
    return meta;
  }
}

