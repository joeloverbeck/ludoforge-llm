import {
  assertValidatedGameDef,
  isKernelRuntimeError,
  kernelRuntimeError,
  type ValidatedGameDef,
  type SimulationStopReason,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import type { GameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGameSteps, type RunGameInput } from '../../src/sim/index.js';
import { assertNoErrors } from './diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from './production-spec-helpers.js';
import { createSeededChoiceAgents } from './test-agents.js';

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
export const TEXAS_PARITY_SEEDS = [1000, 3000, 8888, 12345] as const;
export const FITL_PARITY_SEEDS = [
  FITL_SHORT_DIVERSE_SEEDS[0],
  FITL_SHORT_DIVERSE_SEEDS[1],
  FITL_SHORT_DIVERSE_SEEDS[2],
  FITL_SHORT_DIVERSE_SEEDS[3],
] as const;

export type RunVerifiedGameDiagnostics =
  | {
    readonly outcome: 'completed';
    readonly decisionCount: number;
    readonly stopReason: SimulationStopReason;
    readonly finalStateHash: bigint;
    readonly turnsCount: number;
  }
  | {
    readonly outcome: 'swallowedKernelRuntimeError';
    readonly decisionCount: 0;
    readonly errorCode: string;
    readonly errorMessage: string;
  };

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
 * errors so coverage stays focused on hash parity.
 * The broad property sweep samples this invariant periodically; the exact
 * move-by-move oracle lives in `zobrist-incremental-parity.test.ts` (Texas)
 * and the seed-split `zobrist-incremental-parity-fitl-*` tests (FITL).
 *
 * Run-boundary contract:
 * like `runGame`, callers may pass a shared `GameDefRuntime` reused across
 * many invocations. `runVerifiedGame` forks that runtime via
 * `runGameSteps(...)` before execution so `runLocal` members
 * restart from their declared initial state while `sharedStructural` members
 * remain shared by reference. This helper consumes the same canonical loop
 * primitive as `runGame` while preserving the narrower diagnostics contract.
 * Helpers that do not fork internally must require an explicit
 * pre-forked-runtime assertion instead.
 */
export const runVerifiedGame = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): number => runVerifiedGameWithDiagnostics(def, seed, playerCount, maxTurns, runtime).decisionCount;

export const runVerifiedGameWithDiagnostics = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): RunVerifiedGameDiagnostics => {
  const agents = createSeededChoiceAgents(playerCount);
  const input: RunGameInput = {
    def,
    seed,
    agents,
    maxTurns,
    playerCount,
    options: {
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
      kernel: {
        verifyIncrementalHash: { interval: PROPERTY_HASH_VERIFY_INTERVAL },
      },
    },
    runtime,
  };

  let decisionCount = 0;
  try {
    for (const step of runGameSteps(input)) {
      if (step.kind === 'auto') {
        decisionCount += step.autoResolvedLogs.length;
      } else if (step.kind === 'player') {
        decisionCount += 1;
      } else if (step.kind === 'terminal' || step.kind === 'maxTurns' || step.kind === 'noLegalMoves') {
        return {
          outcome: 'completed',
          decisionCount,
          stopReason: step.stopReason,
          finalStateHash: step.state.stateHash,
          turnsCount: step.state.turnCount,
        };
      }
    }
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      'runGameSteps generator exited without terminal step',
    );
  } catch (err) {
    if (isKernelRuntimeError(err) && err.code === 'HASH_DRIFT') {
      throw err;
    }
    if (isKernelRuntimeError(err)) {
      return {
        outcome: 'swallowedKernelRuntimeError',
        decisionCount: 0,
        errorCode: err.code,
        errorMessage: err.message,
      };
    }
    return {
      outcome: 'swallowedKernelRuntimeError',
      decisionCount: 0,
      errorCode: 'NON_KERNEL_RUNTIME_ERROR',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
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
