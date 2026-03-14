import * as assert from 'node:assert/strict';

import { MctsAgent, resolvePreset, GreedyAgent, RandomAgent } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  serializeTrace,
  type Agent,
  type GameTrace,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

export { GreedyAgent, MctsAgent, RandomAgent, resolvePreset, runGame, serializeTrace };
export type { Agent, GameTrace, ValidatedGameDef };

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

export const createMctsAgents = (count: number, preset: 'fast' | 'default' | 'strong'): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent(resolvePreset(preset)));

/**
 * Create MCTS agents with a tight time budget suitable for e2e testing.
 * Uses the default preset but overrides timeLimitMs and minIterations
 * to prevent test timeouts while still exercising epsilon-greedy rollouts.
 */
export const createTimeBudgetedDefaultAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent({ ...resolvePreset('default'), timeLimitMs: 1_000, minIterations: 4 }));

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
