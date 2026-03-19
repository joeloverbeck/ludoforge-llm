import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type GameDef,
  type Move,
  type ActionDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

function createAction(id: string): ActionDef {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
}

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 1,
    catalogFingerprint: 'catalog',
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {},
      tieBreakers: {
        rng: {
          kind: 'rng',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: [],
          tieBreakers: ['rng'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-determinism', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions: [createAction('alpha'), createAction('beta'), createAction('gamma')],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const results: T[][] = [];
  items.forEach((item, index) => {
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    permutations(rest).forEach((tail) => {
      results.push([item, ...tail]);
    });
  });
  return results;
}

describe('policy determinism', () => {
  it('keeps rng tie-break selection stable across legalMove permutations with the same seed', () => {
    const def = createDef();
    const state = initialState(def, 99, 2).state;
    const moves: readonly Move[] = [
      { actionId: asActionId('gamma'), params: {} },
      { actionId: asActionId('alpha'), params: {} },
      { actionId: asActionId('beta'), params: {} },
    ];

    const results = permutations(moves).map((legalMoves) =>
      evaluatePolicyMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves,
        rng: createRng(42n),
      }),
    );

    const first = results[0]!;
    for (const result of results.slice(1)) {
      assert.equal(result.move.actionId, first.move.actionId);
      assert.deepEqual(result.rng, first.rng);
      assert.deepEqual(result.metadata.canonicalOrder, first.metadata.canonicalOrder);
    }
  });
});
