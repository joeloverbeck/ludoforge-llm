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
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 2-player perfect-info game with two actions: "win" (sets ended=1) and "noop".
 */
function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'mcts-agent-test', players: { min: 2, max: 2 } },
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

/**
 * Single-action game: only "noop" is legal.
 */
function createSingleActionDef(): GameDef {
  return {
    metadata: { id: 'mcts-agent-single', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
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
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonSerialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MctsAgent', () => {
  describe('single-move short-circuit', () => {
    it('returns the only legal move immediately without consuming RNG', () => {
      const def = createSingleActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      assert.equal(moves.length, 1, 'fixture should have exactly 1 legal move');

      const rng = createRng(123n);
      const agent = new MctsAgent({ iterations: 100 });

      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      assert.deepStrictEqual(result.move, moves[0]);
      // RNG should be returned unchanged (no fork consumed).
      assert.equal(result.rng, rng);
    });
  });

  describe('chooseMove with multiple moves', () => {
    it('returns a move from the legal moves list', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      assert.ok(moves.length > 1, 'fixture should have multiple legal moves');

      const rng = createRng(42n);
      const agent = new MctsAgent({ iterations: 20, minIterations: 0 });

      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(
        moveActionIds.includes(result.move.actionId),
        `returned move ${result.move.actionId} should be one of ${moveActionIds.join(', ')}`,
      );
    });
  });

  describe('RNG isolation', () => {
    it('returned rng is independent of iteration count', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const rng10 = createRng(42n);
      const agent10 = new MctsAgent({ iterations: 10, minIterations: 0 });
      const result10 = agent10.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: rng10,
        runtime,
      });

      const rng100 = createRng(42n);
      const agent100 = new MctsAgent({ iterations: 100, minIterations: 0 });
      const result100 = agent100.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: rng100,
        runtime,
      });

      // Both should return the same next-agent RNG since fork is deterministic
      // from the same input RNG — the search RNG is a separate branch.
      assert.deepStrictEqual(result10.rng, result100.rng);
    });
  });

  describe('determinism', () => {
    it('same input + same RNG + same config → same chosen move', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const config = { iterations: 30, minIterations: 0 };

      const rng1 = createRng(99n);
      const agent1 = new MctsAgent(config);
      const result1 = agent1.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: rng1,
        runtime,
      });

      const rng2 = createRng(99n);
      const agent2 = new MctsAgent(config);
      const result2 = agent2.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: rng2,
        runtime,
      });

      assert.deepStrictEqual(result1.move, result2.move);
      assert.deepStrictEqual(result1.rng, result2.rng);
    });
  });

  describe('input immutability', () => {
    it('input GameState is not mutated after chooseMove', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const stateBefore = jsonSerialize(state);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const rng = createRng(42n);
      const agent = new MctsAgent({ iterations: 15, minIterations: 0 });

      agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      const stateAfter = jsonSerialize(state);
      assert.equal(stateAfter, stateBefore, 'input state was mutated');
    });
  });

  describe('runtime reuse', () => {
    it('uses provided runtime instead of building a new one', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const rng = createRng(42n);
      const agent = new MctsAgent({ iterations: 5, minIterations: 0 });

      // If runtime is provided, it should not throw and should work correctly.
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(moveActionIds.includes(result.move.actionId));
    });

    it('works without provided runtime (builds internally)', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const rng = createRng(42n);
      const agent = new MctsAgent({ iterations: 5, minIterations: 0 });

      // Omit runtime — agent should build one internally.
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
      });

      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(moveActionIds.includes(result.move.actionId));
    });
  });

  describe('empty legalMoves', () => {
    it('throws when called with no legal moves', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);

      const rng = createRng(42n);
      const agent = new MctsAgent();

      assert.throws(
        () =>
          agent.chooseMove({
            def,
            state,
            playerId: asPlayerId(0),
            legalMoves: [] as unknown as readonly Move[],
            rng,
          }),
        /empty legalMoves/,
      );
    });
  });
});
