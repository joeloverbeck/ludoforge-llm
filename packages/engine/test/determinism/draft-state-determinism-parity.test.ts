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
 * 10 seeds × 2 runs each = 20 full game simulations per game type.
 * This is sufficient to prove determinism (same seed → same hash).
 * Higher counts are available via RUN_SLOW_E2E=1 environment variable.
 */
const SEED_COUNT = process.env.RUN_SLOW_E2E === '1' ? 100 : 10;

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
  describe(`FITL — ${SEED_COUNT} seeds produce identical hashes on replay`, () => {
    const def = compileFitlDef();

    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = 1000 + i;
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, FITL_PLAYER_COUNT, 'FITL');
      });
    }
  });

  describe(`Texas Hold'em — ${SEED_COUNT} seeds produce identical hashes on replay`, () => {
    const def = compileTexasDef();

    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = 2000 + i;
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, TEXAS_PLAYER_COUNT, 'Texas');
      });
    }
  });
});
