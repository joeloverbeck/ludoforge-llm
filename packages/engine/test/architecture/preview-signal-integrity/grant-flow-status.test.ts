// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPlayerId,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { createRng } from '../../../src/kernel/prng.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';
import {
  createBaseState,
  createOutcomeGrantState,
  createPostGrantDef,
  createTrustedOperation,
} from '../preview-post-grant/post-grant-fixture.js';

const SELF_REF_ID = 'victoryCurrentMargin.currentMargin.self';
const SEAT_REF_ID = 'victoryCurrentMargin.currentMargin.$seat';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const selfMarginRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewSurface' }> = {
  kind: 'previewSurface',
  family: 'victoryCurrentMargin',
  id: 'currentMargin',
  selector: { kind: 'player', player: 'self' },
};
const seatMarginRef = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: {
    kind: 'previewSurface',
    family: 'victoryCurrentMargin',
    id: 'currentMargin',
    selector: { kind: 'role', seatToken: '$seat' },
  },
});
const opponentSeatMarginSum = (): AgentPolicyExpr => ({
  kind: 'seatAgg',
  over: 'opponents',
  expr: seatMarginRef(),
  aggOp: 'sum',
  availability: 'requireAllReady',
});

function createProfile(postGrantDepthCap = 4, grantFlowEnabled = true): CompiledAgentProfile {
  const considerations = ['selfPreviewMargin', 'opponentPreviewMargin'];
  return {
    fingerprint: 'grant-flow-status',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      ...(grantFlowEnabled
        ? {
            grantFlowContinuation: {
              enabled: true,
              postGrantDepthCap,
              postGrantCapClass: 'postGrant16',
              freeOperationDepthCap: 16,
              freeOperationCapClass: 'grantFlow16',
            },
          }
        : {}),
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations,
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations,
    },
  };
}

function createCatalog(postGrantDepthCap?: number, grantFlowEnabled?: boolean): AgentPolicyCatalog {
  const profile = createProfile(postGrantDepthCap, grantFlowEnabled);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: profile.fingerprint,
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      guardrails: {},
      considerations: {
        selfPreviewMargin: {
          scopes: ['move'],
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(selfMarginRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        opponentPreviewMargin: {
          scopes: ['move'],
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: opponentSeatMarginSum(),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { '0': 'baseline' },
  });
}

function createDef(postGrantDepthCap?: number, grantFlowEnabled?: boolean): GameDef {
  return {
    ...createPostGrantDef(),
    terminal: {
      conditions: [],
      margins: [
        { seat: '0', value: 0 },
        { seat: '1', value: 0 },
      ],
      ranking: { order: 'desc' },
    },
    agents: createCatalog(postGrantDepthCap, grantFlowEnabled),
  };
}

function evaluate(grantIds: readonly string[], postGrantDepthCap?: number, grantFlowEnabled?: boolean) {
  const def = createDef(postGrantDepthCap, grantFlowEnabled);
  const state = createBaseState();
  const trustedMove = createTrustedOperation(state);
  const legalMoves: readonly Move[] = [{ actionId: asActionId('operation'), params: {} }];
  const result = evaluatePolicyMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves,
    trustedMoveIndex: new Map([['operation:{}', trustedMove]]),
    rng: createRng(185n),
    traceLevel: 'verbose',
    encodedStateMode: 'disabled',
    previewDependencies: {
      applyMove() {
        return { state: createOutcomeGrantState(state, grantIds) };
      },
    },
  });
  return buildPolicyAgentDecisionTrace(result.metadata, 'verbose');
}

describe('grant-flow preview status integrity', () => {
  it('marks opponent/standing refs partial while preserving self-only ready values', () => {
    const trace = evaluate(['grant-a'], undefined, false);
    const candidate = trace.candidates?.[0];
    assert.ok(candidate);

    assert.equal(candidate.previewOutcome, 'grantFlowPartial');
    assert.deepEqual(candidate.unknownPreviewRefs, [{ refId: SEAT_REF_ID, reason: 'grantFlowPartial' }]);
    assert.deepEqual(trace.previewUsage.seatMatrix?.byCandidate[candidate.stableMoveKey]?.perSeatRefs[SEAT_REF_ID], {
      '1': { status: 'grantFlowPartial' },
    });
    assert.equal(candidate.previewRefIds.includes(SELF_REF_ID), true);
    assert.equal(candidate.unknownPreviewRefs.some((entry) => entry.refId === SELF_REF_ID), false);
    assert.equal(candidate.scoreContributions.some((entry) => entry.termId === 'selfPreviewMargin'), true);
    assert.equal(trace.previewUsage.readyRefStats[SEAT_REF_ID]?.readyCount, 0);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial, 1);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownDepthCap, 0);
  });

  it('reports ready when enabled grant-flow continuation reaches the free-operation effect', () => {
    const trace = evaluate(['grant-a']);
    const candidate = trace.candidates?.[0];
    assert.ok(candidate);

    assert.equal(candidate.previewOutcome, 'ready');
    assert.equal(candidate.unknownPreviewRefs.length, 0);
    assert.equal(trace.previewUsage.outcomeBreakdown?.ready, 1);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial, 0);
  });

  it('keeps postGrantCap distinct from ordinary depth caps and declares future free-operation caps', () => {
    const trace = evaluate(['grant-a', 'grant-b'], 1);

    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownPostGrantCap, 1);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownFreeOperationCap, 0);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial, 0);
    assert.equal(trace.previewUsage.outcomeBreakdown?.unknownDepthCap, 0);
  });
});
