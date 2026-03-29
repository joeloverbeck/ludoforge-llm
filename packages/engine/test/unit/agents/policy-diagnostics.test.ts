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
    canonicalOrder: ['alpha', 'beta'],
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
    ],
    pruningSteps: [{ ruleId: 'dropPass', remainingCandidateCount: 1, skippedBecauseEmpty: false }],
    tieBreakChain: [],
    previewUsage: {
      evaluatedCandidateCount: 2,
      refIds: ['globalVar.usMargin'],
      unknownRefs: [{ refId: 'globalVar.usMargin', reason: 'hidden' }],
      outcomeBreakdown: {
        ready: 1,
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
      unknownRandom: 0,
      unknownHidden: 1,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.equal(trace.completionStatistics, undefined);
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
    assert.equal(trace.candidates?.length, 2);
    assert.equal(trace.candidates?.[0]?.previewOutcome, 'ready');
    assert.equal(trace.candidates?.[1]?.previewOutcome, 'hidden');
  });
});
