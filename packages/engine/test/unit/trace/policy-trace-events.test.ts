import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyDiagnosticsSnapshot } from '../../../src/agents/policy-diagnostics.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { completeClassifiedMoves } from '../../helpers/classified-move-fixtures.js';
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

function moveConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalog['library']['considerations'][string], 'scopes'>>,
): AgentPolicyCatalog['library']['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
  );
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
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      candidateFeatures: {
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      considerations: moveConsiderations({
        preferEvent: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline-fingerprint',
        params: {},
        use: {
          pruningRules: [],
          considerations: ['preferEvent'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['isEvent'],
          candidateAggregates: [],
          considerations: ['preferEvent'],
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
    legalMoves: completeClassifiedMoves(legalMoves),
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
    const summaryDecision = summaryResult.agentDecision;
    const verboseDecision = verboseResult.agentDecision;

    assert.equal('seatType' in (summaryDecision as unknown as Record<string, unknown>), false);
    assert.equal(summaryDecision.resolvedProfileId, 'baseline');
    assert.equal(summaryDecision.profileFingerprint, 'baseline-fingerprint');
    assert.equal(summaryDecision.initialCandidateCount, 2);
    assert.equal(summaryDecision.selectedStableMoveKey !== null, true);
    assert.deepEqual(summaryDecision.previewUsage.refIds, []);
    assert.deepEqual(summaryDecision.previewUsage.unknownRefs, []);
    assert.deepEqual(summaryDecision.previewUsage.outcomeBreakdown, {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.equal('unknownRefIds' in (summaryDecision.previewUsage as unknown as Record<string, unknown>), false);
    assert.equal(summaryDecision.completionStatistics, undefined);
    assert.equal(summaryDecision.candidates, undefined);

    assert.deepEqual(verboseDecision.previewUsage.outcomeBreakdown, {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.deepEqual(verboseDecision.completionStatistics, {
      totalClassifiedMoves: 2,
      completedCount: 2,
      stochasticCount: 0,
      rejectedNotViable: 0,
      templateCompletionAttempts: 0,
      templateCompletionSuccesses: 0,
      templateCompletionUnsatisfiable: 0,
    });
    assert.equal(Array.isArray(verboseDecision.candidates), true);
    assert.equal(verboseDecision.candidates?.length, 2);
    const firstVerboseCandidate = verboseDecision.candidates?.[0];
    assert.ok(firstVerboseCandidate);
    assert.equal('previewOutcome' in (firstVerboseCandidate as unknown as Record<string, unknown>), false);
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
    const firstDecision = firstMove.agentDecision;
    assert.equal(firstDecision.resolvedProfileId, 'baseline');
    assert.equal(firstDecision.profileFingerprint, 'baseline-fingerprint');
  });

  it('formats a diagnostics snapshot from compiled policy data plus evaluator metadata', () => {
    const def = createDef();
    const input = createInput(def);
    const evaluation = evaluatePolicyMove({
      ...input,
      legalMoves: input.legalMoves.map(({ move }) => move),
      trustedMoveIndex: new Map(input.legalMoves.map((candidate) => [toMoveIdentityKey(def, candidate.move), candidate.trustedMove!] as const)),
    });
    const snapshot = buildPolicyDiagnosticsSnapshot(def, evaluation.metadata, 'verbose');

    assert.deepEqual(snapshot.resolvedPlan.considerations, ['preferEvent']);
    assert.deepEqual(snapshot.costTiers.candidate, ['candidateFeature:isEvent', 'scoreTerm:preferEvent']);
    assert.deepEqual(snapshot.surfaceRefs.preview, []);
  });
});
