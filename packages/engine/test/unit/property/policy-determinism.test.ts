import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { completeClassifiedMoves } from '../../helpers/classified-move-fixtures.js';
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
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        currentRank: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      activeCardIdentity: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardTag: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardMetadata: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardAnnotation: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {},
      completionScoreTerms: {},
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
          completionScoreTerms: [],
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
  it('always returns one of the provided legal moves', () => {
    const def = createDef();
    const state = initialState(def, 99, 2).state;
    const legalMoves: readonly Move[] = [
      { actionId: asActionId('beta'), params: {} },
      { actionId: asActionId('gamma'), params: {} },
    ];

    const result = evaluatePolicyMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves,
      trustedMoveIndex: new Map(),
      rng: createRng(42n),
    });

    assert.deepEqual(
      legalMoves.some((candidate) => candidate.actionId === result.move.actionId && deepEqualParams(candidate.params, result.move.params)),
      true,
    );
  });

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
        trustedMoveIndex: new Map(),
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

  it('replays the same decision and metadata for the same input seed', () => {
    const def = createDef();
    const state = initialState(def, 13, 2).state;
    const legalMoves: readonly Move[] = [
      { actionId: asActionId('gamma'), params: {} },
      { actionId: asActionId('alpha'), params: {} },
      { actionId: asActionId('beta'), params: {} },
    ];

    const run = () =>
      evaluatePolicyMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves,
        trustedMoveIndex: new Map(),
        rng: createRng(17n),
      });

    const first = run();
    const second = run();

    assert.deepEqual(second.move, first.move);
    assert.deepEqual(second.rng, first.rng);
    assert.deepEqual(second.metadata, first.metadata);
  });

  it('keeps emergency fallback legal when evaluation cannot resolve a requested profile', () => {
    const def = createDef();
    const state = initialState(def, 99, 2).state;
    const legalMoves: readonly Move[] = [
      { actionId: asActionId('alpha'), params: {} },
      { actionId: asActionId('beta'), params: {} },
      { actionId: asActionId('gamma'), params: {} },
    ];
    const agent = new PolicyAgent({ profileId: 'missing-profile' });

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: completeClassifiedMoves(legalMoves),
      rng: createRng(42n),
    });

    assert.deepEqual(
      legalMoves.some((candidate) => candidate.actionId === result.move.actionId && deepEqualParams(candidate.params, result.move.params)),
      true,
    );
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.emergencyFallback, true);
    assert.equal(result.agentDecision.failure?.code, 'PROFILE_MISSING');
  });
});

function deepEqualParams(left: Move['params'], right: Move['params']): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
