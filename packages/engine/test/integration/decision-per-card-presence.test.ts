// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertDecisionBeforeTurnRetirement,
  assertTraceHasLifecycleActivity,
  runFitlBaselineTrace,
  runTexasSeededChoiceTrace,
} from '../helpers/lifecycle-invariant-helpers.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_SEEDS = [42] as const;
const TEXAS_SEEDS = [42, 43, 44, 45, 46] as const;
const MAX_TURNS = 1;

describe('decision-per-card lifecycle presence', () => {
  it('records a player or stochastic decision before every FITL turn retirement', () => {
    const fixture = getFitlProductionFixture();
    for (const seed of FITL_SEEDS) {
      const trace = runFitlBaselineTrace(seed, MAX_TURNS, fixture);
      assert.ok(trace.decisions.length > 0, `FITL seed ${seed}: expected retained decisions`);
      assertTraceHasLifecycleActivity(trace, `FITL seed ${seed}`);
      assertDecisionBeforeTurnRetirement(trace, `FITL seed ${seed}`);
    }
  });

  it('does not force cardDriven decision-per-card assertions onto Texas Holdem', () => {
    const fixture = getTexasProductionFixture();
    assert.notEqual(fixture.gameDef.turnOrder?.type, 'cardDriven', 'Texas production is the non-cardDriven mirror');
    for (const seed of TEXAS_SEEDS) {
      const trace = runTexasSeededChoiceTrace(seed, MAX_TURNS, fixture);
      assert.ok(trace.decisions.length > 0, `Texas seed ${seed}: expected retained decisions`);
    }
  });
});
