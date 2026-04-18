// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';
import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
} from '../../src/cnl/index.js';
import type { GameSpecDoc } from '../../src/cnl/index.js';

const ZONE_ID_DIAGNOSTIC_CODES = new Set([
  'CNL_COMPILER_ZONE_ID_UNKNOWN',
  'CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN',
  'CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN',
]);

describe('zone ID cross-reference validation — production spec regression', () => {
  it('FITL production spec produces zero zone ID diagnostics', () => {
    const production = compileProductionSpec();
    const zoneIdDiagnostics = production.compiled.diagnostics.filter(
      (d) => ZONE_ID_DIAGNOSTIC_CODES.has(d.code),
    );
    assert.deepEqual(
      zoneIdDiagnostics,
      [],
      `Expected zero zone ID diagnostics but found ${zoneIdDiagnostics.length}:\n${zoneIdDiagnostics.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });

  it('Texas Hold\'em production spec produces zero zone ID diagnostics', () => {
    const production = compileTexasProductionSpec();
    const zoneIdDiagnostics = production.compiled.diagnostics.filter(
      (d) => ZONE_ID_DIAGNOSTIC_CODES.has(d.code),
    );
    assert.deepEqual(
      zoneIdDiagnostics,
      [],
      `Expected zero zone ID diagnostics but found ${zoneIdDiagnostics.length}:\n${zoneIdDiagnostics.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });
});

describe('zone ID cross-reference validation — minimal specs', () => {
  it('emits CNL_COMPILER_ZONE_ID_UNKNOWN for a deliberate zone ID typo', () => {
    const doc: GameSpecDoc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'zone-id-typo-test', players: { min: 2, max: 2 } },
      zones: [
        { id: 'deck', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      setup: [
        { moveToken: { token: '$card', from: 'decks:none', to: 'deck:none' } },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const zoneIdUnknown = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_ZONE_ID_UNKNOWN',
    );
    assert.ok(
      zoneIdUnknown.length > 0,
      'Expected at least one CNL_COMPILER_ZONE_ID_UNKNOWN diagnostic for typo "decks:none"',
    );
  });

  it('emits zero CNL_COMPILER_ZONE_ID_UNKNOWN for correct zone references', () => {
    const doc: GameSpecDoc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'zone-id-correct-test', players: { min: 2, max: 2 } },
      zones: [
        { id: 'deck', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      setup: [
        { moveToken: { token: '$card', from: 'deck:none', to: 'deck:none' } },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const zoneIdUnknown = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_ZONE_ID_UNKNOWN',
    );
    assert.deepEqual(
      zoneIdUnknown,
      [],
      `Expected zero CNL_COMPILER_ZONE_ID_UNKNOWN diagnostics but found ${zoneIdUnknown.length}:\n${zoneIdUnknown.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });
});
