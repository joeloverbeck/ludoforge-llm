// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runStandingPreviewTrace } from '../architecture/preview-standing/standing-preview-fixture.js';

describe('Spec 180 seat matrix replay identity', () => {
  it('emits byte-identical previewUsage.seatMatrix JSON for the same GameDef and seed', () => {
    const first = runStandingPreviewTrace({ previewVisibility: 'public' });
    const second = runStandingPreviewTrace({ previewVisibility: 'public' });

    assert.equal(JSON.stringify(first.previewUsage.seatMatrix), JSON.stringify(second.previewUsage.seatMatrix));
  });
});
