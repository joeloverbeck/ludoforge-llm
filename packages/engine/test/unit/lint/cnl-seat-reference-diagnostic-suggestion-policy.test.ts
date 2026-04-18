// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyzeCanonicalSymbolOwnerPolicy } from '../../helpers/lint-policy-helpers.js';

const CANONICAL_MODULE_BASENAME = 'seat-reference-diagnostic-suggestion-policy.ts';
const CANONICAL_IMPORT_SPECIFIER = './seat-reference-diagnostic-suggestion-policy.js';
const POLICY_SYMBOLS = [
  'SEAT_REFERENCE_FALLBACK_SUGGESTION',
  'SEAT_REFERENCE_SELECTED_CATALOG_FALLBACK_SUGGESTION',
  'SELF_OR_SEAT_REFERENCE_FALLBACK_SUGGESTION',
] as const;

const POLICY_LITERALS = [
  'Use one of the declared seat ids.',
  'Use one of the declared seat ids from the selected seat catalog.',
  'Use "self" or one of the declared seat ids.',
] as const;

describe('cnl seat-reference diagnostic suggestion policy boundary', () => {
  it('keeps seat-reference suggestion policy symbols/literals on canonical module with no alias boundaries', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const report = analyzeCanonicalSymbolOwnerPolicy(thisDir, {
      moduleSubdir: ['src', 'cnl'],
      canonicalModuleBasename: CANONICAL_MODULE_BASENAME,
      canonicalImportSpecifier: CANONICAL_IMPORT_SPECIFIER,
      symbolNames: POLICY_SYMBOLS,
      prohibitedDuplicateLiterals: POLICY_LITERALS,
    });

    assert.deepEqual(
      report.duplicateLiteralLocations,
      [],
      'seat-reference diagnostic suggestion literals must be defined only in the canonical policy module',
    );

    assert.deepEqual(
      report.invalidImports,
      [],
      'CNL modules must import seat-reference diagnostic suggestion constants only from the canonical policy module without aliasing',
    );

    assert.deepEqual(
      report.invalidReExports,
      [],
      'non-canonical CNL modules must not re-export seat suggestion policy symbols or wildcard-re-export the canonical policy module',
    );

    assert.deepEqual(
      report.invalidNonCanonicalExports,
      [],
      'seat suggestion policy symbols must be exported only from the canonical policy module',
    );

    assert.deepEqual(
      report.invalidLocalDefinitions,
      [],
      'non-canonical CNL modules must not define seat suggestion policy symbols locally',
    );
  });
});
