// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import {
  FITL_PARITY_SEEDS,
  FITL_PLAYER_COUNT,
  FITL_SHORT_DRIFT_MAX_TURNS,
  TEXAS_MAX_TURNS,
  TEXAS_PARITY_SEEDS,
  TEXAS_PLAYER_COUNT,
  compileFitlDef,
  compileTexasDef,
  runVerifiedGameWithDiagnostics,
} from '../helpers/zobrist-incremental-property-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';

const assertHelperMatchesCanonical = (
  label: string,
  helperResult: ReturnType<typeof runVerifiedGameWithDiagnostics>,
  canonicalTrace: ReturnType<typeof runGame>,
): void => {
  if (helperResult.outcome !== 'completed') {
    assert.fail(
      `${label}: swallowed ${helperResult.errorCode} in helper path: ${helperResult.errorMessage}`,
    );
  }

  assert.equal(
    helperResult.stopReason,
    canonicalTrace.stopReason,
    `${label}: stopReason diverged between helper and canonical run paths`,
  );
  assert.equal(
    helperResult.finalStateHash,
    canonicalTrace.finalState.stateHash,
    `${label}: final state hash diverged between helper and canonical run paths`,
  );
  assert.equal(
    helperResult.decisionCount,
    canonicalTrace.decisions.length,
    `${label}: decision count diverged between helper and canonical run paths`,
  );
  assert.equal(
    helperResult.turnsCount,
    canonicalTrace.turnsCount,
    `${label}: turnsCount diverged between helper and canonical run paths`,
  );
};

describe('helper vs canonical run parity — Texas Hold\'em', () => {
  const def = compileTexasDef();
  const sharedRuntime = createGameDefRuntime(def);

  for (const seed of TEXAS_PARITY_SEEDS) {
    it(`seed=${seed}: helper path matches canonical shared-runtime run`, () => {
      const canonicalTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(TEXAS_PLAYER_COUNT),
        TEXAS_MAX_TURNS,
        TEXAS_PLAYER_COUNT,
        { skipDeltas: true },
        sharedRuntime,
      );
      const helperResult = runVerifiedGameWithDiagnostics(
        def,
        seed,
        TEXAS_PLAYER_COUNT,
        TEXAS_MAX_TURNS,
        sharedRuntime,
      );

      assertHelperMatchesCanonical(`Texas seed ${seed}`, helperResult, canonicalTrace);
    });
  }
});

describe('helper vs canonical run parity — FITL', () => {
  const def = compileFitlDef();
  const sharedRuntime = createGameDefRuntime(def);

  for (const seed of FITL_PARITY_SEEDS) {
    it(`seed=${seed}: helper path matches canonical shared-runtime run`, { timeout: 40_000 }, () => {
      const canonicalTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(FITL_PLAYER_COUNT),
        FITL_SHORT_DRIFT_MAX_TURNS,
        FITL_PLAYER_COUNT,
        { skipDeltas: true },
        sharedRuntime,
      );
      const helperResult = runVerifiedGameWithDiagnostics(
        def,
        seed,
        FITL_PLAYER_COUNT,
        FITL_SHORT_DRIFT_MAX_TURNS,
        sharedRuntime,
      );

      assertHelperMatchesCanonical(`FITL seed ${seed}`, helperResult, canonicalTrace);
    });
  }
});
