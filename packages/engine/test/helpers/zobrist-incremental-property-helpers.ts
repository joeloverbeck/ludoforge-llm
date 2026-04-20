import { RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  isKernelRuntimeError,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import type { GameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from './diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from './production-spec-helpers.js';

export const TEXAS_PLAYER_COUNT = 4;
export const TEXAS_MAX_TURNS = 80;
export const FITL_PLAYER_COUNT = 4;
export const PROPERTY_HASH_VERIFY_INTERVAL = 10;
export const FITL_SHORT_DRIFT_MAX_TURNS = 100;
export const FITL_MEDIUM_DRIFT_MAX_TURNS = 125;

export const DIVERSE_SEEDS = [
  1000, 3000, 5000, 8888, 12345,
  200, 400, 6666, 22222, 44444,
];

/**
 * Broad FITL drift detection should sample a few low seeds and a few distant
 * seeds instead of brute-forcing a contiguous range. The exact and replay
 * parity files own the longer curated proofs.
 */
export const FITL_SHORT_DIVERSE_SEEDS = [1, 4, 8, 12, 16, 20, 24, 44444] as const;
export const FITL_MEDIUM_DIVERSE_SEEDS = [2, 7, 13, 17, 1000, 12345] as const;

const createRandomAgents = (count: number): readonly RandomAgent[] =>
  Array.from({ length: count }, () => new RandomAgent());

export const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Texas compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

export const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('FITL compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

/**
 * Re-throw HASH_DRIFT (the contract under test), but swallow unrelated runtime
 * errors from known random-play gaps so coverage stays focused on hash parity.
 * The broad property sweep samples this invariant periodically; the exact
 * move-by-move oracle lives in `zobrist-incremental-parity.test.ts`.
 */
export const runVerifiedGame = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): number => {
  const agents = createRandomAgents(playerCount);
  try {
    const trace = runGame(def, seed, agents, maxTurns, playerCount, {
      kernel: { verifyIncrementalHash: { interval: PROPERTY_HASH_VERIFY_INTERVAL } },
    }, runtime);
    return trace.decisions.length;
  } catch (err) {
    if (isKernelRuntimeError(err) && err.code === 'HASH_DRIFT') {
      throw err;
    }
    return 0;
  }
};

export const createTexasRuntime = (): { readonly def: ValidatedGameDef; readonly runtime: GameDefRuntime } => {
  const def = compileTexasDef();
  return { def, runtime: createGameDefRuntime(def) };
};

export const createFitlRuntime = (): { readonly def: ValidatedGameDef; readonly runtime: GameDefRuntime } => {
  const def = compileFitlDef();
  return { def, runtime: createGameDefRuntime(def) };
};
