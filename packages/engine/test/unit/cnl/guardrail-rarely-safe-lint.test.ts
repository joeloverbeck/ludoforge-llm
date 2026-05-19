// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc, GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';

const WARNING_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE;

function createDoc(
  guardrailWhen: GameSpecPolicyExpr,
  extraLibrary: Record<string, unknown> = {},
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'guardrail-rarely-safe-lint-test', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
      tags: ['pass'],
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc' },
    },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'p1' }, { id: 'p2' }] } }],
    agents: {
      library: {
        ...extraLibrary,
        guardrails: {
          rare: {
            traceLabel: 'rare guardrail',
            scopes: ['move'],
            when: guardrailWhen,
            severity: 'prune',
            safe: true,
            onAllPruned: { actionId: 'pass', traceLabel: 'fallback pass' },
            onUnavailable: 'noFire',
          },
        },
        considerations: { stable: { scopes: ['move'], weight: 1, value: 1 } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { guardrails: ['rare'], considerations: ['stable'], tieBreakers: ['stableMoveKey'] },
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

describe('guardrail rarely-safe profile-quality lint', () => {
  it('warns when a prune guardrail has no state- or candidate-varying dependencies', () => {
    const result = compileGameSpecToGameDef(createDoc(true));

    const warning = result.diagnostics.find((diagnostic) => diagnostic.code === WARNING_CODE);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(warning?.severity, 'warning');
    assert.match(warning?.message ?? '', /does not depend on state- or candidate-varying evidence/u);
  });

  it('does not warn when a prune guardrail depends on a state feature', () => {
    const result = compileGameSpecToGameDef(createDoc({ ref: 'feature.unsafeState' }, {
      stateFeatures: {
        unsafeState: { type: 'boolean', expr: true },
      },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === WARNING_CODE), false);
  });
});
