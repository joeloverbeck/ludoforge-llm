import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MctsAgent } from '../../../../src/agents/mcts/mcts-agent.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import type { MctsSearchEvent } from '../../../../src/agents/mcts/visitor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 2-player game with two actions: "win" (sets ended=1) and "noop".
 */
function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'pool-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Pool capacity formula tests
// ---------------------------------------------------------------------------

describe('MctsAgent pool sizing', () => {
  it('uses formula max(iterations * multiplier + 1, moves * 4) with default multiplier 4', () => {
    const events: MctsSearchEvent[] = [];
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    const agent = new MctsAgent({
      iterations: 50,
      minIterations: 0,
      visitor: {
        onEvent(event) { events.push(event); },
      },
    });

    agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(42n),
      runtime,
    });

    // Default multiplier is 4. Formula: max(50 * 4 + 1, 2 * 4) = max(201, 8) = 201
    const searchStart = events.find((e) => e.type === 'searchStart');
    assert.ok(searchStart, 'searchStart event should be emitted');
    assert.equal(
      (searchStart as { poolCapacity: number }).poolCapacity,
      201,
      'pool capacity should be max(50 * 4 + 1, 2 * 4) = 201',
    );
  });

  it('uses custom decisionDepthMultiplier value', () => {
    const events: MctsSearchEvent[] = [];
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    const agent = new MctsAgent({
      iterations: 50,
      minIterations: 0,
      decisionDepthMultiplier: 2,
      visitor: {
        onEvent(event) { events.push(event); },
      },
    });

    agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(42n),
      runtime,
    });

    // Multiplier 2. Formula: max(50 * 2 + 1, 2 * 4) = max(101, 8) = 101
    const searchStart = events.find((e) => e.type === 'searchStart');
    assert.ok(searchStart, 'searchStart event should be emitted');
    assert.equal(
      (searchStart as { poolCapacity: number }).poolCapacity,
      101,
      'pool capacity should be max(50 * 2 + 1, 2 * 4) = 101',
    );
  });

  it('pool capacity floor is legalMoves.length * 4', () => {
    const events: MctsSearchEvent[] = [];
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    // With iterations=1, multiplier=1: max(1*1+1, 2*4) = max(2, 8) = 8
    const agent = new MctsAgent({
      iterations: 1,
      minIterations: 0,
      decisionDepthMultiplier: 1,
      visitor: {
        onEvent(event) { events.push(event); },
      },
    });

    agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(42n),
      runtime,
    });

    const searchStart = events.find((e) => e.type === 'searchStart');
    assert.ok(searchStart, 'searchStart event should be emitted');
    assert.equal(
      (searchStart as { poolCapacity: number }).poolCapacity,
      8,
      'pool capacity should be max(1*1+1, 2*4) = 8 (floor wins)',
    );
  });
});

// ---------------------------------------------------------------------------
// Pool exhaustion tests
// ---------------------------------------------------------------------------

describe('MctsAgent pool exhaustion', () => {
  it('does NOT abort search — remaining iterations continue after exhaustion', () => {
    const events: MctsSearchEvent[] = [];
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    // Use a very small pool (multiplier=1, iterations=20) to provoke exhaustion.
    // Pool = max(20*1+1, 2*4) = max(21, 8) = 21
    const agent = new MctsAgent({
      iterations: 20,
      minIterations: 0,
      decisionDepthMultiplier: 1,
      visitor: {
        onEvent(event) { events.push(event); },
      },
    });

    // Should not throw — search degrades gracefully.
    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(42n),
      runtime,
    });

    // Search should complete and return a valid move.
    const moveActionIds = moves.map((m) => m.actionId);
    assert.ok(
      moveActionIds.includes(result.move.actionId),
      'search should return a valid move even after pool exhaustion',
    );

    // Verify search completed with all iterations.
    const searchComplete = events.find((e) => e.type === 'searchComplete');
    assert.ok(searchComplete, 'searchComplete event should be emitted');
    assert.equal(
      (searchComplete as { iterations: number }).iterations,
      20,
      'all 20 iterations should complete (no abort)',
    );
  });

  it('search results are valid even after pool exhaustion', () => {
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    // Tiny pool to force exhaustion.
    const agent = new MctsAgent({
      iterations: 50,
      minIterations: 0,
      decisionDepthMultiplier: 1,
      visitor: { onEvent() {} },
    });

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(42n),
      runtime,
    });

    // Move must be from the legal moves list.
    const moveActionIds = moves.map((m) => m.actionId);
    assert.ok(
      moveActionIds.includes(result.move.actionId),
      'returned move must be legal',
    );
  });
});
