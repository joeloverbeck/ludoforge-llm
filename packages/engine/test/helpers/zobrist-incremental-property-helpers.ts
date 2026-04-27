import {
  advanceAutoresolvable,
  applyPublishedDecision,
  assertValidatedGameDef,
  createRng,
  forkGameDefRuntimeForRun,
  initialState,
  isKernelRuntimeError,
  publishMicroturn,
  terminalResult,
  type ValidatedGameDef,
  type SimulationStopReason,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import type { GameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { CHANCE_RNG_MIX } from '../../src/kernel/microturn/constants.js';
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

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

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

const resolvePlayerIndexForSeat = (
  def: ValidatedGameDef,
  seatId: string,
): number => {
  const explicitIndex = (def.seats ?? []).findIndex((seat) => seat.id === seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

const isNoBridgeableMicroturnError = (error: unknown): boolean =>
  error instanceof Error
  && (
    error.message.includes('no simple actionSelection moves are currently bridgeable')
    || error.message.includes('has no bridgeable continuations')
  );

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
 * and `zobrist-incremental-parity-fitl.test.ts` (FITL).
 *
 * Run-boundary contract:
 * like `runGame`, callers may pass a shared `GameDefRuntime` reused across
 * many invocations. `runVerifiedGame` forks that runtime via
 * `forkGameDefRuntimeForRun(...)` before execution so `runLocal` members
 * restart from their declared initial state while `sharedStructural` members
 * remain shared by reference. This helper bypasses `runGame` and advances via
 * `publishMicroturn(...)` plus `applyPublishedDecision(...)` directly, but
 * that bypass inherits the same run-boundary contract rather than weakening
 * it. Helpers that do not fork internally must require an explicit
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
  const kernelOptions = {
    verifyIncrementalHash: { interval: PROPERTY_HASH_VERIFY_INTERVAL },
  } as const;
  const runRuntime = forkGameDefRuntimeForRun(runtime);
  const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX);
  const agentRngByPlayer = Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

  try {
    let state = initialState(def, seed, playerCount, kernelOptions, runRuntime).state;
    let currentChanceRng = chanceRng;
    let decisionCount = 0;

    while (true) {
      const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runRuntime);
      state = autoResult.state;
      currentChanceRng = autoResult.rng;
      decisionCount += autoResult.autoResolvedLogs.length;

      if (terminalResult(def, state, runRuntime) !== null || state.turnCount >= maxTurns) {
        return {
          outcome: 'completed',
          decisionCount,
          stopReason: terminalResult(def, state, runRuntime) !== null ? 'terminal' : 'maxTurns',
          finalStateHash: state.stateHash,
          turnsCount: state.turnCount,
        };
      }

      let microturn;
      try {
        microturn = publishMicroturn(def, state, runRuntime);
      } catch (error) {
        if (isNoBridgeableMicroturnError(error)) {
          return {
            outcome: 'completed',
            decisionCount,
            stopReason: 'noLegalMoves',
            finalStateHash: state.stateHash,
            turnsCount: state.turnCount,
          };
        }
        throw error;
      }

      if (microturn.legalActions.length === 0) {
        return {
          outcome: 'completed',
          decisionCount,
          stopReason: 'noLegalMoves',
          finalStateHash: state.stateHash,
          turnsCount: state.turnCount,
        };
      }

      const player = resolvePlayerIndexForSeat(def, microturn.seatId);
      if (player < 0 || player >= agents.length) {
        throw new Error(`missing agent for player seat ${String(microturn.seatId)}`);
      }

      const selected = agents[player]!.chooseDecision({
        def,
        state,
        microturn,
        rng: agentRngByPlayer[player]!,
        runtime: runRuntime,
      });
      agentRngByPlayer[player] = selected.rng;
      state = applyPublishedDecision(def, state, microturn, selected.decision, kernelOptions, runRuntime).state;
      decisionCount += 1;
    }
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
