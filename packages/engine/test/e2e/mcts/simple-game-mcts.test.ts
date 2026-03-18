/**
 * E2E test: MCTS search on a cheap/simple game.
 *
 * Exercises the full MCTS pipeline (expansion, selection, backprop, terminal
 * detection) on a self-contained game with no dependency on FITL or Texas
 * Hold'em data files.
 *
 * Created for 64MCTSPEROPT-005.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGameDefRuntime,
  createRng,
  derivePlayerObservation,
  fork,
  initialState,
  legalMoves,
  type Move,
  type PlayerId,
} from '../../../src/kernel/index.js';
import {
  resolveBudgetProfile,
  runSearch,
  createRootNode,
  createNodePool,
  selectRootDecision,
  MctsAgent,
} from '../../../src/agents/index.js';
import { runGame } from '../../../src/sim/index.js';
import { createSimpleMctsGameDef } from '../../helpers/simple-mcts-game.js';

// ---------------------------------------------------------------------------
// Single-position search tests
// ---------------------------------------------------------------------------

describe('simple game MCTS — single position search', () => {
  it('search completes without errors', () => {
    const def = createSimpleMctsGameDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const playerId = state.activePlayer as PlayerId;
    const moves = legalMoves(def, state, undefined, runtime);

    assert.ok(moves.length >= 2, `expected ≥2 legal moves, got ${moves.length}`);

    const config = { ...resolveBudgetProfile('interactive'), diagnostics: true };
    const rng = createRng(42n);
    const observation = derivePlayerObservation(def, state, playerId);
    const root = createRootNode(state.playerCount);
    const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
    const pool = createNodePool(poolCapacity, state.playerCount);
    const [searchRng] = fork(rng);

    const result = runSearch(
      root, def, state, observation, playerId,
      config, searchRng, moves, runtime, pool,
    );

    assert.ok(result.iterations > 0, 'search should complete at least one iteration');
    assert.ok(result.diagnostics !== undefined, 'diagnostics should be present');
  });

  it('selects a non-pass move', () => {
    const def = createSimpleMctsGameDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const playerId = state.activePlayer as PlayerId;
    const moves = legalMoves(def, state, undefined, runtime);

    const config = { ...resolveBudgetProfile('interactive'), diagnostics: true };
    const rng = createRng(42n);
    const observation = derivePlayerObservation(def, state, playerId);
    const root = createRootNode(state.playerCount);
    const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
    const pool = createNodePool(poolCapacity, state.playerCount);
    const [searchRng] = fork(rng);

    runSearch(
      root, def, state, observation, playerId,
      config, searchRng, moves, runtime, pool,
    );

    const bestChild = selectRootDecision(root, playerId);
    const selectedMove = bestChild.move as Move;

    assert.ok(selectedMove !== undefined, 'should select a move');
    assert.notEqual(
      String(selectedMove.actionId), 'pass',
      'should select a non-pass move (game has no pass action)',
    );
  });

  it('search works with lazy classification policy', () => {
    const def = createSimpleMctsGameDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const playerId = state.activePlayer as PlayerId;
    const moves = legalMoves(def, state, undefined, runtime);

    const config = {
      ...resolveBudgetProfile('interactive'),
      classificationPolicy: 'lazy' as const,
      diagnostics: true,
    };
    const rng = createRng(42n);
    const observation = derivePlayerObservation(def, state, playerId);
    const root = createRootNode(state.playerCount);
    const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
    const pool = createNodePool(poolCapacity, state.playerCount);
    const [searchRng] = fork(rng);

    const result = runSearch(
      root, def, state, observation, playerId,
      config, searchRng, moves, runtime, pool,
    );

    assert.ok(result.iterations > 0, 'lazy search should complete iterations');
  });
});

// ---------------------------------------------------------------------------
// Full game simulation tests
// ---------------------------------------------------------------------------

describe('simple game MCTS — full game simulation', () => {
  it('MCTS agent completes a full game without errors', () => {
    const def = createSimpleMctsGameDef();
    const agents = [
      new MctsAgent(resolveBudgetProfile('interactive')),
      new MctsAgent(resolveBudgetProfile('interactive')),
    ];

    const trace = runGame(def, 42, agents, 100, 2);

    assert.ok(trace.moves.length > 0, 'game should produce moves');
    assert.ok(
      trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns',
      `unexpected stop reason: ${trace.stopReason}`,
    );
  });

  it('game reaches terminal condition', () => {
    const def = createSimpleMctsGameDef();
    const agents = [
      new MctsAgent(resolveBudgetProfile('interactive')),
      new MctsAgent(resolveBudgetProfile('interactive')),
    ];

    // With simple VP-gaining actions and a 10 VP threshold, the game
    // should terminate within 100 turns.
    const trace = runGame(def, 42, agents, 100, 2);

    assert.equal(
      trace.stopReason, 'terminal',
      'game should reach terminal condition within 100 turns',
    );
  });
});
