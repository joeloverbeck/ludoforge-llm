// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecConsiderationDef, GameSpecDoc, GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';

const REQUIRED_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK;

const lookupExpr = (): GameSpecPolicyExpr => ({
  lookup: {
    surface: 'policyState',
    collection: 'zones',
    keyType: 'ZoneId',
    key: { ref: 'microturn.option.value' },
    path: ['properties', 'population'],
    onMissing: 'unavailable',
  },
});

function baseDoc(considerations: Readonly<Record<string, GameSpecConsiderationDef>>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'lookupfallback-required-diagnostic', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seat-catalog',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'us' }, { id: 'them' }] },
    }],
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'us', value: 0 }, { seat: 'them', value: 0 }],
      ranking: { order: 'desc' },
    },
    observability: {
      observers: {
        currentPlayer: {
          surfaces: {},
          zones: {
            board: { tokens: 'public', order: 'public' },
          },
        },
      },
    },
    agents: {
      parameters: {},
      library: {
        considerations,
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: {
            guardrails: [],
            considerations: Object.keys(considerations),
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
      bindings: { us: 'baseline' },
    },
  };
}

describe('lookupFallback required diagnostic', () => {
  it('rejects lookup considerations without explicit fallback', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferVisiblePopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: lookupExpr(),
      },
    }));

    const diagnostic = result.diagnostics.find((entry) => entry.code === REQUIRED_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferVisiblePopulation.lookupFallback');
    assert.match(diagnostic?.message ?? '', /preferVisiblePopulation/u);
    assert.match(diagnostic?.message ?? '', /lookup ref/u);
  });

  it('compiles lookup considerations with noContribution fallback', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferVisiblePopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: lookupExpr(),
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.library.considerations.preferVisiblePopulation?.lookupFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.lookupFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.equal(result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.hasLookupRef, true);
    const value = result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.value;
    assert.equal(value?.kind, 'ref');
    assert.equal(value?.kind === 'ref' ? value.ref.kind : undefined, 'lookup');
  });

  it('compiles lookup considerations with explicit constant fallback and unknownAs', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferVisiblePopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: lookupExpr(),
        unknownAs: 7,
        lookupFallback: { onUnavailable: { constant: 0 } },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.unknownAs, 7);
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.lookupFallback,
      { onUnavailable: { kind: 'constant', value: 0 } },
    );
  });
});
