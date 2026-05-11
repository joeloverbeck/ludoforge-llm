// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertProjectedZoneUnknownRef,
  evaluateActionSelectionProjectedLookup,
} from './projected-lookup-runtime-test-helpers.js';

describe('projected lookup action-selection gating', () => {
  it('records gated preview unavailability when no per-option DriveResult is in scope', () => {
    const { score, candidate } = evaluateActionSelectionProjectedLookup();

    assert.equal(score, 0);
    assertProjectedZoneUnknownRef([...candidate.unknownPreviewRefs.entries()], 'gated');
    assert.deepEqual([...candidate.unknownLookupRefs.entries()], []);
    assert.deepEqual(candidate.previewFallbackFired, { termId: 'projected0', kind: 'noContribution' });
  });
});
