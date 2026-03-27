import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type Agent,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createRandomAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new RandomAgent());

const FITL_PLAYER_COUNT = 4;
const TEXAS_PLAYER_COUNT = 6;
const MAX_TURNS = 200;
/**
 * Replay determinism is already exercised elsewhere in the test suite; this
 * file owns a curated production-scale replay parity proof. Keep FITL seed
 * count smaller than Texas because the determinism lane already carries broad
 * FITL random-play hash coverage in the Zobrist property sweep.
 */
const FITL_SEEDS = process.env.RUN_SLOW_E2E === '1'
  ? [1000, 1001, 1002, 1003, 1004, 1005]
  : [1000, 1001, 1002];
const TEXAS_SEEDS = process.env.RUN_SLOW_E2E === '1'
  ? Array.from({ length: 20 }, (_, index) => 2000 + index)
  : Array.from({ length: 10 }, (_, index) => 2000 + index);

type RunOutcome = {
  readonly kind: 'ok';
  readonly hash: bigint;
} | {
  readonly kind: 'error';
  readonly message: string;
};

/**
 * Run a game and capture either its final hash or its error message.
 * FITL has known rules gaps that cause runtime errors during random play —
 * determinism means the same seed produces the same error, not that every seed succeeds.
 */
const runOnce = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
): RunOutcome => {
  try {
    const agents = createRandomAgents(playerCount);
    const trace = runGame(def, seed, agents, MAX_TURNS, playerCount, { skipDeltas: true });
    return { kind: 'ok', hash: trace.finalState.stateHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message };
  }
};

/**
 * Run a game twice with the same seed. If the engine is deterministic:
 * - Both runs succeed with identical final state hashes, OR
 * - Both runs fail with the same error message.
 */
const assertDeterministic = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  label: string,
): void => {
  const run1 = runOnce(def, seed, playerCount);
  const run2 = runOnce(def, seed, playerCount);

  assert.equal(
    run1.kind,
    run2.kind,
    `${label} seed ${seed}: outcome kind diverged (${run1.kind} vs ${run2.kind})`,
  );

  if (run1.kind === 'ok' && run2.kind === 'ok') {
    assert.equal(
      run1.hash,
      run2.hash,
      `${label} seed ${seed}: final state hash diverged (${run1.hash.toString(16)} vs ${run2.hash.toString(16)})`,
    );
  } else if (run1.kind === 'error' && run2.kind === 'error') {
    assert.equal(
      run1.message,
      run2.message,
      `${label} seed ${seed}: error message diverged`,
    );
  }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('draft-state determinism parity', () => {
  describe(`FITL — ${FITL_SEEDS.length} curated seeds produce identical hashes on replay`, () => {
    const def = compileFitlDef();

    for (const seed of FITL_SEEDS) {
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, FITL_PLAYER_COUNT, 'FITL');
      });
    }
  });

  describe(`Texas Hold'em — ${TEXAS_SEEDS.length} seeds produce identical hashes on replay`, () => {
    const def = compileTexasDef();

    for (const seed of TEXAS_SEEDS) {
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, TEXAS_PLAYER_COUNT, 'Texas');
      });
    }
  });
});
