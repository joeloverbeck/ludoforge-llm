// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSpec160InnerPreviewTrace } from '../helpers/spec-160-inner-preview-fixture.js';

const innerTrace = () => captureSpec160InnerPreviewTrace(true).innerChooseOne;

const previewDriveArrays = (trace: ReturnType<typeof innerTrace>) =>
  trace?.candidates?.map((candidate) => candidate.previewDrive?.syntheticDecisions ?? []) ?? [];

describe('Spec 160 inner-preview replay identity', () => {
  it('emits byte-identical inner previewUsage and synthetic-decision arrays for the same GameDef and seed', () => {
    const first = innerTrace();
    const second = innerTrace();

    assert.equal(JSON.stringify(first?.previewUsage), JSON.stringify(second?.previewUsage));
    assert.equal(JSON.stringify(previewDriveArrays(first)), JSON.stringify(previewDriveArrays(second)));
    assert.equal(first?.previewUsage.mode, 'exactWorld');
    assert.equal(first?.previewUsage.evaluatedCandidateCount, 2);
    assert.equal(first?.selectedStableMoveKey, 'chooseOne:$pick:"high"');
    assert.deepEqual(first?.previewUsage.refIds, ['preview.option.delta.victory.currentMargin.self']);
    assert.equal(first?.previewUsage.utility, 'differentiating');
    assert.deepEqual(
      first?.candidates?.map((candidate) => [candidate.stableMoveKey, candidate.previewOutcome]),
      [
        ['chooseOne:$pick:"low"', 'ready'],
        ['chooseOne:$pick:"high"', 'ready'],
      ],
    );
  });
});
