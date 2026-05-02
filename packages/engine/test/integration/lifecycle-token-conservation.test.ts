// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary } from '../../src/kernel/turn-flow-lifecycle.js';
import { initialState } from '../../src/kernel/index.js';
import {
  assertCardDrivenProductionFixture,
  assertCardTokenMultisetEqual,
  cardTokenMultiset,
  runTexasSeededChoiceTrace,
} from '../helpers/lifecycle-invariant-helpers.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_SEEDS = [42, 43, 44, 45, 46] as const;
const TEXAS_SEEDS = [42, 43, 44, 45, 46] as const;
const MAX_TURNS = 30;

describe('lifecycle token conservation', () => {
  it('preserves FITL production card-token identities across boundary advances', () => {
    const fixture = getFitlProductionFixture();
    const def = assertCardDrivenProductionFixture(fixture, 'FITL production');

    for (const seed of FITL_SEEDS) {
      let state = initialState(def, seed, 4).state;
      const expected = cardTokenMultiset(state);
      for (let turn = 0; turn < MAX_TURNS; turn += 1) {
        state = applyTurnFlowCardBoundary(def, state).state;
      }
      assertCardTokenMultisetEqual(
        cardTokenMultiset(state),
        expected,
        `FITL seed ${seed}`,
      );
    }
  });

  it('keeps the Texas mirror bounded without applying cardDriven lifecycle semantics', () => {
    const fixture = getTexasProductionFixture();
    const def = fixture.gameDef;
    if (def.turnOrder?.type === 'cardDriven') {
      const expected = cardTokenMultiset(initialState(def, TEXAS_SEEDS[0], 6).state);
      for (const seed of TEXAS_SEEDS) {
        const trace = runTexasSeededChoiceTrace(seed, MAX_TURNS, fixture);
        assertCardTokenMultisetEqual(
          cardTokenMultiset(trace.finalState),
          expected,
          `Texas seed ${seed}`,
        );
      }
    }
  });
});
