// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureSyntheticDecisionPreviewDrive,
  createSyntheticPolicyGuidedDeps,
} from '../../helpers/synthetic-decision-fixture.js';

describe('policy-guided synthetic completion fallback', () => {
  it('uses microturn policy when policy-guided scoring can select an option', () => {
    const result = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'greedy',
      policyGuidedDeps: createSyntheticPolicyGuidedDeps(),
    });

    assert.equal(result.outcome, 'ready');
    assert.equal(result.completionPolicyFallbackCount, 0);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.selectionReason), [
      'microturnPolicy',
    ]);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.completionPolicy), [
      'policyGuided',
    ]);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.selectedOptionStableKey), [
      'chooseOne:$pick:"right"',
    ]);
  });

  it('records explicit greedy fallback when policy-guided scoring cannot select an option', () => {
    const result = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'greedy',
    });

    assert.equal(result.outcome, 'ready');
    assert.equal(result.completionPolicyFallbackCount, 1);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.selectionReason), ['fallback']);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.completionPolicy), ['fallback']);
    assert.deepEqual(result.previewDrive?.syntheticDecisions.map((entry) => entry.selectedOptionStableKey), [
      'chooseOne:$pick:"left"',
    ]);
  });

  it('fails loudly when policy-guided scoring cannot select and fallback is disabled', () => {
    const result = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'fail',
    });

    assert.equal(result.outcome, 'noPreviewDecision');
    assert.equal(result.completionPolicyFallbackCount, 1);
    assert.deepEqual(result.previewDrive?.syntheticDecisions, []);
  });
});
