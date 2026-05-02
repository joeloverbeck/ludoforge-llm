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
        previewOutcome: 'ready',
        previewDriveDepth: 3,
        previewCompletionPolicy: 'greedy',
      },
      {
        actionId: 'march',
        stableMoveKey: 'march',
        score: 2,
        prunedBy: [],
        scoreContributions: [{ termId: 'projectedSelfMargin', contribution: 2 }],
        previewRefIds: ['victory.currentMargin.self'],
        unknownPreviewRefs: [{ refId: 'victory.currentMargin.self', reason: 'depthCap' }],
        previewOutcome: 'depthCap',
        previewFailureReason: 'depthCap',
        previewDriveDepth: 2,
        previewCompletionPolicy: 'agentGuided',
      },
      {
        actionId: 'train',
        stableMoveKey: 'train',
        score: 1,
        prunedBy: [],
        scoreContributions: [{ termId: 'projectedSelfMargin', contribution: 1 }],
        previewRefIds: ['victory.currentMargin.self'],
        unknownPreviewRefs: [{ refId: 'victory.currentMargin.self', reason: 'gated' }],
        previewOutcome: 'gated',
        previewFailureReason: 'gated',
      },
    ],
    pruningSteps: [],
    tieBreakChain: [],
    previewUsage: {
      mode: 'exactWorld',
      evaluatedCandidateCount: 3,
      refIds: ['victory.currentMargin.self'],
      unknownRefs: [
        { refId: 'victory.currentMargin.self', reason: 'depthCap' },
        { refId: 'victory.currentMargin.self', reason: 'gated' },
      ],
      outcomeBreakdown: {
        ready: 1,
        stochastic: 0,
        unknownRandom: 0,
        unknownHidden: 0,
        unknownUnresolved: 0,
        unknownDepthCap: 1,
        unknownNoPreviewDecision: 0,
        unknownGated: 1,
        unknownFailed: 0,
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
  it('emits preview drive depth and completion policy on verbose candidates', () => {
    const trace = buildPolicyAgentDecisionTrace(createPreviewMetadata(), 'verbose');

    assert.equal(trace.candidates?.[0]?.previewDriveDepth, 3);
    assert.equal(trace.candidates?.[0]?.previewCompletionPolicy, 'greedy');
    assert.equal(trace.candidates?.[1]?.previewDriveDepth, 2);
    assert.equal(trace.candidates?.[1]?.previewCompletionPolicy, 'agentGuided');
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
