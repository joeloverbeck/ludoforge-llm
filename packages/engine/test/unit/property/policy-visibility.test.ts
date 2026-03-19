import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 1,
    catalogFingerprint: 'visibility-catalog',
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {
        projectedMargin: {
          type: 'number',
          costClass: 'preview',
          expr: { ref: 'preview.var.global.usMargin' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {
        preferProjectedMargin: {
          costClass: 'preview',
          weight: 1,
          value: { ref: 'feature.projectedMargin' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
        },
      },
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
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
          scoreTerms: ['preferProjectedMargin'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedMargin'],
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
    metadata: { id: 'policy-visibility', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'usMargin', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('secret:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions: [
      {
        id: asActionId('alpha'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('advance'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'usMargin', delta: 3 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  };
}

describe('policy visibility', () => {
  it('keeps preview-backed evaluation invariant across acting-seat-invisible hidden state changes', () => {
    const def = createDef();
    const baseState = initialState(def, 7, 2).state;
    const leftState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'secret:none': [{ id: asTokenId('card-a'), type: 'card', props: { rank: 'A' } }],
      },
    };
    const rightState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'secret:none': [{ id: asTokenId('card-k'), type: 'card', props: { rank: 'K' } }],
      },
    };
    const legalMoves = [
      { actionId: asActionId('alpha'), params: {} },
      { actionId: asActionId('advance'), params: {} },
    ] as const;

    const left = evaluatePolicyMove({
      def,
      state: leftState,
      playerId: asPlayerId(0),
      legalMoves,
      rng: createRng(7n),
    });
    const right = evaluatePolicyMove({
      def,
      state: rightState,
      playerId: asPlayerId(0),
      legalMoves,
      rng: createRng(7n),
    });

    assert.equal(left.move.actionId, right.move.actionId);
    assert.deepEqual(left.metadata.candidates, right.metadata.candidates);
  });
});
