// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  partiallyUnavailableStandingExpr,
  runStandingPreviewTrace,
  STANDING_PREVIEW_TERM_ID,
} from '../preview-standing/standing-preview-fixture.js';

const contributionForTerm = (trace: ReturnType<typeof runStandingPreviewTrace>): number | undefined =>
  trace.candidates?.[0]?.scoreContributions.find((entry) => entry.termId === STANDING_PREVIEW_TERM_ID)?.contribution;

const fallbackForTerm = (trace: ReturnType<typeof runStandingPreviewTrace>) =>
  trace.candidates?.[0]?.previewFallbackFired;

describe('Spec 180 outer-preview seatAgg availability', () => {
  it('requireAllReady makes a partially unavailable preview seat aggregate unavailable', () => {
    const trace = runStandingPreviewTrace({
      previewVisibility: 'hidden',
      seatAggAvailability: 'requireAllReady',
      seatAggExpr: partiallyUnavailableStandingExpr(),
      initialStandings: { east: 0, south: 1, west: 2 },
    });

    assert.equal(contributionForTerm(trace), undefined);
    assert.deepEqual(fallbackForTerm(trace), {
      termId: STANDING_PREVIEW_TERM_ID,
      kind: 'noContribution',
    });
  });

  it('requireAnyReady uses ready cells while preserving unavailable preview evidence', () => {
    const trace = runStandingPreviewTrace({
      previewVisibility: 'hidden',
      seatAggAvailability: 'requireAnyReady',
      seatAggExpr: partiallyUnavailableStandingExpr(),
      initialStandings: { east: 0, south: 1, west: 2 },
    });

    assert.equal(contributionForTerm(trace), 10);
    assert.equal(fallbackForTerm(trace), undefined);
    assert.equal((trace.candidates?.[0]?.unknownPreviewRefs.length ?? 0) > 0, true);
  });

  it('skipUnavailable keeps legacy partial-ready aggregation but not all-unavailable silent zero', () => {
    const partialTrace = runStandingPreviewTrace({
      previewVisibility: 'hidden',
      seatAggAvailability: 'skipUnavailable',
      seatAggExpr: partiallyUnavailableStandingExpr(),
      initialStandings: { east: 0, south: 1, west: 2 },
    });
    assert.equal(contributionForTerm(partialTrace), 10);
    assert.equal(fallbackForTerm(partialTrace), undefined);

    const allUnavailableTrace = runStandingPreviewTrace({
      previewVisibility: 'hidden',
      seatAggAvailability: 'skipUnavailable',
    });
    assert.equal(contributionForTerm(allUnavailableTrace), undefined);
    assert.deepEqual(fallbackForTerm(allUnavailableTrace), {
      termId: STANDING_PREVIEW_TERM_ID,
      kind: 'noContribution',
    });
  });

  it('selfAndTargetReady requires the self preview cell and the target cell to be ready', () => {
    const unavailableSelfTrace = runStandingPreviewTrace({
      previewVisibility: 'hidden',
      seatAggAvailability: 'selfAndTargetReady',
      seatAggExpr: partiallyUnavailableStandingExpr(),
      seatAggOver: ['south'],
      initialStandings: { north: 0, south: 1 },
    });
    assert.equal(contributionForTerm(unavailableSelfTrace), undefined);
    assert.deepEqual(fallbackForTerm(unavailableSelfTrace), {
      termId: STANDING_PREVIEW_TERM_ID,
      kind: 'noContribution',
    });

    const readyTrace = runStandingPreviewTrace({
      previewVisibility: 'public',
      seatAggAvailability: 'selfAndTargetReady',
      seatAggOver: ['south'],
      initialStandings: { north: 0, south: 1 },
    });
    assert.equal(contributionForTerm(readyTrace), 8);
    assert.equal(fallbackForTerm(readyTrace), undefined);
  });
});
