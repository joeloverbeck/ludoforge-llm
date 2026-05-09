// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPreviewIntegrityFixture,
  runPreviewIntegrityPolicyTraceForFixture,
} from './preview-integrity-fixture.js';

describe('preview unavailable fallback constant zero', () => {
  it('records the explicit zero contribution and selects with fallbackExplicit', () => {
    const fixture = createPreviewIntegrityFixture(false, 'constantZero');
    const trace = runPreviewIntegrityPolicyTraceForFixture(fixture);

    for (const candidate of trace.candidates ?? []) {
      assert.deepEqual(
        candidate.scoreContributions.find((entry) => entry.termId === 'preferProjectedMargin'),
        { termId: 'preferProjectedMargin', contribution: 0 },
      );
      assert.deepEqual(candidate.previewFallbackFired, {
        termId: 'preferProjectedMargin',
        kind: 'constant',
        value: 0,
      });
    }

    const selected = trace.candidates?.find((candidate) => candidate.stableMoveKey === trace.selectedStableMoveKey);
    assert.equal(selected?.selectionReason, 'fallbackExplicit');
  });
});
