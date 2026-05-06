// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureSyntheticDecisionPreviewDrive,
  createSyntheticPolicyGuidedDeps,
} from '../helpers/synthetic-decision-fixture.js';

describe('Spec 159 policy-guided completion replay identity', () => {
  it('emits byte-identical synthetic decision arrays for the same GameDef and seed', () => {
    const first = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'greedy',
      policyGuidedDeps: createSyntheticPolicyGuidedDeps(),
    }).previewDrive?.syntheticDecisions;
    const second = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'greedy',
      policyGuidedDeps: createSyntheticPolicyGuidedDeps(),
    }).previewDrive?.syntheticDecisions;

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });
});
