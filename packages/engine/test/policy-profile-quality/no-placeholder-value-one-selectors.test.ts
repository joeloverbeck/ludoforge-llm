// @test-class: architectural-invariant
// Spec 205 §7: faction-agnostic forward protection for ARVN / US / NVA / VC / future factions.
import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

type YamlRecord = Record<string, unknown>;

interface SelectorGroup {
  readonly selectors: YamlRecord;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly selectorId: string;
  readonly componentId: string;
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../../..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const DATA_GAMES_ROOT = join(REPO_ROOT, 'data/games');

describe('Spec 205 no placeholder value-one selectors invariant', () => {
  it('rejects scalar value: 1 selector components across all game agent libraries', () => {
    const files = findAgentsFiles(DATA_GAMES_ROOT);
    const violations = files.flatMap(findValueOneSelectorComponents);

    assert.deepEqual(
      violations,
      [],
      violations.map(formatViolation).join('\n'),
    );
  });
});

function findAgentsFiles(root: string): readonly string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAgentsFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith('-agents.md')) {
      results.push(absolute);
    }
  }
  return results.sort();
}

function findValueOneSelectorComponents(file: string): readonly Violation[] {
  const text = readFileSync(file, 'utf8');
  const yamlBlock = extractYamlBlock(text);
  if (yamlBlock === undefined) {
    return [];
  }

  const parsed = parse(yamlBlock.yaml) as unknown;
  const selectorGroups = collectSelectorGroups(parsed);
  const violations: Violation[] = [];

  for (const group of selectorGroups) {
    for (const [selectorId, selector] of Object.entries(group.selectors)) {
      const components = selectorQualityComponents(selector);
      for (const [index, component] of components.entries()) {
        if (component.value !== 1) {
          continue;
        }
        const componentId = typeof component.id === 'string'
          ? component.id
          : `component-${index}`;
        violations.push({
          file,
          line: findComponentLine(text, yamlBlock.startLine, componentId),
          selectorId,
          componentId,
        });
      }
    }
  }

  return violations;
}

function extractYamlBlock(text: string): { readonly yaml: string; readonly startLine: number } | undefined {
  const match = /```ya?ml\n([\s\S]*?)\n```/u.exec(text);
  if (match?.index === undefined || match[1] === undefined) {
    return undefined;
  }
  const prefix = text.slice(0, match.index);
  return {
    yaml: match[1],
    startLine: prefix.split('\n').length + 1,
  };
}

function collectSelectorGroups(value: unknown): readonly SelectorGroup[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectSelectorGroups);
  }
  if (!isRecord(value)) {
    return [];
  }

  const library = value.library;
  const selectors = isRecord(library) && isRecord(library.selectors)
    ? [{ selectors: library.selectors }]
    : [];

  return [
    ...selectors,
    ...Object.values(value).flatMap(collectSelectorGroups),
  ];
}

function selectorQualityComponents(selector: unknown): readonly YamlRecord[] {
  if (!isRecord(selector) || !isRecord(selector.quality) || !Array.isArray(selector.quality.components)) {
    return [];
  }
  return selector.quality.components.filter(isRecord);
}

function findComponentLine(text: string, yamlStartLine: number, componentId: string): number {
  const yamlLines = text.split('\n').slice(yamlStartLine - 1);
  const escapedId = escapeRegExp(componentId);
  const pattern = new RegExp(`\\bid:\\s*['"]?${escapedId}['"]?\\b`, 'u');
  const index = yamlLines.findIndex((line) => pattern.test(line));
  return index >= 0 ? yamlStartLine + index : yamlStartLine;
}

function formatViolation(violation: Violation): string {
  return `${relativePath(violation.file)}:${violation.line}:${violation.selectorId}:${violation.componentId} uses scalar value: 1`;
}

function relativePath(file: string): string {
  return file.startsWith(`${REPO_ROOT}/`) ? file.slice(REPO_ROOT.length + 1) : basename(file);
}

function isRecord(value: unknown): value is YamlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
