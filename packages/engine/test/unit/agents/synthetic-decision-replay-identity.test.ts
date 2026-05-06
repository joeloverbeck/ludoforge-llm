// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { captureSyntheticDecisionPreviewDrive } from '../../helpers/synthetic-decision-fixture.js';

describe('synthetic decision replay identity', () => {
  it('emits byte-identical synthetic decision arrays for the same GameDef and seed', () => {
    const first = captureSyntheticDecisionPreviewDrive().previewDrive?.syntheticDecisions;
    const second = captureSyntheticDecisionPreviewDrive().previewDrive?.syntheticDecisions;

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });
});
