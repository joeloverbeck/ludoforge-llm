// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelector } from '../../src/agents/policy-selector-eval.js';
import type { CompiledPolicySelector, GameDef, GameState } from '../../src/kernel/index.js';

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function selector(): CompiledPolicySelector {
  return {
    id: 'deterministicZones' as CompiledPolicySelector['id'],
    scopes: ['move'],
    source: {
      kind: 'product',
      left: { kind: 'zones' },
      right: { kind: 'players' },
      maxPairs: 8,
    },
    quality: {
      components: [{ id: 'constant' as any, value: { kind: 'literal', value: 1 }, weight: 1 }],
      order: 'qualityDesc',
    },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    costClass: 'state',
    dependencies: emptyDeps,
  };
}

function state(): GameState {
  return {
    zones: { gamma: [], alpha: [], beta: [] },
    playerCount: 2,
  } as unknown as GameState;
}

function selectorStream(): readonly unknown[] {
  const view = evaluateSelector(selector(), {
    def: {} as GameDef,
    state: state(),
    candidates: [],
    evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number : undefined,
  });
  return view.selected.map((item) => ({
    key: item.key,
    quality: item.quality,
    rank: item.rank,
    components: [...item.components.entries()],
  }));
}

describe('agent selector determinism', () => {
  it('produces bit-identical selector streams for repeated same-seed state evaluation', () => {
    assert.deepEqual(selectorStream(), selectorStream());
  });
});
