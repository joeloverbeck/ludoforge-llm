// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary } from '../../src/kernel/turn-flow-lifecycle.js';
import { initialState } from '../../src/kernel/index.js';
import {
  assertCardDrivenProductionFixture,
  assertCardTokenMultisetEqual,
  cardTokenCount,
  cardTokenMultiset,
  lifecycleTraceEntries,
} from '../helpers/lifecycle-invariant-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const BOUNDARY_ADVANCES = 30;

describe('turn-flow card boundary zone delta', () => {
  it('keeps FITL card-token count bounded across each lifecycle boundary', () => {
    const fixture = getFitlProductionFixture();
    const def = assertCardDrivenProductionFixture(fixture, 'FITL production');
    let state = initialState(def, 42, 4).state;

    for (let advance = 0; advance < BOUNDARY_ADVANCES; advance += 1) {
      const beforeCount = cardTokenCount(state);
      const beforeMultiset = cardTokenMultiset(state);
      const result = applyTurnFlowCardBoundary(def, state);
      const afterCount = cardTokenCount(result.state);
      const delta = Math.abs(afterCount - beforeCount);

      assert.ok(delta <= 1, `advance ${advance}: card-token count delta ${delta} exceeded 1`);
      assertCardTokenMultisetEqual(
        cardTokenMultiset(result.state),
        beforeMultiset,
        `advance ${advance}`,
      );
      assert.ok(
        lifecycleTraceEntries(result.traceEntries).length > 0,
        `advance ${advance}: expected lifecycle trace entries`,
      );
      state = result.state;
    }
  });
});
