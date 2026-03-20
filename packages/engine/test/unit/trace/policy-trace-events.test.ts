import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyDiagnosticsSnapshot } from '../../../src/agents/policy-diagnostics.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import { runGame } from '../../../src/sim/simulator.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  initialState,
  createRng,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {
        preferEvent: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [] },
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
        fingerprint: 'baseline-fingerprint',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: ['preferEvent'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['isEvent'],
          candidateAggregates: [],
        },
      },
    },
    bindingsBySeat: {
      us: 'baseline',
      arvn: 'baseline',
    },
  };
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-trace', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions: [
      {
        id: asActionId('pass'),
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
        id: asActionId('event'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
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

function createInput(def: GameDef): Parameters<PolicyAgent['chooseMove']>[0] {
  const state = initialState(def, 5, 2).state;
  const legalMoves: readonly Move[] = [
    { actionId: asActionId('pass'), params: {} },
    { actionId: asActionId('event'), params: {} },
  ];
  return {
    def,
    state,
    playerId: state.activePlayer,
    legalMoves,
    rng: createRng(5n),
  };
}

describe('policy trace events', () => {
  it('builds summary and verbose policy decision payloads without legacy seatType framing', () => {
    const def = createDef();
    const summaryAgent = new PolicyAgent({ traceLevel: 'summary' });
    const verboseAgent = new PolicyAgent({ traceLevel: 'verbose' });

    const summaryResult = summaryAgent.chooseMove(createInput(def));
    const verboseResult = verboseAgent.chooseMove(createInput(def));

    assert.equal(summaryResult.agentDecision?.kind, 'policy');
    assert.equal(verboseResult.agentDecision?.kind, 'policy');
    if (summaryResult.agentDecision?.kind !== 'policy' || verboseResult.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision traces');
    }

    assert.equal('seatType' in (summaryResult.agentDecision as unknown as Record<string, unknown>), false);
    assert.equal(summaryResult.agentDecision.resolvedProfileId, 'baseline');
    assert.equal(summaryResult.agentDecision.profileFingerprint, 'baseline-fingerprint');
    assert.equal(summaryResult.agentDecision.initialCandidateCount, 2);
    assert.equal(summaryResult.agentDecision.selectedStableMoveKey !== null, true);
    assert.deepEqual(summaryResult.agentDecision.previewUsage.refIds, []);
    assert.equal(summaryResult.agentDecision.candidates, undefined);

    assert.equal(Array.isArray(verboseResult.agentDecision.candidates), true);
    assert.equal(verboseResult.agentDecision.candidates?.length, 2);
  });

  it('threads policy agent decision metadata into simulator move logs', () => {
    const def = assertValidatedGameDef(createDef());
    const trace = runGame(def, 11, [new PolicyAgent(), new PolicyAgent()], 1);
    const firstMove = trace.moves[0];

    assert.ok(firstMove);
    assert.equal(firstMove.agentDecision?.kind, 'policy');
    if (firstMove.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision in move log');
    }
    assert.equal(firstMove.agentDecision.resolvedProfileId, 'baseline');
    assert.equal(firstMove.agentDecision.profileFingerprint, 'baseline-fingerprint');
  });

  it('formats a diagnostics snapshot from compiled policy data plus evaluator metadata', () => {
    const def = createDef();
    const evaluation = evaluatePolicyMove(createInput(def));
    const snapshot = buildPolicyDiagnosticsSnapshot(def, evaluation.metadata, 'verbose');

    assert.deepEqual(snapshot.resolvedPlan.scoreTerms, ['preferEvent']);
    assert.deepEqual(snapshot.costTiers.candidate, ['candidateFeature:isEvent', 'scoreTerm:preferEvent']);
    assert.deepEqual(snapshot.surfaceRefs.preview, []);
  });
});
