// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createStandingPreviewDef,
  currentStandingRef,
  runStandingPreviewTrace,
  STANDING_PREVIEW_TERM_ID,
} from './standing-preview-fixture.js';
import { resolvePolicyStandingRoleSelector } from '../../../src/agents/policy-surface.js';
import {
  createGameDefRuntime,
  initialState,
} from '../../../src/kernel/index.js';

const contributionForTerm = (trace: ReturnType<typeof runStandingPreviewTrace>): number | undefined =>
  trace.candidates?.[0]?.scoreContributions.find((entry) => entry.termId === STANDING_PREVIEW_TERM_ID)?.contribution;

describe('Spec 180 standing role primitives', () => {
  it('resolves role-based seatAgg targets under descending terminal ranking', () => {
    const options = {
      previewVisibility: 'public' as const,
      seatAggExpr: currentStandingRef(),
      initialStandings: { north: 5, east: 7, south: 4, west: 1 },
      rankingOrder: 'desc' as const,
    };

    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'currentLeader' } })), 7);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'nearestThreat' } })), 7);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'closestAhead' } })), 7);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'closestBehind' } })), 4);
  });

  it('resolves role-based seatAgg targets under ascending terminal ranking', () => {
    const options = {
      previewVisibility: 'public' as const,
      seatAggExpr: currentStandingRef(),
      initialStandings: { north: 5, east: 3, south: 6, west: 9 },
      rankingOrder: 'asc' as const,
    };

    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'currentLeader' } })), 3);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'nearestThreat' } })), 3);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'closestAhead' } })), 3);
    assert.equal(contributionForTerm(runStandingPreviewTrace({ ...options, seatAggOver: { role: 'closestBehind' } })), 6);
  });

  it('reports unresolved adjacent roles when no seat is ahead or behind self', () => {
    const def = createStandingPreviewDef({
      previewVisibility: 'public',
      initialStandings: { north: 9, east: 7, south: 4, west: 1 },
      rankingOrder: 'desc',
    });
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 180, 4, undefined, runtime).state;

    assert.equal(resolvePolicyStandingRoleSelector(def, state, 'closestAhead', 'north'), undefined);
    assert.equal(resolvePolicyStandingRoleSelector(def, state, 'closestBehind', 'west'), undefined);
  });

  it('does not resolve role aggregate targets through hidden current standing', () => {
    const trace = runStandingPreviewTrace({
      previewVisibility: 'public',
      currentVisibility: 'hidden',
      seatAggExpr: { kind: 'literal', value: 1 },
      seatAggOver: { role: 'closestAhead' },
      initialStandings: { north: 5, east: 7, south: 4, west: 1 },
      rankingOrder: 'desc',
    });

    assert.equal(contributionForTerm(trace), 0);
  });
});
