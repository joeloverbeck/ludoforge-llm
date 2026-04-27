// @test-class: architectural-invariant
// @witness: spec-146-drive-mutation-safety
import { describe, it } from 'node:test';

import {
  assertPreviewDriveDeterministic,
  assertPreviewDriveDoesNotMutateInput,
  assertPreviewDriveMatchesCanonicalReplay,
  collectChooseOneDriveFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Spec 146 preview drive mutation safety — FITL', () => {
  const { def, runtime } = createFitlRuntime();
  const fixtures = collectChooseOneDriveFixtures(def, runtime, {
    seed: 1,
    playerCount: FITL_PLAYER_COUNT,
    count: 4,
    expectedMinDepth: 2,
    maxSteps: 24,
  });

  describe('F#11 caller input non-mutation', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveDoesNotMutateInput(def, runtime, fixture);
      });
    }
  });

  describe('F#8 deterministic repeated drive results', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveDeterministic(def, runtime, fixture);
      });
    }
  });

  describe('shadow chain matches canonical apply chain', () => {
    for (const fixture of fixtures) {
      it(fixture.label, () => {
        assertPreviewDriveMatchesCanonicalReplay(def, runtime, fixture);
      });
    }
  });
});
