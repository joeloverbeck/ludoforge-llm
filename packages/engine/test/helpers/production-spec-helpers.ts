import { createHash } from 'node:crypto';
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { CompileResult, RunGameSpecStagesResult } from '../../src/cnl/index.js';
import { loadGameSpecSource, runGameSpecStagesFromEntrypoint } from '../../src/cnl/index.js';

export interface CompiledProductionSpec {
  readonly markdown: string;
  readonly parsed: RunGameSpecStagesResult['parsed'];
  readonly validatorDiagnostics: RunGameSpecStagesResult['validation']['diagnostics'];
  readonly compiled: CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> };
}

function resolveRepoRoot(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  let cursor = here;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }

  // Fallback preserves previous behavior if the workspace marker is unavailable.
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();
const FITL_PRODUCTION_SPEC_PATH = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake');
const TEXAS_PRODUCTION_SPEC_PATH = join(REPO_ROOT, 'data', 'games', 'texas-holdem');
const FITL_PRODUCTION_ENTRYPOINT_PATH = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const TEXAS_PRODUCTION_ENTRYPOINT_PATH = join(REPO_ROOT, 'data', 'games', 'texas-holdem.game-spec.md');
const FIXTURE_BASE_PATH = join(REPO_ROOT, 'packages', 'engine', 'test', 'fixtures', 'cnl', 'compiler');

let cachedFitlResult: CompiledProductionSpec | null = null;
let cachedFitlHash: string | null = null;
let cachedTexasResult: CompiledProductionSpec | null = null;
let cachedTexasHash: string | null = null;

/**
 * Reads the raw FITL production spec markdown.
 */
export function readProductionSpec(): string {
  return loadGameSpecSource(FITL_PRODUCTION_SPEC_PATH).markdown;
}

/**
 * Reads the raw Texas production spec markdown.
 */
export function readTexasProductionSpec(): string {
  return loadGameSpecSource(TEXAS_PRODUCTION_SPEC_PATH).markdown;
}

/**
 * Lazy-cached parse + validate + compile of the FITL production spec.
 * Cache invalidates when the file content hash changes.
 * All FITL game-rule tests should use this instead of per-fixture compilation.
 */
export function compileProductionSpec(): CompiledProductionSpec {
  const markdown = readProductionSpec();
  const hash = createHash('sha256')
    .update(readFileSync(FITL_PRODUCTION_ENTRYPOINT_PATH, 'utf8'))
    .update(markdown)
    .digest('hex');

  if (cachedFitlResult !== null && cachedFitlHash === hash) {
    return cachedFitlResult;
  }

  const staged = runGameSpecStagesFromEntrypoint(FITL_PRODUCTION_ENTRYPOINT_PATH);
  const compiled = requireSuccessfulProductionCompilation('FITL production spec', staged);

  cachedFitlResult = {
    markdown,
    parsed: staged.parsed,
    validatorDiagnostics: staged.validation.diagnostics,
    compiled,
  };
  cachedFitlHash = hash;

  return cachedFitlResult;
}

/**
 * Lazy-cached parse + validate + compile of the Texas production spec.
 * Cache invalidates when the file content hash changes.
 */
export function compileTexasProductionSpec(): CompiledProductionSpec {
  const markdown = readTexasProductionSpec();
  const hash = createHash('sha256')
    .update(readFileSync(TEXAS_PRODUCTION_ENTRYPOINT_PATH, 'utf8'))
    .update(markdown)
    .digest('hex');

  if (cachedTexasResult !== null && cachedTexasHash === hash) {
    return cachedTexasResult;
  }

  const staged = runGameSpecStagesFromEntrypoint(TEXAS_PRODUCTION_ENTRYPOINT_PATH);
  const compiled = requireSuccessfulProductionCompilation('Texas production spec', staged);

  cachedTexasResult = {
    markdown,
    parsed: staged.parsed,
    validatorDiagnostics: staged.validation.diagnostics,
    compiled,
  };
  cachedTexasHash = hash;

  return cachedTexasResult;
}

/**
 * Centralized fixture reader — replaces the copy-pasted local function in ~10 test files.
 * For tests that still use engine-level (non-FITL) fixtures like compile-valid.md.
 */
export function readCompilerFixture(name: string): string {
  return loadGameSpecSource(join(FIXTURE_BASE_PATH, name)).markdown;
}

function requireSuccessfulProductionCompilation(
  label: string,
  staged: RunGameSpecStagesResult,
): CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> } {
  assert.equal(staged.validation.blocked, false, `${label} should not block validation after parse.`);
  assert.equal(staged.compilation.blocked, false, `${label} should not block compilation after parse.`);
  assert.equal(
    hasErrorDiagnostics(staged.parsed.diagnostics),
    false,
    `${label} should not contain parser errors:\n${formatDiagnosticSummary(staged.parsed.diagnostics)}`,
  );
  assert.equal(
    hasErrorDiagnostics(staged.validation.diagnostics),
    false,
    `${label} should not contain validator errors:\n${formatDiagnosticSummary(staged.validation.diagnostics)}`,
  );

  const compiled = staged.compilation.result;
  if (compiled === null) {
    assert.fail(`${label} should produce a compile result.`);
  }
  if (compiled.gameDef === null) {
    assert.fail(`${label} should produce a compiled gameDef.`);
  }

  return compiled as CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> };
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function formatDiagnosticSummary(diagnostics: readonly Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return '(none)';
  }

  return diagnostics
    .map((diagnostic) => `[${diagnostic.severity}] ${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`)
    .join('\n');
}
