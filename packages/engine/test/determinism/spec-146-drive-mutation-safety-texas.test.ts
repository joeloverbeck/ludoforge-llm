// @test-class: architectural-invariant
// @witness: spec-146-drive-mutation-safety
import { describe, it } from 'node:test';

import {
  assertPreviewDriveDeterministic,
  assertPreviewDriveDoesNotMutateInput,
  assertPreviewDriveMatchesCanonicalReplay,
  createInitialStateExitFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createTexasRuntime,
  TEXAS_PLAYER_COUNT,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Spec 146 preview drive mutation safety — Texas Holdem', () => {
  const { def, runtime } = createTexasRuntime();
  const fixtures = createInitialStateExitFixtures(def, runtime, {
    seeds: [1, 17, 42, 99],
    playerCount: TEXAS_PLAYER_COUNT,
  });

  describe('F#11 caller input non-mutation for non-applicable exits', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveDoesNotMutateInput(def, runtime, fixture);
      });
    }
  });

  describe('F#8 deterministic repeated non-applicable exits', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveDeterministic(def, runtime, fixture);
      });
    }
  });

  describe('non-applicable exit matches canonical replay', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveMatchesCanonicalReplay(def, runtime, fixture);
      });
    }
  });
});
