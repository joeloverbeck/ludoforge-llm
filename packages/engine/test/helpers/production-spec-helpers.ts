import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { LoadedGameSpecBundle } from '../../src/cnl/index.js';
import type { CompileResult, CompileSectionResults, RunGameSpecStagesResult } from '../../src/cnl/index.js';
import { loadGameSpecBundleFromEntrypoint, loadGameSpecSource, runGameSpecStagesFromBundle, validateGameSpec } from '../../src/cnl/index.js';
import { assertValidatedGameDef } from '../../src/kernel/validate-gamedef.js';
import {
  deriveGameKeyFromEntrypoint,
  GAMEDEF_CACHE_FORMAT_VERSION,
  readGameDefCache,
  writeGameDefCache,
  type GameDefCacheKey,
} from './gamedef-cache.js';

export interface CompiledProductionSpec {
  readonly markdown: string;
  readonly parsed: RunGameSpecStagesResult['parsed'];
  readonly validatorDiagnostics: RunGameSpecStagesResult['validation']['diagnostics'];
  readonly compiled: CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> };
}

export interface ProductionGameFixture extends CompiledProductionSpec {
  readonly gameDef: NonNullable<CompileResult['gameDef']>;
}

export interface ProductionGameDefFixture {
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
 * Test-only seam for integration tests that must distinguish persistent cache
 * hits from this module's in-process production-spec cache.
 */
export function __resetProductionSpecCacheForTests(): void {
  cachedFitlBundle = null;
  cachedFitlResult = null;
  cachedFitlFixture = null;
  cachedTexasBundle = null;
  cachedTexasResult = null;
  cachedTexasFixture = null;
}

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

  const cacheKey = productionCacheKey(FITL_PRODUCTION_ENTRYPOINT_PATH, bundle.sourceFingerprint);
  const cached = loadCompiledProductionSpecFromPersistentCache('FITL production spec', bundle, cacheKey);
  if (cached !== null) {
    cachedFitlResult = cached;
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

  persistCompiledProductionSpec(cacheKey, compiled);
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
 * Runtime perf harnesses that only need the compiled GameDef should not retain
 * parser/source-map artifacts into the measured route.
 */
export function getFitlProductionGameDefFixture(): ProductionGameDefFixture {
  const compiled = compileProductionSpec();
  const gameDef = compiled.compiled.gameDef;
  cachedFitlBundle = null;
  cachedFitlResult = null;
  cachedFitlFixture = null;
  return { gameDef };
}

export function getFitlBootstrapGameDefFixture(): ProductionGameDefFixture {
  return {
    gameDef: JSON.parse(readFileSync(join(REPO_ROOT, 'packages', 'runner', 'src', 'bootstrap', 'fitl-game-def.json'), 'utf8')) as NonNullable<CompileResult['gameDef']>,
  };
}

export function deriveFitlPopulationZeroSpaces(): readonly string[] {
  const parsed = parseProductionSpec();
  const mapAsset = (parsed.doc.dataAssets ?? []).find((asset) => asset.kind === 'map' && asset.id === 'fitl-map-production');
  if (mapAsset?.payload == null || typeof mapAsset.payload !== 'object') {
    return [];
  }

  const payload = mapAsset.payload as {
    readonly spaces?: readonly {
      readonly id: string;
      readonly attributes?: Readonly<Record<string, unknown>>;
    }[];
  };

  return (payload.spaces ?? [])
    .filter((space) => space.attributes?.population === 0)
    .map((space) => space.id.replace(/:none$/, ''));
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

  const cacheKey = productionCacheKey(TEXAS_PRODUCTION_ENTRYPOINT_PATH, bundle.sourceFingerprint);
  const cached = loadCompiledProductionSpecFromPersistentCache('Texas production spec', bundle, cacheKey);
  if (cached !== null) {
    cachedTexasResult = cached;
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

  persistCompiledProductionSpec(cacheKey, compiled);
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
  assert.equal(
    hasErrorDiagnostics(compiled.diagnostics),
    false,
    `${label} should not contain compiler errors (including cross-validation):\n${formatDiagnosticSummary(compiled.diagnostics)}`,
  );
  if (compiled.gameDef === null) {
    assert.fail(`${label} should produce a compiled gameDef.`);
  }

  return compiled as CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> };
}

function loadCompiledProductionSpecFromPersistentCache(
  label: string,
  bundle: LoadedGameSpecBundle,
  cacheKey: GameDefCacheKey,
): CompiledProductionSpec | null {
  const cached = readGameDefCache(cacheKey);
  if (cached === null) {
    return null;
  }

  try {
    const gameDef = assertValidatedGameDef(cached.gameDef);
    const validatorDiagnostics = validateGameSpec(bundle.parsed.doc, { sourceMap: bundle.parsed.sourceMap });
    assert.equal(
      hasErrorDiagnostics(bundle.parsed.diagnostics),
      false,
      `${label} should not contain parser errors:\n${formatDiagnosticSummary(bundle.parsed.diagnostics)}`,
    );
    assert.equal(
      hasErrorDiagnostics(validatorDiagnostics),
      false,
      `${label} should not contain validator errors:\n${formatDiagnosticSummary(validatorDiagnostics)}`,
    );

    return {
      markdown: bundle.sources.map((source) => source.markdown).join('\n\n'),
      parsed: bundle.parsed,
      validatorDiagnostics,
      compiled: {
        gameDef,
        sections: sectionsFromGameDef(gameDef),
        diagnostics: [],
      },
    };
  } catch {
    return null;
  }
}

function persistCompiledProductionSpec(
  cacheKey: GameDefCacheKey,
  compiled: CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> },
): void {
  try {
    writeGameDefCache(cacheKey, {
      gameDef: compiled.gameDef,
      sourceFingerprint: cacheKey.sourceFingerprint,
      compilerStamp: '',
    });
  } catch {
    // Persistent cache writes are accelerators; a failed write must not fail tests.
  }
}

function productionCacheKey(entrypointPath: string, sourceFingerprint: string): GameDefCacheKey {
  return {
    gameKey: deriveGameKeyFromEntrypoint(entrypointPath),
    sourceFingerprint,
    cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION,
  };
}

function sectionsFromGameDef(gameDef: NonNullable<CompileResult['gameDef']>): CompileSectionResults {
  return {
    metadata: gameDef.metadata,
    constants: gameDef.constants,
    globalVars: gameDef.globalVars,
    globalMarkerLattices: gameDef.globalMarkerLattices ?? null,
    perPlayerVars: gameDef.perPlayerVars,
    zoneVars: gameDef.zoneVars ?? null,
    zones: gameDef.zones,
    tokenTypes: gameDef.tokenTypes,
    setup: gameDef.setup,
    turnStructure: gameDef.turnStructure,
    turnOrder: gameDef.turnOrder ?? null,
    actionPipelines: gameDef.actionPipelines ?? null,
    derivedMetrics: gameDef.derivedMetrics ?? null,
    observers: gameDef.observers ?? null,
    agents: gameDef.agents ?? null,
    terminal: gameDef.terminal,
    actions: gameDef.actions,
    triggers: gameDef.triggers,
    eventDecks: gameDef.eventDecks ?? null,
    victoryStandings: gameDef.victoryStandings ?? null,
    verbalization: gameDef.verbalization ?? null,
  };
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
