// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSpec160InnerPreviewTrace } from '../helpers/spec-160-inner-preview-fixture.js';

describe('Spec 160 inner-preview default-off invariant', () => {
  it('keeps default-off inner microturn traces byte-identical to an explicit disabled baseline', () => {
    const defaultOff = captureSpec160InnerPreviewTrace().innerChooseOne;
    const explicitOff = captureSpec160InnerPreviewTrace(false).innerChooseOne;

    assert.equal(JSON.stringify(defaultOff), JSON.stringify(explicitOff));
    assert.equal(defaultOff?.previewUsage.mode, 'disabled');
    assert.equal(defaultOff?.previewUsage.evaluatedCandidateCount, 0);
    assert.equal(defaultOff?.selectedStableMoveKey, 'chooseOne:$pick:"low"');
    assert.deepEqual(defaultOff?.previewUsage.refIds, []);
    assert.deepEqual(defaultOff?.candidates?.map((candidate) => candidate.previewDrive), [undefined, undefined]);
  });
});
