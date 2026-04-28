import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fg from 'fast-glob';
import matter from 'gray-matter';

import { errorLogger, logCoreEvent } from '../../services/logger/index.js';
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

  private byName = new Map<string, SubagentMetadata>();
  private dynamicSubagents = new Set<string>();

  private activeCount = 0;
  private activeCwdWriters = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- singleton
  private constructor() {}

  static getInstance(): SubagentManager {
    logCoreEvent('subagents', 'SubagentManager.getInstance');
    SubagentManager.instance ??= new SubagentManager();
    return SubagentManager.instance;
  }

  acquireSlot(mode: SubagentMode, targetCwd: string): () => void {
    logCoreEvent('subagents', 'SubagentManager.acquireSlot', { mode, targetCwd });
    if (this.activeCount >= 6) {
      throw new AclixError('SUBAGENT_BUSY', 'Max 6 concurrent subagents reached. Please wait.');
    }
    if (mode === 'read-write' && this.activeCwdWriters.has(targetCwd)) {
      throw new AclixError(
        'SUBAGENT_BUSY',
        'A read-write subagent is already running on this workspace. Please wait or use a different isolated workspace.',
      );
    }

    this.activeCount += 1;
    if (mode === 'read-write') {
      this.activeCwdWriters.add(targetCwd);
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;

      this.activeCount = Math.max(0, this.activeCount - 1);
      if (mode === 'read-write') {
        this.activeCwdWriters.delete(targetCwd);
      }
    };
  }

  async scanSubagents(cwd: string): Promise<void> {
    logCoreEvent('subagents', 'SubagentManager.scanSubagents', { cwd });
    const newMap = new Map<string, SubagentMetadata>();

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
        const meta = await this.ingestMarkdownFile(filePath, scope);
        if (meta) {
          newMap.set(meta.name, meta);
        }
      }
    }

    this.byName = newMap;
  }

  private async ingestMarkdownFile(
    filePath: string,
    scope: SubagentMetadata['scope'],
  ): Promise<SubagentMetadata | null> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error: unknown) {
      errorLogger.error({ filePath, error }, 'Failed to read or parse metadata');
      return null;
    }

    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(raw);
    } catch (error: unknown) {
      errorLogger.error({ filePath, error }, 'Failed to read or parse metadata');
      return null;
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

    return meta;
  }

  getAvailableSubagents(): SubagentMetadata[] {
    logCoreEvent('subagents', 'SubagentManager.getAvailableSubagents');
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getSubagent(name: string): SubagentMetadata {
    logCoreEvent('subagents', 'SubagentManager.getSubagent', { name: name.trim() });
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

  trackDynamicSubagent(dirPath: string): void {
    this.dynamicSubagents.add(dirPath);
  }

  async cleanupDynamicSubagents(): Promise<void> {
    for (const dir of this.dynamicSubagents) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore errors so cleanup can continue.
      }
    }
    this.dynamicSubagents.clear();
  }
}
