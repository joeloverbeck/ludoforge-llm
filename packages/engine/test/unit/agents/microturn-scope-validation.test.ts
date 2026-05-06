// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const createCompileReadyDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'microturn-scope-validation-test', players: { min: 1, max: 1 } },
  observability: {
    observers: {
      testObserver: {
        surfaces: {
          victory: { currentMargin: 'public' },
        },
      },
    },
  },
  zones: [],
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
  }],
  dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
  terminal: { conditions: [] },
});

function compileConsideration(scopes: readonly string[], valueRef: string) {
  const value = valueRef === 'candidate.tag.pass'
    ? { boolToNumber: { ref: valueRef } }
    : { boolToNumber: { eq: [{ ref: valueRef }, valueRef.includes('actionId') ? 'pass' : 'patronage'] } };
  return compileGameSpecToGameDef({
    ...createCompileReadyDoc(),
    agents: {
      parameters: {},
      library: {
        considerations: {
          invalid: {
            scopes,
            weight: 1,
            value,
          },
        },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: {
            pruningRules: [],
            considerations: ['invalid'],
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
      bindings: { solo: 'baseline' },
    },
  });
}

describe('microturn scope validation', () => {
  it('rejects move-only refs from microturn-scoped considerations', () => {
    for (const ref of ['move.actionId', 'candidate.tag.pass']) {
      const compiled = compileConsideration(['microturn'], ref);
      assert.equal(compiled.gameDef, null);
      assert.ok(
        compiled.diagnostics.some((diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION'
          && diagnostic.message.includes('microturn-scoped')
          && diagnostic.suggestion?.includes('move.* refs cannot be used in microturn-scope considerations')),
        `expected microturn scope diagnostic for ${ref}`,
      );
    }
  });

  it('rejects microturn refs from move-scoped considerations', () => {
    const compiled = compileConsideration(['move'], 'microturn.option.value');

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION'
        && diagnostic.message.includes('move-scoped')
        && diagnostic.message.includes('microturn-only refs')),
    );
  });

  it('rejects the retired completion scope with migration diagnostics', () => {
    const compiled = compileConsideration(['completion'], 'microturn.option.value');

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some((diagnostic) =>
        diagnostic.path.startsWith('doc.agents.library.considerations.invalid.scopes')
        && diagnostic.message.includes('scopes: [completion] is removed')
        && diagnostic.message.includes('microturn')),
    );
  });

  it('rejects retired completion-scope refs with per-kind migration diagnostics', () => {
    const cases = [
      ['option.value', 'microturn.option.value'],
      ['decision.type', 'microturn.kind'],
      ['decision.name', 'microturn.decisionKey'],
      ['decision.targetKind', 'microturn.option.targetKind'],
      ['decision.optionCount', 'microturn.remainingMaxCount'],
      ['candidate.param.eventCardId', 'candidate.param.* refs are removed'],
      ['preview.phase1', 'microturn.*'],
      ['preview.phase1CompletionsPerAction', 'microturn.*'],
    ] as const;

    for (const [ref, expected] of cases) {
      const compiled = compileConsideration(['microturn'], ref);
      assert.equal(compiled.gameDef, null, `expected ${ref} to fail compilation`);
      assert.ok(
        compiled.diagnostics.some((diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.message.includes(expected)),
        `expected migration diagnostic for ${ref}`,
      );
    }
  });
});
