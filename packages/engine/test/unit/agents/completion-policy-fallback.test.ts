// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSyntheticDecisionPreviewDrive } from '../../helpers/synthetic-decision-fixture.js';

describe('completion policy fallback trace aggregate', () => {
  it('matches the count of fallback synthetic-decision entries', () => {
    const result = captureSyntheticDecisionPreviewDrive({
      completionPolicy: 'policyGuided',
      fallbackCompletionPolicy: 'greedy',
    });
    const fallbackEntries = result.previewDrive?.syntheticDecisions.filter(
      (entry) => entry.completionPolicy === 'fallback' && entry.selectionReason === 'fallback',
    ).length ?? 0;

    assert.equal(result.completionPolicyFallbackCount, fallbackEntries);
  });
});
