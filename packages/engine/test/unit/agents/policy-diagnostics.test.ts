import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import type { PolicyEvaluationMetadata } from '../../../src/agents/policy-eval.js';

function createMetadata(): PolicyEvaluationMetadata {
  return {
    seatId: 'us',
    requestedProfileId: 'baseline',
    profileId: 'baseline',
    profileFingerprint: 'baseline-fingerprint',
    canonicalOrder: ['alpha', 'beta', 'gamma'],
    candidates: [
      {
        actionId: 'advance',
        stableMoveKey: 'alpha',
        score: 7,
        prunedBy: [],
        scoreContributions: [{ termId: 'preferAdvance', contribution: 7 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [],
        previewOutcome: 'ready',
      },
      {
        actionId: 'pass',
        stableMoveKey: 'beta',
        score: 1,
        prunedBy: ['dropPass'],
        scoreContributions: [{ termId: 'preferAdvance', contribution: 1 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [{ refId: 'globalVar.usMargin', reason: 'hidden' }],
        previewOutcome: 'hidden',
      },
      {
        actionId: 'event',
        stableMoveKey: 'gamma',
        score: -2,
        prunedBy: [],
        scoreContributions: [{ termId: 'preferAdvance', contribution: -2 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [{ refId: 'globalVar.usMargin', reason: 'unresolved' }],
        previewOutcome: 'unresolved',
        previewFailureReason: 'completionUnsatisfiable',
      },
    ],
    pruningSteps: [{ ruleId: 'dropPass', remainingCandidateCount: 2, skippedBecauseEmpty: false }],
    tieBreakChain: [],
    previewUsage: {
      mode: 'exactWorld',
      evaluatedCandidateCount: 3,
      refIds: ['globalVar.usMargin'],
      unknownRefs: [{ refId: 'globalVar.usMargin', reason: 'hidden' }],
      outcomeBreakdown: {
        ready: 1,
        stochastic: 0,
        unknownRandom: 0,
        unknownHidden: 1,
        unknownUnresolved: 0,
        unknownFailed: 0,
      },
    },
    completionStatistics: {
      totalClassifiedMoves: 3,
      completedCount: 1,
      stochasticCount: 1,
      rejectedNotViable: 1,
      templateCompletionAttempts: 2,
      templateCompletionSuccesses: 1,
      templateCompletionUnsatisfiable: 1,
    },
    movePreparations: [
      {
        actionId: 'advance',
        stableMoveKey: 'alpha',
        initialClassification: 'complete',
        finalClassification: 'complete',
        enteredTrustedMoveIndex: true,
      },
      {
        actionId: 'pass',
        stableMoveKey: 'beta',
        initialClassification: 'pending',
        finalClassification: 'rejected',
        enteredTrustedMoveIndex: false,
        templateCompletionAttempts: 2,
        templateCompletionOutcome: 'failed',
        rejection: 'completionUnsatisfiable',
      },
    ],
    selectedStableMoveKey: 'alpha',
    finalScore: 7,
    usedFallback: false,
    failure: null,
  };
}

describe('policy-diagnostics', () => {
  it('omits verbose-only diagnostics at summary level', () => {
    const trace = buildPolicyAgentDecisionTrace(createMetadata(), 'summary');

    assert.deepEqual(trace.previewUsage.outcomeBreakdown, {
      ready: 1,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 1,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.equal(trace.completionStatistics, undefined);
    assert.equal(trace.movePreparations, undefined);
    assert.equal(trace.candidates, undefined);
  });

  it('includes completion statistics and per-candidate preview outcomes at verbose level', () => {
    const trace = buildPolicyAgentDecisionTrace(createMetadata(), 'verbose');

    assert.deepEqual(trace.completionStatistics, {
      totalClassifiedMoves: 3,
      completedCount: 1,
      stochasticCount: 1,
      rejectedNotViable: 1,
      templateCompletionAttempts: 2,
      templateCompletionSuccesses: 1,
      templateCompletionUnsatisfiable: 1,
    });
    assert.equal(trace.movePreparations?.length, 2);
    assert.equal(trace.movePreparations?.[1]?.templateCompletionOutcome, 'failed');
    assert.equal(trace.movePreparations?.[1]?.rejection, 'completionUnsatisfiable');
    assert.equal(trace.candidates?.length, 3);
    assert.equal(trace.candidates?.[0]?.previewOutcome, 'ready');
    assert.equal(trace.candidates?.[1]?.previewOutcome, 'hidden');
    assert.equal(trace.candidates?.[0]?.previewFailureReason, undefined);
    assert.equal(trace.candidates?.[2]?.previewOutcome, 'unresolved');
    assert.equal(trace.candidates?.[2]?.previewFailureReason, 'completionUnsatisfiable');
  });
});
