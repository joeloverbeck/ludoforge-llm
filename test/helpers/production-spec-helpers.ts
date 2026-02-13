import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

export interface CompiledProductionSpec {
  readonly markdown: string;
  readonly parsed: ReturnType<typeof parseGameSpec>;
  readonly validatorDiagnostics: ReturnType<typeof validateGameSpec>;
  readonly compiled: ReturnType<typeof compileGameSpecToGameDef>;
}

const PRODUCTION_SPEC_PATH = join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md');
const FIXTURE_BASE_PATH = join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler');

let cachedResult: CompiledProductionSpec | null = null;
let cachedHash: string | null = null;

/**
 * Reads the raw production spec markdown.
 */
export function readProductionSpec(): string {
  return readFileSync(PRODUCTION_SPEC_PATH, 'utf8');
}

/**
 * Lazy-cached parse + validate + compile of the FITL production spec.
 * Cache invalidates when the file content hash changes.
 * All FITL game-rule tests should use this instead of per-fixture compilation.
 */
export function compileProductionSpec(): CompiledProductionSpec {
  const markdown = readProductionSpec();
  const hash = createHash('sha256').update(markdown).digest('hex');

  if (cachedResult !== null && cachedHash === hash) {
    return cachedResult;
  }

  const parsed = parseGameSpec(markdown);
  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  cachedResult = { markdown, parsed, validatorDiagnostics, compiled };
  cachedHash = hash;

  return cachedResult;
}

/**
 * Centralized fixture reader — replaces the copy-pasted local function in ~10 test files.
 * For tests that still use engine-level (non-FITL) fixtures like compile-valid.md.
 */
export function readCompilerFixture(name: string): string {
  return readFileSync(join(FIXTURE_BASE_PATH, name), 'utf8');
}
