import type { Agent, GameDefRuntime, GameTrace, ValidatedGameDef } from '../kernel/index.js';
import type { SimulationOptions } from './sim-options.js';
import { runGameSteps } from './run-game-steps.js';

/**
 * Run-boundary contract:
 * callers may pass a shared `GameDefRuntime` reused across many `runGame`
 * invocations. `runGame` forks that runtime via
 * `forkGameDefRuntimeForRun(...)` before execution so `runLocal` members
 * restart from their declared initial state while `sharedStructural` members
 * remain shared by reference. The caller-supplied runtime is never mutated by
 * `runGame`. Any helper that advances state with a caller-supplied runtime
 * must honor the same contract: fork internally, or require a pre-forked
 * runtime via the explicit `ForkedGameDefRuntimeForRun` assertion pattern in
 * `gamedef-runtime.ts`.
 */
export const runGame = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): GameTrace => {
  const iterator = runGameSteps({
    def,
    seed,
    agents,
    maxTurns,
    ...(playerCount === undefined ? {} : { playerCount }),
    ...(options === undefined ? {} : { options }),
    ...(runtime === undefined ? {} : { runtime }),
  });
  let next = iterator.next();
  while (!next.done) {
    next = iterator.next();
  }
  return next.value;
};

/**
 * Batch variant of `runGame`.
 *
 * Inherits the canonical `runGame` run-boundary contract for every seed in the
 * batch. When callers provide a shared `GameDefRuntime`, each underlying
 * `runGame` invocation forks it independently before advancing state.
 */
export const runGames = (
  def: ValidatedGameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): readonly GameTrace[] => seeds.map((seed) => runGame(def, seed, agents, maxTurns, playerCount, options, runtime));
