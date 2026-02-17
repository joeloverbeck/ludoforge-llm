import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { compileGameSpecToGameDef, loadGameSpecSource, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

export interface CompiledProductionSpec {
  readonly markdown: string;
  readonly parsed: ReturnType<typeof parseGameSpec>;
  readonly validatorDiagnostics: ReturnType<typeof validateGameSpec>;
  readonly compiled: ReturnType<typeof compileGameSpecToGameDef>;
}

const FITL_PRODUCTION_SPEC_PATH = join(process.cwd(), '..', '..', 'data', 'games', 'fire-in-the-lake');
const TEXAS_PRODUCTION_SPEC_PATH = join(process.cwd(), '..', '..', 'data', 'games', 'texas-holdem');
const FIXTURE_BASE_PATH = join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler');

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
  const hash = createHash('sha256').update(markdown).digest('hex');

  if (cachedFitlResult !== null && cachedFitlHash === hash) {
    return cachedFitlResult;
  }

  const parsed = parseGameSpec(markdown);
  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  cachedFitlResult = { markdown, parsed, validatorDiagnostics, compiled };
  cachedFitlHash = hash;

  return cachedFitlResult;
}

/**
 * Lazy-cached parse + validate + compile of the Texas production spec.
 * Cache invalidates when the file content hash changes.
 */
export function compileTexasProductionSpec(): CompiledProductionSpec {
  const markdown = readTexasProductionSpec();
  const hash = createHash('sha256').update(markdown).digest('hex');

  if (cachedTexasResult !== null && cachedTexasHash === hash) {
    return cachedTexasResult;
  }

  const parsed = parseGameSpec(markdown);
  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  cachedTexasResult = { markdown, parsed, validatorDiagnostics, compiled };
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
