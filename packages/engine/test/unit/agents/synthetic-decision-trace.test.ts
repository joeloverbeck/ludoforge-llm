// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSyntheticDecisionPreviewDrive } from '../../helpers/synthetic-decision-fixture.js';

describe('synthetic decision trace', () => {
  it('records one verbose entry per inner microturn with monotonic depth', () => {
    const { outcome, previewDrive } = captureSyntheticDecisionPreviewDrive();

    assert.equal(outcome, 'ready');
    assert.equal(previewDrive?.depth, 2);
    assert.equal(previewDrive?.completionPolicy, 'greedy');
    assert.deepEqual(previewDrive?.syntheticDecisions.map((entry) => entry.depth), [1]);
    assert.deepEqual(previewDrive?.syntheticDecisions.map((entry) => entry.microturnKind), ['chooseOne']);
    assert.deepEqual(previewDrive?.syntheticDecisions.map((entry) => entry.decisionKey), ['$pick']);
    assert.deepEqual(previewDrive?.syntheticDecisions.map((entry) => entry.selectedOptionStableKey), [
      'chooseOne:$pick:"left"',
    ]);
    assert.deepEqual(previewDrive?.syntheticDecisions.map((entry) => entry.selectionReason), ['greedyAlphabetical']);
    assert.equal(previewDrive?.syntheticDecisions.length, 1);
    assert.ok((previewDrive?.syntheticDecisions.length ?? 0) <= (previewDrive?.depth ?? 0));
  });
});
