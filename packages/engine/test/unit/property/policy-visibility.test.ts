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
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type GameDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'visibility-catalog',
    surfaceVisibility: {
      globalVars: {
        usMargin: {
          current: 'public',
          preview: {
            visibility: 'public',
            allowWhenHiddenSampling: true,
          },
        },
      },
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
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {
        projectedMargin: {
          type: 'number',
          costClass: 'preview',
          expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {
        preferProjectedMargin: {
          costClass: 'preview',
          weight: literal(1),
          value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
        },
      },
      completionScoreTerms: {},
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
          completionScoreTerms: [],
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
        effects: [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 3 } })],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'usMargin' } },
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
      trustedMoveIndex: new Map(),
      rng: createRng(7n),
    });
    const right = evaluatePolicyMove({
      def,
      state: rightState,
      playerId: asPlayerId(0),
      legalMoves,
      trustedMoveIndex: new Map(),
      rng: createRng(7n),
    });

    assert.equal(left.move.actionId, right.move.actionId);
    assert.deepEqual(left.metadata.candidates, right.metadata.candidates);
  });
});
