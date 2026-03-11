import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { LoadedGameSpecBundle } from '../../src/cnl/index.js';
import type { CompileResult, RunGameSpecStagesResult } from '../../src/cnl/index.js';
import { loadGameSpecBundleFromEntrypoint, loadGameSpecSource, runGameSpecStagesFromBundle } from '../../src/cnl/index.js';

export interface CompiledProductionSpec {
  readonly markdown: string;
  readonly parsed: RunGameSpecStagesResult['parsed'];
  readonly validatorDiagnostics: RunGameSpecStagesResult['validation']['diagnostics'];
  readonly compiled: CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> };
}

export interface ProductionGameFixture extends CompiledProductionSpec {
  readonly gameDef: NonNullable<CompileResult['gameDef']>;
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
const TEXAS_PRODUCTION_SPEC_PATH = join(REPO_ROOT, 'data', 'games', 'texas-holdem');
const FITL_PRODUCTION_ENTRYPOINT_PATH = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const TEXAS_PRODUCTION_ENTRYPOINT_PATH = join(REPO_ROOT, 'data', 'games', 'texas-holdem.game-spec.md');
const FIXTURE_BASE_PATH = join(REPO_ROOT, 'packages', 'engine', 'test', 'fixtures', 'cnl', 'compiler');

let cachedFitlBundle: LoadedGameSpecBundle | null = null;
let cachedFitlResult: CompiledProductionSpec | null = null;
let cachedFitlFixture: ProductionGameFixture | null = null;
let cachedTexasBundle: LoadedGameSpecBundle | null = null;
let cachedTexasResult: CompiledProductionSpec | null = null;
let cachedTexasFixture: ProductionGameFixture | null = null;

/**
 * Loads the FITL production spec through the canonical entrypoint and caches the parsed result.
 */
export function parseProductionSpec(): RunGameSpecStagesResult['parsed'] {
  return loadFitlBundle().parsed;
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
  const bundle = loadFitlBundle();
  if (cachedFitlResult !== null && cachedFitlBundle?.sourceFingerprint === bundle.sourceFingerprint) {
    return cachedFitlResult;
  }

  const staged = runGameSpecStagesFromBundle(bundle);
  const compiled = requireSuccessfulProductionCompilation('FITL production spec', staged);

  cachedFitlResult = {
    markdown: bundle.sources.map((source) => source.markdown).join('\n\n'),
    parsed: bundle.parsed,
    validatorDiagnostics: staged.validation.diagnostics,
    compiled,
  };

  return cachedFitlResult;
}

/**
 * Runtime suites should bind this once per file and reuse the explicit fixture.
 */
export function getFitlProductionFixture(): ProductionGameFixture {
  const compiled = compileProductionSpec();
  if (cachedFitlFixture !== null && cachedFitlFixture.compiled === compiled.compiled) {
    return cachedFitlFixture;
  }

  cachedFitlFixture = {
    ...compiled,
    gameDef: compiled.compiled.gameDef,
  };

  return cachedFitlFixture;
}

/**
 * Lazy-cached parse + validate + compile of the Texas production spec.
 * Cache invalidates when the file content hash changes.
 */
export function compileTexasProductionSpec(): CompiledProductionSpec {
  const bundle = loadTexasBundle();
  if (cachedTexasResult !== null && cachedTexasBundle?.sourceFingerprint === bundle.sourceFingerprint) {
    return cachedTexasResult;
  }

  const staged = runGameSpecStagesFromBundle(bundle);
  const compiled = requireSuccessfulProductionCompilation('Texas production spec', staged);

  cachedTexasResult = {
    markdown: bundle.sources.map((source) => source.markdown).join('\n\n'),
    parsed: staged.parsed,
    validatorDiagnostics: staged.validation.diagnostics,
    compiled,
  };

  return cachedTexasResult;
}

/**
 * Runtime suites should bind this once per file and reuse the explicit fixture.
 */
export function getTexasProductionFixture(): ProductionGameFixture {
  const compiled = compileTexasProductionSpec();
  if (cachedTexasFixture !== null && cachedTexasFixture.compiled === compiled.compiled) {
    return cachedTexasFixture;
  }

  cachedTexasFixture = {
    ...compiled,
    gameDef: compiled.compiled.gameDef,
  };

  return cachedTexasFixture;
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

function loadFitlBundle(): LoadedGameSpecBundle {
  const loaded = loadGameSpecBundleFromEntrypoint(FITL_PRODUCTION_ENTRYPOINT_PATH);
  if (cachedFitlBundle !== null && cachedFitlBundle.sourceFingerprint === loaded.sourceFingerprint) {
    return cachedFitlBundle;
  }
  cachedFitlBundle = loaded;
  return loaded;
}

function loadTexasBundle(): LoadedGameSpecBundle {
  const loaded = loadGameSpecBundleFromEntrypoint(TEXAS_PRODUCTION_ENTRYPOINT_PATH);
  if (cachedTexasBundle !== null && cachedTexasBundle.sourceFingerprint === loaded.sourceFingerprint) {
    return cachedTexasBundle;
  }
  cachedTexasBundle = loaded;
  return loaded;
}
