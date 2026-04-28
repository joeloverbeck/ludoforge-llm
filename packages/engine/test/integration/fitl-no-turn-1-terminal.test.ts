// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { assertNoTerminalAtOrBeforeTurn, runFitlBaselineTrace } from '../helpers/lifecycle-invariant-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_SEEDS = [42] as const;
const EARLY_TERMINAL_SENTINEL_TURN = 1;

describe('FITL early terminal sentinel', () => {
  it('does not report terminal during the first production turn', () => {
    const fixture = getFitlProductionFixture();
    for (const seed of FITL_SEEDS) {
      const trace = runFitlBaselineTrace(seed, EARLY_TERMINAL_SENTINEL_TURN, fixture);
      assertNoTerminalAtOrBeforeTurn(trace, EARLY_TERMINAL_SENTINEL_TURN, `FITL seed ${seed}`);
    }
  });
});
