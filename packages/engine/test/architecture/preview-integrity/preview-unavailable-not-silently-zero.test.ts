// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPreviewIntegrityFixture,
  runPreviewIntegrityPolicyTraceForFixture,
} from './preview-integrity-fixture.js';

describe('preview unavailable fallback noContribution', () => {
  it('omits unavailable preview contributions instead of silently recording zero', () => {
    const fixture = createPreviewIntegrityFixture(false, 'noContribution');
    const trace = runPreviewIntegrityPolicyTraceForFixture(fixture);

    assert.equal(trace.previewUsage.coverage.allRootsUnavailable, true);
    for (const candidate of trace.candidates ?? []) {
      assert.equal(candidate.score, candidate.stableMoveKey.includes(':add:') ? 1 : 2);
      assert.equal(
        candidate.scoreContributions.some((entry) => entry.termId === 'preferProjectedMargin'),
        false,
      );
      assert.deepEqual(candidate.previewFallbackFired, {
        termId: 'preferProjectedMargin',
        kind: 'noContribution',
      });
    }

    const selected = trace.candidates?.find((candidate) => candidate.stableMoveKey === trace.selectedStableMoveKey);
    assert.equal(selected?.selectionReason, 'tiebreakAfterPreviewNoSignal');
  });
});
