import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

/**
 * MCTS fast preset uses random rollout (no evaluateState in hot path).
 * Default preset uses epsilon-greedy rollout which exercises the
 * evaluateState → runtime threading fix.
 *
 * Most tests are gated behind RUN_MCTS_E2E because MCTS + Texas Hold'em
 * is inherently expensive (~0.1-0.5s per move decision).
 */

const FAST_MAX_TURNS = 200;
const DEFAULT_MAX_TURNS = 20;
const RUN_MCTS_E2E = process.env.RUN_MCTS_E2E === '1';

const traceCache = new Map<string, GameTrace>();

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createMctsAgents = (count: number, preset: 'fast' | 'default' | 'strong'): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent(resolvePreset(preset)));

/**
 * Create MCTS agents with a tight time budget suitable for e2e testing.
 * Uses the default preset but overrides timeLimitMs and minIterations
 * to prevent test timeouts while still exercising epsilon-greedy rollouts.
 */
const createTimeBudgetedDefaultAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new MctsAgent({ ...resolvePreset('default'), timeLimitMs: 1_000, minIterations: 4 }));

const loadTrace = (
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

const assertValidStopReason = (trace: GameTrace): void => {
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

describe('texas hold\'em MCTS agent e2e', () => {
  // ── Core smoke tests (always run) ──────────────────────────────────────

  describe('fast preset', () => {
    it('completes 2-player game with MCTS fast agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 201, createMctsAgents(2, 'fast'), 2, FAST_MAX_TURNS);
      assertValidStopReason(trace);
    });
  });

  describe('default preset (time-budgeted)', () => {
    it('completes 2-player game with MCTS default agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 202, createTimeBudgetedDefaultAgents(2), 2, DEFAULT_MAX_TURNS);
      assertValidStopReason(trace);
    });
  });

  describe('determinism', () => {
    it('same seed + same MCTS config produces identical trace', () => {
      const def = compileTexasDef();
      const seed = 501;
      const playerCount = 2;
      // Use a small turn budget — determinism only needs a handful of moves.
      const maxTurns = 10;

      const agentsA = createMctsAgents(playerCount, 'fast');
      const agentsB = createMctsAgents(playerCount, 'fast');

      const traceA = runGame(def, seed, agentsA, maxTurns, playerCount);
      const traceB = runGame(def, seed, agentsB, maxTurns, playerCount);

      assert.deepEqual(
        traceA.moves.map((entry) => entry.move),
        traceB.moves.map((entry) => entry.move),
      );
      assert.equal(traceA.finalState.stateHash, traceB.finalState.stateHash);
      assert.deepEqual(serializeTrace(traceA), serializeTrace(traceB));
    });
  });

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  describe('fast preset (extended)', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 3-player tournament with MCTS fast agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 301, createMctsAgents(3, 'fast'), 3, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes 6-player tournament with MCTS fast agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 601, createMctsAgents(6, 'fast'), 6, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 3-player tournament with MCTS fast agents', () => {});
      it.skip('[slow] completes 6-player tournament with MCTS fast agents', () => {});
    }
  });

  describe('default preset (extended)', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 3-player tournament with MCTS default agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 302, createTimeBudgetedDefaultAgents(3), 3, DEFAULT_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes 6-player tournament with MCTS default agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 602, createTimeBudgetedDefaultAgents(6), 6, DEFAULT_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 3-player tournament with MCTS default agents', () => {});
      it.skip('[slow] completes 6-player tournament with MCTS default agents', () => {});
    }
  });

  describe('strong preset', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 2-player tournament with MCTS strong agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 203, createMctsAgents(2, 'strong'), 2, DEFAULT_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 2-player tournament with MCTS strong agents', () => {});
    }
  });

  describe('mixed agent tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes tournament with MCTS fast vs random agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolvePreset('fast')),
          new RandomAgent(),
        ];
        const trace = loadTrace(def, 401, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes tournament with MCTS fast vs greedy agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolvePreset('fast')),
          new GreedyAgent(),
        ];
        const trace = loadTrace(def, 402, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes tournament with MCTS fast vs random agents', () => {});
      it.skip('[slow] completes tournament with MCTS fast vs greedy agents', () => {});
    }
  });

  describe('timing bounds', () => {
    it('MCTS fast completes 2-player game within wall-clock budget', () => {
      const def = compileTexasDef();
      const start = Date.now();
      const trace = loadTrace(def, 701, createMctsAgents(2, 'fast'), 2, FAST_MAX_TURNS);
      const elapsed = Date.now() - start;

      assert.ok(trace.moves.length > 0, 'trace should contain moves');
      // Generous bound: 90 seconds for a 200-turn tournament
      assert.ok(elapsed < 90_000, `MCTS fast 2-player took ${elapsed}ms, expected < 90000ms`);
    });
  });
});
