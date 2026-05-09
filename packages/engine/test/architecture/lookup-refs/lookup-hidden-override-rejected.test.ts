// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecConsiderationDef, GameSpecDoc, GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';

const HIDDEN_OVERRIDE_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED;

const lookupExpr = (onHidden: unknown): GameSpecPolicyExpr => ({
  lookup: {
    surface: 'policyState',
    collection: 'zones',
    keyType: 'ZoneId',
    key: { ref: 'microturn.option.value' },
    path: ['properties', 'population'],
    onMissing: 'unavailable',
    onHidden,
  } as unknown as GameSpecPolicyExpr,
});

function baseDoc(considerations: Readonly<Record<string, GameSpecConsiderationDef>>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'lookup-hidden-override-rejected', players: { min: 2, max: 2 } },
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
            pruningRules: [],
            considerations: Object.keys(considerations),
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
      bindings: { us: 'baseline' },
    },
  };
}

describe('lookup hidden override diagnostic', () => {
  it('rejects constant onHidden overrides', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferVisiblePopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: lookupExpr({ constant: 0 }),
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    }));

    const diagnostic = result.diagnostics.find((entry) => entry.code === HIDDEN_OVERRIDE_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferVisiblePopulation.value.lookup.onHidden');
    assert.match(diagnostic?.message ?? '', /hidden state/u);
  });

  it('accepts omitted and unavailable onHidden declarations', () => {
    for (const onHidden of [undefined, 'unavailable'] as const) {
      const value = onHidden === undefined
        ? {
            lookup: {
              surface: 'policyState',
              collection: 'zones',
              keyType: 'ZoneId',
              key: { ref: 'microturn.option.value' },
              path: ['properties', 'population'],
              onMissing: 'unavailable',
            },
          } as const
        : lookupExpr(onHidden);
      const result = compileGameSpecToGameDef(baseDoc({
        preferVisiblePopulation: {
          scopes: ['microturn'],
          weight: 1,
          value,
          lookupFallback: { onUnavailable: 'noContribution' },
        },
      }));

      assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
      const compiled = result.gameDef?.agents?.compiled.considerations.preferVisiblePopulation?.value;
      assert.equal(compiled?.kind, 'ref');
      assert.equal(compiled?.kind === 'ref' && compiled.ref.kind === 'lookup' ? compiled.ref.onHidden : undefined, 'unavailable');
    }
  });
});
