// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import {
  buildEncodedState,
  buildEncodedStateLayout,
  initialState,
} from '../../src/kernel/index.js';
import { assertEncodedSurfaceParity } from '../helpers/encoded-state-assertions.js';
import {
  getFitlProductionFixture,
  getTexasProductionFixture,
} from '../helpers/production-spec-helpers.js';

describe('encoded-state production fixture parity', () => {
  it('preserves the encoded FITL read surface from authoritative GameState', () => {
    const def = getFitlProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);

    for (const seed of [149005, 149015, 149025]) {
      const state = initialState(def, seed, def.metadata.players.max).state;
      assertEncodedSurfaceParity(state, layout, buildEncodedState(state, layout));
    }
  });

  it('preserves the encoded Texas Holdem read surface from authoritative GameState', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const state = initialState(def, 149035, def.metadata.players.max).state;

    assertEncodedSurfaceParity(state, layout, buildEncodedState(state, layout));
  });
});
