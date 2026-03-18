import * as assert from 'node:assert/strict';

import {
  MctsAgent,
  resolveBudgetProfile,
  GreedyAgent,
  RandomAgent,
  runSearch,
  createRootNode,
  createNodePool,
  selectRootDecision,
} from '../../../src/agents/index.js';
import type { MctsBudgetProfile, LeafEvaluator, MctsSearchDiagnostics } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  derivePlayerObservation,
  fork,
  initialState,
  legalMoves,
  serializeTrace,
  type Agent,
  type GameTrace,
  type Move,
  type PlayerId,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

export { GreedyAgent, MctsAgent, RandomAgent, resolveBudgetProfile, runGame, serializeTrace };
export type { Agent, GameTrace, LeafEvaluator, MctsBudgetProfile, MctsSearchDiagnostics, ValidatedGameDef };

export const FAST_MAX_TURNS = 200;
export const DEFAULT_MAX_TURNS = 20;
export const RUN_MCTS_E2E = process.env.RUN_MCTS_E2E === '1';

const traceCache = new Map<string, GameTrace>();

export const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

export const createMctsAgents = (count: number, profile: MctsBudgetProfile): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent(resolveBudgetProfile(profile)));

/**
 * Create MCTS agents with a tight time budget suitable for e2e testing.
 * Uses the default preset but overrides timeLimitMs and minIterations
 * to prevent test timeouts while still exercising epsilon-greedy rollouts.
 */
export const createTimeBudgetedTurnAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent({ ...resolveBudgetProfile('turn'), timeLimitMs: 1_000, minIterations: 4 }));

export const loadTrace = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  playerCount: number,
  maxTurns: number,
): GameTrace => {
  const key = `mcts:${seed}:${playerCount}:${maxTurns}:${agents.map((a) => a.constructor.name).join(',')}`;
  const cached = traceCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const trace = runGame(def, seed, agents, maxTurns, playerCount);
  traceCache.set(key, trace);
  return trace;
};

const formatDiagnostics = (trace: GameTrace): string =>
  JSON.stringify({
    stopReason: trace.stopReason,
    turnsCount: trace.turnsCount,
    moves: trace.moves.length,
    currentPhase: trace.finalState.currentPhase,
  });

export const assertValidStopReason = (trace: GameTrace): void => {
  assert.notEqual(
    trace.stopReason,
    'noLegalMoves',
    `unexpected noLegalMoves: ${formatDiagnostics(trace)}`,
  );
  assert.ok(
    trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns',
    `unexpected stop reason: ${trace.stopReason}`,
  );
  assert.ok(trace.moves.length > 0, 'trace should contain moves');
};

// ---------------------------------------------------------------------------
// Mode-comparison helpers
// ---------------------------------------------------------------------------

/** Create MCTS agents with a specific leaf evaluator override. */
export const createMctsAgentsWithEvaluator = (
  count: number,
  profile: MctsBudgetProfile,
  leafEvaluator: LeafEvaluator,
): readonly Agent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolveBudgetProfile(profile), leafEvaluator }),
  );

/** Result of a timed game run. */
export interface TimedGameResult {
  readonly trace: GameTrace;
  readonly elapsedMs: number;
}

/** Run a game and measure wall-clock time. */
export const runTimedGame = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount: number,
): TimedGameResult => {
  const start = Date.now();
  const trace = runGame(def, seed, agents, maxTurns, playerCount);
  return { trace, elapsedMs: Date.now() - start };
};

/** Result of a single-position MCTS search with diagnostics. */
export interface PositionSearchResult {
  readonly move: Move;
  readonly iterations: number;
  readonly diagnostics: MctsSearchDiagnostics;
  readonly elapsedMs: number;
}

/**
 * Run a single MCTS search on the first decision point of a game.
 * Uses `runSearch` directly to capture diagnostics that `MctsAgent`
 * discards. The game is initialized from `seed` and advanced to the
 * first state with ≥2 legal moves.
 */
export const runPositionSearch = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  profile: MctsBudgetProfile,
  leafEvaluator: LeafEvaluator,
): PositionSearchResult => {
  const config = { ...resolveBudgetProfile(profile), leafEvaluator, diagnostics: true };
  const runtime = createGameDefRuntime(def);
  const initResult = initialState(def, seed, playerCount);
  const state = initResult.state;
  const rng = createRng(BigInt(seed + 9999));

  // Find the active player and their legal moves.
  const playerId = state.activePlayer as PlayerId;
  const moves = legalMoves(def, state, undefined, runtime);
  if (moves.length < 2) {
    throw new Error(`Expected ≥2 legal moves at initial state, got ${moves.length}`);
  }

  const observation = derivePlayerObservation(def, state, playerId);
  const root = createRootNode(state.playerCount);
  const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
  const pool = createNodePool(poolCapacity, state.playerCount);
  const [searchRng] = fork(rng);

  const start = Date.now();
  const result = runSearch(
    root, def, state, observation, playerId,
    config, searchRng, moves, runtime, pool,
  );
  const elapsedMs = Date.now() - start;

  const bestChild = selectRootDecision(root, playerId);

  if (result.diagnostics === undefined) {
    throw new Error('Expected diagnostics to be present (config.diagnostics was true)');
  }

  return {
    move: bestChild.move as Move,
    iterations: result.iterations,
    diagnostics: result.diagnostics,
    elapsedMs,
  };
};

/** Format a diagnostics summary for logging. */
export const formatSearchDiagnostics = (d: MctsSearchDiagnostics): string =>
  JSON.stringify({
    iterations: d.iterations,
    nodesAllocated: d.nodesAllocated,
    totalTimeMs: d.totalTimeMs !== undefined ? Math.round(d.totalTimeMs) : undefined,
    leafEvaluatorType: d.leafEvaluatorType,
    rootStopReason: d.rootStopReason,
    legalMovesCalls: d.legalMovesCalls,
    applyMoveCalls: d.applyMoveCalls,
    evaluateStateCalls: d.evaluateStateCalls,
    stateCacheHits: d.stateCacheHits,
    stateCacheLookups: d.stateCacheLookups,
    cacheHitRate: d.stateCacheLookups !== undefined && d.stateCacheLookups > 0
      ? Math.round(((d.stateCacheHits ?? 0) / d.stateCacheLookups) * 100)
      : undefined,
  }, null, 2);
