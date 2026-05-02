// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary } from '../../src/kernel/turn-flow-lifecycle.js';
import {
  assertCardDrivenProductionFixture,
  assertCardTokenMultisetEqual,
  cardTokenMultiset,
  runTexasSeededChoiceTrace,
} from '../helpers/lifecycle-invariant-helpers.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../helpers/production-spec-helpers.js';
import { initialState } from '../../src/kernel/index.js';

const FITL_SEEDS = Array.from({ length: 50 }, (_, index) => 42 + index);
const TEXAS_SEEDS = [42, 43, 44, 45, 46] as const;
const BOUNDARY_ADVANCES = 30;

describe('lifecycle invariant property sweep', () => {
  it('preserves card tokens across a curated FITL boundary-advance seed corpus', () => {
    const fixture = getFitlProductionFixture();
    const def = assertCardDrivenProductionFixture(fixture, 'FITL production');

    for (const seed of FITL_SEEDS) {
      let state = initialState(def, seed, 4).state;
      const expectedCards = cardTokenMultiset(state);
      for (let advance = 0; advance < BOUNDARY_ADVANCES; advance += 1) {
        state = applyTurnFlowCardBoundary(def, state).state;
        assertCardTokenMultisetEqual(cardTokenMultiset(state), expectedCards, `FITL seed ${seed} advance ${advance}`);
      }
    }
  });

  it('keeps the Texas mirror bounded for representative seeds', () => {
    const fixture = getTexasProductionFixture();
    assert.notEqual(fixture.gameDef.turnOrder?.type, 'cardDriven', 'Texas production is the non-cardDriven mirror');
    for (const seed of TEXAS_SEEDS) {
      const trace = runTexasSeededChoiceTrace(seed, BOUNDARY_ADVANCES, fixture);
      assert.ok(trace.decisions.length > 0, `Texas seed ${seed}: expected retained decisions`);
    }
  });
});
