// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import type { PolicyEvaluationMetadata } from '../../../src/agents/policy-eval.js';

function createPreviewMetadata(): PolicyEvaluationMetadata {
  return {
    seatId: 'arvn',
    requestedProfileId: 'arvn-evolved',
    profileId: 'arvn-evolved',
    profileFingerprint: 'preview-diagnostics',
    canonicalOrder: ['govern', 'march', 'train'],
    candidates: [
      {
        actionId: 'govern',
        stableMoveKey: 'govern',
        score: 8,
        prunedBy: [],
        scoreContributions: [{ termId: 'projectedSelfMargin', contribution: 8 }],
        previewRefIds: ['victory.currentMargin.self'],
        unknownPreviewRefs: [],
        unknownLookupRefs: [],
        unknownCandidateParamRefs: [],
        selectionReason: 'gated',
        previewOutcome: 'ready',
        previewDrive: {
          depth: 3,
          completionPolicy: 'greedy',
          syntheticDecisions: [],
        },
      },
      {
        actionId: 'march',
        stableMoveKey: 'march',
        score: 2,
        prunedBy: [],
        scoreContributions: [{ termId: 'projectedSelfMargin', contribution: 2 }],
        previewRefIds: ['victory.currentMargin.self'],
        unknownPreviewRefs: [{ refId: 'victory.currentMargin.self', reason: 'depthCap' }],
        unknownLookupRefs: [],
        unknownCandidateParamRefs: [],
        selectionReason: 'gated',
        previewOutcome: 'depthCap',
        previewFailureReason: 'depthCap',
        previewDrive: {
          depth: 2,
          completionPolicy: 'policyGuided',
          syntheticDecisions: [],
        },
      },
      {
        actionId: 'train',
        stableMoveKey: 'train',
        score: 1,
        prunedBy: [],
        scoreContributions: [{ termId: 'projectedSelfMargin', contribution: 1 }],
        previewRefIds: ['victory.currentMargin.self'],
        unknownPreviewRefs: [{ refId: 'victory.currentMargin.self', reason: 'gated' }],
        unknownLookupRefs: [],
        unknownCandidateParamRefs: [],
        selectionReason: 'gated',
        previewOutcome: 'gated',
        previewFailureReason: 'gated',
      },
    ],
    pruningSteps: [],
    tieBreakChain: [],
    previewUsage: {
      mode: 'exactWorld',
      evaluatedCandidateCount: 3,
      completionPolicyFallbackCount: 0,
      refIds: ['victory.currentMargin.self'],
      unknownRefs: [
        { refId: 'victory.currentMargin.self', reason: 'depthCap' },
        { refId: 'victory.currentMargin.self', reason: 'gated' },
      ],
      readyRefStats: {},
      utility: 'none',
      widenedBecauseUniform: true,
      outcomeBreakdown: {
        ready: 1,
        stochastic: 0,
        unknownRandom: 0,
        unknownHidden: 0,
        unknownUnresolved: 0,
        unknownDepthCap: 1,
        unknownPostGrantCap: 0,
        unknownFreeOperationCap: 0,
        unknownGrantFlowPartial: 0,
        unknownNoPreviewDecision: 0,
        unknownGated: 1,
        unknownFailed: 0,
      },
      coverage: {
        requestedRefCount: 1,
        evaluatedRootOptionCount: 3,
        readyRootOptionCount: 1,
        unavailableRootOptionCount: 2,
        allRootsUnavailable: false,
        selectedByTieBreakerBecausePreviewUnavailable: false,
        strategy: 'singlePass',
        capClass: 'standard256',
      },
    },
    selectedStableMoveKey: 'govern',
    finalScore: 8,
    previewGatedCount: 1,
    previewGatedTopFlipDetected: true,
    usedFallback: false,
    failure: null,
  };
}

describe('policy diagnostics preview metadata', () => {
  it('emits nested preview drive metadata on verbose candidates', () => {
    const trace = buildPolicyAgentDecisionTrace(createPreviewMetadata(), 'verbose');

    assert.deepEqual(trace.candidates?.[0]?.previewDrive, {
      depth: 3,
      completionPolicy: 'greedy',
      syntheticDecisions: [],
    });
    assert.deepEqual(trace.candidates?.[1]?.previewDrive, {
      depth: 2,
      completionPolicy: 'policyGuided',
      syntheticDecisions: [],
    });
  });

  it('emits per-microturn gated count and optional top-flip signal', () => {
    const trace = buildPolicyAgentDecisionTrace(createPreviewMetadata(), 'summary');

    assert.equal(trace.previewGatedCount, 1);
    assert.equal(trace.previewGatedTopFlipDetected, true);
  });

  it('omits top-flip signal when no cached gated preview flipped the ranking', () => {
    const metadata = createPreviewMetadata();
    const { previewGatedTopFlipDetected, ...withoutFlip } = metadata;
    void previewGatedTopFlipDetected;
    const trace = buildPolicyAgentDecisionTrace(withoutFlip, 'summary');

    assert.equal(trace.previewGatedCount, 1);
    assert.equal(trace.previewGatedTopFlipDetected, undefined);
  });
});
