import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fg from 'fast-glob';
import matter from 'gray-matter';

import { errorLogger, logCoreEvent } from '../../services/logger/index.js';
import { findAclixPackageRoot } from '../../shared/utils.js';
import type { RuleMetadata } from '../../shared/types.js';

const RULE_GLOB_IGNORES = ['**/node_modules/**', '**/.git/**'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Escape text nodes (<description>, <content>). */
function escapeXmlTextNode(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Escape double-quoted attribute values. */
function escapeXmlAttr(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export class RuleManager {
  private static instance: RuleManager | undefined;

  private readonly byName = new Map<string, RuleMetadata>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- singleton
  private constructor() {}

  static getInstance(): RuleManager {
    logCoreEvent('rules', 'RuleManager.getInstance');
    RuleManager.instance ??= new RuleManager();
    return RuleManager.instance;
  }

  /**
   * Resolve builtin rules directory:
   * 1. `dist/builtin-rules` — copied by `copyfiles` next to bundled `dist/index.js`
   * 2. `src/builtin-rules` — dev when this module lives under `src/core/rules`
   * 3. `<packageRoot>/builtin-rules` — optional checkout beside package.json
   */
  resolveBuiltinRulesDir(): string {
    logCoreEvent('rules', 'RuleManager.resolveBuiltinRulesDir');
    const nextToBundle = path.join(import.meta.dirname, 'builtin-rules');
    if (existsSync(nextToBundle)) {
      return nextToBundle;
    }
    const srcTreePath = path.join(import.meta.dirname, '../../builtin-rules');
    if (existsSync(srcTreePath)) {
      return srcTreePath;
    }
    return path.join(findAclixPackageRoot(import.meta.dirname), 'builtin-rules');
  }

  async scanRules(cwd: string): Promise<void> {
    logCoreEvent('rules', 'RuleManager.scanRules', { cwd });
    this.byName.clear();

    const sources: { dir: string; scope: RuleMetadata['scope'] }[] = [
      { dir: this.resolveBuiltinRulesDir(), scope: 'builtin' },
      { dir: path.join(os.homedir(), '.aclix', 'rules'), scope: 'user' },
      { dir: path.join(cwd, '.aclix', 'rules'), scope: 'project' },
    ];

    for (const { dir, scope } of sources) {
      if (!existsSync(dir)) {
        continue;
      }

      const files = await fg('**/RULE.md', {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        dot: false,
        ignore: RULE_GLOB_IGNORES,
      });

      for (const filePath of files) {
        await this.ingestRuleFile(filePath, scope);
      }
    }
  }

  private async ingestRuleFile(filePath: string, scope: RuleMetadata['scope']): Promise<void> {
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

    const fm = toRecord(parsed.data);
    const nameRaw = fm.name;
    const descriptionRaw = fm.description;

    const ruleDir = path.dirname(filePath);
    const folderName = path.basename(ruleDir);
    const name = isNonEmptyString(nameRaw) ? nameRaw.trim() : folderName;
    const description = isNonEmptyString(descriptionRaw)
      ? descriptionRaw.trim()
      : 'Rule: ' + folderName;

    const content =
      typeof parsed.content === 'string' ? parsed.content : String(parsed.content);

    const meta: RuleMetadata = {
      name,
      description,
      content,
      ruleDir,
      scope,
    };

    this.byName.set(meta.name, meta);
  }

  getAvailableRules(): RuleMetadata[] {
    logCoreEvent('rules', 'RuleManager.getAvailableRules');
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getRulesPrompt(): string {
    logCoreEvent('rules', 'RuleManager.getRulesPrompt');
    const rules = this.getAvailableRules();
    return rules
      .map(
        (r) =>
          `<rule name="${escapeXmlAttr(r.name)}" scope="${escapeXmlAttr(r.scope)}">\n` +
          `  <description>${escapeXmlTextNode(r.description)}</description>\n` +
          `  <content>${escapeXmlTextNode(r.content)}</content>\n` +
          `</rule>`,
      )
      .join('\n');
  }
}
