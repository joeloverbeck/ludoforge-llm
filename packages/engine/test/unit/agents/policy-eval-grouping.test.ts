// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

function createCatalog(): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'grouping-test-profile',
    params: {},
    use: {
      pruningRules: [],
      considerations: [],
      tieBreakers: ['stableMoveKey'],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: [],
    },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
  };

  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'grouping-test-catalog',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {},
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { neutral: 'baseline' },
  });
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-eval-grouping-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'neutral' }, { id: 'neutral' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions: [
      {
        id: asActionId('raise'),
        tags: ['raise'],
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [{ name: 'raiseAmount', domain: { query: 'intsInRange', min: 1, max: 1000 } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  };
}

describe('evaluatePolicyMove actionId grouping', () => {
  it('keeps grouped parameterized moves aligned with frontier order instead of stableMoveKey lexical order', () => {
    const def = createDef();
    const state = initialState(def, 7, 2).state;
    const legalMoves: readonly Move[] = [
      { actionId: asActionId('raise'), params: { raiseAmount: 40 } },
      { actionId: asActionId('raise'), params: { raiseAmount: 120 } },
      { actionId: asActionId('raise'), params: { raiseAmount: 1000 } },
    ];

    const result = evaluatePolicyMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      selectionGrouping: 'actionId',
    });

    assert.deepEqual(result.move, { actionId: asActionId('raise'), params: { raiseAmount: 40 } });
    assert.equal(result.metadata.selectedStableMoveKey, 'raise|{"raiseAmount":40}|false|unclassified');
  });
});
