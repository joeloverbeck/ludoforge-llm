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
} from './post-grant-fixture.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const previewMarginRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewSurface' }> = {
  kind: 'previewSurface',
  family: 'victoryCurrentMargin',
  id: 'currentMargin',
  selector: { kind: 'player', player: 'self' },
};

function createProfile(outcomeGrantContinuation?: CompiledAgentProfile['preview']['outcomeGrantContinuation']): CompiledAgentProfile {
  const considerations = ['preferPreviewMargin'];
  return {
    fingerprint: `post-grant-trace-${outcomeGrantContinuation?.enabled === true ? 'opt-in' : 'opt-out'}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      ...(outcomeGrantContinuation === undefined ? {} : { outcomeGrantContinuation }),
    },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
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

function createCatalog(outcomeGrantContinuation?: CompiledAgentProfile['preview']['outcomeGrantContinuation']): AgentPolicyCatalog {
  const profile = createProfile(outcomeGrantContinuation);
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
      pruningRules: {},
      considerations: {
        preferPreviewMargin: {
          scopes: ['move'],
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(previewMarginRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
      },
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      '0': 'baseline',
    },
  });
}

function createDef(outcomeGrantContinuation?: CompiledAgentProfile['preview']['outcomeGrantContinuation']): GameDef {
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
    agents: createCatalog(outcomeGrantContinuation),
  };
}

function evaluate(grantIds: readonly string[], outcomeGrantContinuation?: CompiledAgentProfile['preview']['outcomeGrantContinuation']) {
  const def = createDef(outcomeGrantContinuation);
  const state = createBaseState();
  const trustedMove = createTrustedOperation(state);
  const legalMoves: readonly Move[] = [{ actionId: asActionId('operation'), params: {} }];
  const result = evaluatePolicyMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves,
    trustedMoveIndex: new Map([['operation:{}', trustedMove]]),
    rng: createRng(1n),
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

describe('previewUsage outcomeGrantContinuation trace surface', () => {
  it('omits the aggregate block for opt-out profiles', () => {
    const trace = evaluate(['grant-a']);

    assert.equal(Object.hasOwn(trace.previewUsage, 'outcomeGrantContinuation'), false);
  });

  it('aggregates completed post-grant continuation exits for opt-in profiles', () => {
    const trace = evaluate(['grant-a'], { enabled: true, extraDepthCap: 4, capClass: 'postGrant16' });

    assert.deepEqual(trace.previewUsage.outcomeGrantContinuation, {
      enabled: true,
      extraDepthCap: 4,
      capClass: 'postGrant16',
      extraDepthReached: 1,
      exitCounts: {
        completed: 1,
        postGrantCap: 0,
        stochastic: 0,
      },
    });
  });

  it('aggregates postGrantCap exits and keeps the block deterministic', () => {
    const firstTrace = evaluate(['grant-a', 'grant-b'], { enabled: true, extraDepthCap: 1, capClass: 'postGrant16' });
    const secondTrace = evaluate(['grant-a', 'grant-b'], { enabled: true, extraDepthCap: 1, capClass: 'postGrant16' });

    assert.deepEqual(firstTrace.previewUsage.outcomeGrantContinuation, {
      enabled: true,
      extraDepthCap: 1,
      capClass: 'postGrant16',
      extraDepthReached: 1,
      exitCounts: {
        completed: 0,
        postGrantCap: 1,
        stochastic: 0,
      },
    });
    assert.equal(
      JSON.stringify(firstTrace.previewUsage.outcomeGrantContinuation),
      JSON.stringify(secondTrace.previewUsage.outcomeGrantContinuation),
    );
  });
});
