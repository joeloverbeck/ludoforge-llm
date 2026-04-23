// @test-class: architectural-invariant
// Observable-equivalence complement to 141RUNCACHE-001's runtime-member
// ownership classification: if a `runLocal` member is misclassified as
// `sharedStructural`, this shared-runtime corpus witness should diverge first.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import {
  FITL_PLAYER_COUNT,
  FITL_SHORT_DRIFT_MAX_TURNS,
  FITL_SHORT_DIVERSE_SEEDS,
  TEXAS_MAX_TURNS,
  TEXAS_PLAYER_COUNT,
  compileFitlDef,
  compileTexasDef,
} from '../helpers/zobrist-incremental-property-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';

const TEXAS_PARITY_SEEDS = [1000, 3000, 8888, 12345] as const;
const FITL_PARITY_SEEDS = [
  FITL_SHORT_DIVERSE_SEEDS[0],
  FITL_SHORT_DIVERSE_SEEDS[1],
  FITL_SHORT_DIVERSE_SEEDS[2],
  FITL_SHORT_DIVERSE_SEEDS[3],
] as const;

describe('forked-vs-fresh runtime parity — Texas Hold\'em', () => {
  const def = compileTexasDef();
  const sharedRuntime = createGameDefRuntime(def);

  for (const seed of TEXAS_PARITY_SEEDS) {
    it(`seed=${seed}: shared-runtime fork matches fresh runtime construction`, () => {
      const freshTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(TEXAS_PLAYER_COUNT),
        TEXAS_MAX_TURNS,
        TEXAS_PLAYER_COUNT,
        { skipDeltas: true },
      );
      const forkedTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(TEXAS_PLAYER_COUNT),
        TEXAS_MAX_TURNS,
        TEXAS_PLAYER_COUNT,
        { skipDeltas: true },
        sharedRuntime,
      );

      assert.equal(
        forkedTrace.finalState.stateHash,
        freshTrace.finalState.stateHash,
        `Texas seed ${seed}: final state hash diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.stopReason,
        freshTrace.stopReason,
        `Texas seed ${seed}: stopReason diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.decisions.length,
        freshTrace.decisions.length,
        `Texas seed ${seed}: decision count diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.turnsCount,
        freshTrace.turnsCount,
        `Texas seed ${seed}: turnsCount diverged between fresh and forked runtime paths`,
      );
    });
  }
});

describe('forked-vs-fresh runtime parity — FITL', () => {
  const def = compileFitlDef();
  const sharedRuntime = createGameDefRuntime(def);

  for (const seed of FITL_PARITY_SEEDS) {
    it(`seed=${seed}: shared-runtime fork matches fresh runtime construction`, { timeout: 40_000 }, () => {
      const freshTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(FITL_PLAYER_COUNT),
        FITL_SHORT_DRIFT_MAX_TURNS,
        FITL_PLAYER_COUNT,
        { skipDeltas: true },
      );
      const forkedTrace = runGame(
        def,
        seed,
        createSeededChoiceAgents(FITL_PLAYER_COUNT),
        FITL_SHORT_DRIFT_MAX_TURNS,
        FITL_PLAYER_COUNT,
        { skipDeltas: true },
        sharedRuntime,
      );

      assert.equal(
        forkedTrace.finalState.stateHash,
        freshTrace.finalState.stateHash,
        `FITL seed ${seed}: final state hash diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.stopReason,
        freshTrace.stopReason,
        `FITL seed ${seed}: stopReason diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.decisions.length,
        freshTrace.decisions.length,
        `FITL seed ${seed}: decision count diverged between fresh and forked runtime paths`,
      );
      assert.equal(
        forkedTrace.turnsCount,
        freshTrace.turnsCount,
        `FITL seed ${seed}: turnsCount diverged between fresh and forked runtime paths`,
      );
    });
  }
});
