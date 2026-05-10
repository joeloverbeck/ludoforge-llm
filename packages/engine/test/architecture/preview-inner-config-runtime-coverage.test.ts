// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

type PreviewInnerField =
  | 'chooseOne'
  | 'chooseNStep'
  | 'maxOptions'
  | 'chooseNBeamWidth'
  | 'depthCap'
  | 'strategy'
  | 'capClass'
  | 'continuedDeepening';

const PREVIEW_INNER_FIELDS: readonly PreviewInnerField[] = [
  'chooseOne',
  'chooseNStep',
  'maxOptions',
  'chooseNBeamWidth',
  'depthCap',
  'strategy',
  'capClass',
  'continuedDeepening',
];

const TRACE_ONLY_ALLOWLIST: Readonly<Record<string, string>> = {};

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const REPO_ROOT = resolveRepoRoot();
const ENGINE_ROOT = join(REPO_ROOT, 'packages/engine');
const PREVIEW_INNER_TYPE_PATH = join(ENGINE_ROOT, 'src/kernel/types-core.ts');
const AGENT_SOURCE_ROOT = join(ENGINE_ROOT, 'src/agents');
const CNL_SOURCE_ROOT = join(ENGINE_ROOT, 'src/cnl');

const collectTypeKeys = (source: string): readonly string[] => {
  const match = /export interface CompiledAgentPreviewInnerConfig\s*\{(?<body>[\s\S]*?)\n\}/u.exec(source);
  assert.ok(match?.groups?.body, 'CompiledAgentPreviewInnerConfig interface must be present');
  return [...match.groups.body.matchAll(/readonly\s+(?<key>[A-Za-z0-9_]+)\??\s*:/gu)]
    .map((keyMatch) => keyMatch.groups?.key)
    .filter((key): key is string => key !== undefined)
    .sort((left, right) => left.localeCompare(right));
};

const collectFiles = (rootPath: string): readonly string[] => {
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && absolutePath.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const collectMatchingLines = (rootPath: string, pattern: RegExp): readonly string[] => {
  const hits: string[] = [];

  for (const filePath of collectFiles(rootPath)) {
    if (filePath.includes('/test/')) {
      continue;
    }
    const source = readFileSync(filePath, 'utf8');
    const lines = source.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[lineIndex]!)) {
        hits.push(`${filePath.replace(`${REPO_ROOT}/`, '')}:${lineIndex + 1}:${lines[lineIndex]!.trim()}`);
      }
    }
  }

  return hits;
};

const propertyPattern = (field: string): RegExp =>
  new RegExp(`(?:\\.${field}\\b|\\b${field}\\s*:)`, 'u');

const compilerDiagnosticPattern = (field: string): RegExp =>
  new RegExp(`(?:\\b${field}\\b|\\.inner\\.${field}\\b)`, 'u');

const hasRuntimeConsumer = (field: string): boolean =>
  collectMatchingLines(AGENT_SOURCE_ROOT, propertyPattern(field)).length > 0;

const hasCompilerDiagnosticGate = (field: string): boolean =>
  collectMatchingLines(CNL_SOURCE_ROOT, compilerDiagnosticPattern(field))
    .some((hit) => hit.includes('diagnostics.push') || hit.includes(`'${field}'`) || hit.includes(`.inner.${field}`));

const classifyField = (field: string): 'runtime-consumer' | 'compiler-diagnostic' | 'trace-only' | 'orphaned' => {
  if (hasRuntimeConsumer(field)) {
    return 'runtime-consumer';
  }
  if (hasCompilerDiagnosticGate(field)) {
    return 'compiler-diagnostic';
  }
  if (TRACE_ONLY_ALLOWLIST[field] !== undefined) {
    return 'trace-only';
  }
  return 'orphaned';
};

describe('preview.inner config runtime coverage', () => {
  it('keeps the maintained preview.inner field inventory aligned with the compiled type', () => {
    assert.equal(statSync(PREVIEW_INNER_TYPE_PATH).isFile(), true);
    const typeSource = readFileSync(PREVIEW_INNER_TYPE_PATH, 'utf8');
    const typeKeys = collectTypeKeys(typeSource);

    assert.deepEqual(
      [...PREVIEW_INNER_FIELDS].sort((left, right) => left.localeCompare(right)),
      typeKeys,
      'PREVIEW_INNER_FIELDS must enumerate every CompiledAgentPreviewInnerConfig key exactly once',
    );
  });

  it('requires every preview.inner field to have a runtime consumer, compiler diagnostic, or explicit trace-only allowlist entry', () => {
    const orphanedFields = PREVIEW_INNER_FIELDS
      .map((field) => ({ field, classification: classifyField(field) }))
      .filter((entry) => entry.classification === 'orphaned')
      .map((entry) => entry.field);

    assert.deepEqual(orphanedFields, [], `orphaned preview.inner fields: ${orphanedFields.join(', ')}`);
  });

  it('fails the audit for a maintained field with no runtime or compiler coverage', () => {
    assert.equal(classifyField('__fictitiousPreviewInnerField'), 'orphaned');
  });
});
