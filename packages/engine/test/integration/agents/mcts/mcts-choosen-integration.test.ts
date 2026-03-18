/**
 * Integration tests for chooseN MCTS decision expansion.
 *
 * These tests verify the full MCTS pipeline end-to-end:
 * MctsAgent.chooseMove() → decision expansion → search →
 * postCompleteSelectedMove → applyMove → kernel validation.
 *
 * All fixtures are game-agnostic (no FITL/Texas Hold'em logic).
 * Low iteration counts (50–100) for speed — correctness tests, not quality.
 */

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
import { assertValidatedGameDef } from '../../../../src/kernel/validate-gamedef.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import { applyMove } from '../../../../src/kernel/apply-move.js';
import { legalChoicesEvaluate } from '../../../../src/kernel/legal-choices.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * 2-player game with a chooseN action: pick 1–2 targets from integers 1–3.
 * After choosing, the actor gains 1 VP. First to 5 VP wins.
 * Also has an idle action as fallback.
 */
function createChooseNGameDef(): GameDef {
  return {
    metadata: { id: 'test-chooseN', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('selectTargets'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$targets',
              bind: '$targets',
              options: { query: 'intsInRange', min: 1, max: 3 },
              min: 1,
              max: 2,
            },
          },
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('idle'),
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
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/**
 * Same as createChooseNGameDef but with min: 0, allowing empty selection [].
 */
function createChooseNMinZeroGameDef(): GameDef {
  const base = createChooseNGameDef();
  const actions = base.actions.map((a: { id: string; effects: readonly Record<string, unknown>[] }) => {
    if (a.id === asActionId('selectTargets')) {
      return {
        ...a,
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$targets',
              bind: '$targets',
              options: { query: 'intsInRange', min: 1, max: 3 },
              min: 0,
              max: 2,
            },
          },
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
      };
    }
    return a;
  });
  return { ...base, actions } as unknown as GameDef;
}

/**
 * Game def with a chooseOne followed by a chooseN in the same action.
 * chooseOne: pick a mode (1 or 2). chooseN: pick 1–2 targets from 1–3.
 */
function createMixedDecisionGameDef(): GameDef {
  return {
    metadata: { id: 'test-mixed-decisions', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('mixedAction'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$mode',
              bind: '$mode',
              options: { query: 'intsInRange', min: 1, max: 2 },
            },
          },
          {
            chooseN: {
              internalDecisionId: 'decision:$targets',
              bind: '$targets',
              options: { query: 'intsInRange', min: 1, max: 3 },
              min: 1,
              max: 2,
            },
          },
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('idle'),
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
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/**
 * Simple VP race with chooseOne only (no chooseN). Used for regression testing.
 * The action picks one of two strategies (1 or 2), then adds 1 VP.
 */
function createChooseOneOnlyGameDef(): GameDef {
  return {
    metadata: { id: 'test-chooseOne-only', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('pickStrategy'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$strategy',
              bind: '$strategy',
              options: { query: 'intsInRange', min: 1, max: 2 },
            },
          },
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('idle'),
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
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 5,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 2;
const MCTS_CONFIG = { iterations: 100, minIterations: 0 };

/** Returns true if any value in move.params is an array. */
function hasArrayParam(move: { readonly params: Readonly<Record<string, unknown>> }): boolean {
  return Object.values(move.params).some((v) => Array.isArray(v));
}

/** Returns true if any value in move.params is a non-array scalar. */
function hasScalarParam(move: { readonly params: Readonly<Record<string, unknown>> }): boolean {
  return Object.values(move.params).some((v) => !Array.isArray(v) && v !== undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MctsAgent chooseN integration', () => {
  // -------------------------------------------------------------------------
  // 1. End-to-end chooseN via MctsAgent
  // -------------------------------------------------------------------------
  describe('E2E chooseN via MctsAgent', () => {
    it('returned move has array param and applyMove succeeds', () => {
      const def = createChooseNGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      assert.ok(moves.length > 0, 'must have legal moves');

      const agent = new MctsAgent(MCTS_CONFIG);
      const rng = createRng(100n);

      const result = agent.chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      // If agent chose selectTargets (not idle), params should have an array.
      if (result.move.actionId === asActionId('selectTargets')) {
        assert.ok(
          hasArrayParam(result.move),
          `chooseN move should have at least one array param, got: ${JSON.stringify(result.move.params)}`,
        );

        // Verify the array param contains valid selections.
        const arrayParams = Object.entries(result.move.params).filter(([, v]) => Array.isArray(v));
        for (const [key, value] of arrayParams) {
          const arr = value as unknown[];
          assert.ok(arr.length >= 1 && arr.length <= 2, `${key}: array length should be 1-2, got ${arr.length}`);
        }
      }

      // applyMove must succeed without validation error.
      assert.doesNotThrow(
        () => applyMove(validated, state, result.move, undefined, runtime),
        `applyMove should succeed for MCTS-produced move: ${JSON.stringify(result.move)}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. End-to-end chooseN with min:0
  // -------------------------------------------------------------------------
  describe('E2E chooseN with min:0', () => {
    it('MCTS returns a valid move (array param may be empty)', () => {
      const def = createChooseNMinZeroGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      assert.ok(moves.length > 0, 'must have legal moves');

      const agent = new MctsAgent(MCTS_CONFIG);
      const rng = createRng(200n);

      const result = agent.chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      if (result.move.actionId === asActionId('selectTargets')) {
        // With min:0, the array param could be empty [] or contain items.
        assert.ok(
          hasArrayParam(result.move),
          `chooseN min:0 move should have array param, got: ${JSON.stringify(result.move.params)}`,
        );

        const arrayParams = Object.entries(result.move.params).filter(([, v]) => Array.isArray(v));
        for (const [key, value] of arrayParams) {
          const arr = value as unknown[];
          assert.ok(arr.length >= 0 && arr.length <= 2, `${key}: array length should be 0-2, got ${arr.length}`);
        }
      }

      // applyMove must succeed.
      assert.doesNotThrow(
        () => applyMove(validated, state, result.move, undefined, runtime),
        `applyMove should succeed for min:0 move: ${JSON.stringify(result.move)}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Mixed decisions (chooseOne + chooseN)
  // -------------------------------------------------------------------------
  describe('Mixed decisions', () => {
    it('chooseOne binding is scalar and chooseN binding is array', () => {
      const def = createMixedDecisionGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      assert.ok(moves.length > 0, 'must have legal moves');

      const agent = new MctsAgent(MCTS_CONFIG);
      const rng = createRng(300n);

      const result = agent.chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      if (result.move.actionId === asActionId('mixedAction')) {
        // Must have both scalar and array params.
        assert.ok(
          hasScalarParam(result.move),
          `mixed move should have scalar param (chooseOne), got: ${JSON.stringify(result.move.params)}`,
        );
        assert.ok(
          hasArrayParam(result.move),
          `mixed move should have array param (chooseN), got: ${JSON.stringify(result.move.params)}`,
        );
      }

      // applyMove must succeed.
      assert.doesNotThrow(
        () => applyMove(validated, state, result.move, undefined, runtime),
        `applyMove should succeed for mixed move: ${JSON.stringify(result.move)}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Post-completion correctness
  // -------------------------------------------------------------------------
  describe('Post-completion correctness', () => {
    it('postCompleteSelectedMove produces a move that passes legalChoicesEvaluate', () => {
      const def = createChooseNGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const agent = new MctsAgent(MCTS_CONFIG);
      const rng = createRng(400n);

      const result = agent.chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      // legalChoicesEvaluate should return 'complete', not 'pending' or 'illegal'.
      const choiceResult = legalChoicesEvaluate(validated, state, result.move, undefined, runtime);
      assert.ok(
        choiceResult.kind !== 'pending' && choiceResult.kind !== 'illegal',
        `move should be fully resolved, got kind: ${choiceResult.kind}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Determinism
  // -------------------------------------------------------------------------
  describe('Determinism', () => {
    it('same seed + same game state produces identical chooseN move selection', () => {
      const def = createChooseNGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const config = { iterations: 50, minIterations: 0 };
      const seed = 500n;

      const result1 = new MctsAgent(config).chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(seed),
        runtime,
      });

      const result2 = new MctsAgent(config).chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(seed),
        runtime,
      });

      assert.deepStrictEqual(
        result1.move,
        result2.move,
        'same seed should produce identical moves',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. chooseOne regression
  // -------------------------------------------------------------------------
  describe('chooseOne regression', () => {
    it('chooseOne-only game produces scalar params, no regressions', () => {
      const def = createChooseOneOnlyGameDef();
      const validated = assertValidatedGameDef(def);
      const playerCount = PLAYER_COUNT;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      assert.ok(moves.length > 0, 'must have legal moves');

      const agent = new MctsAgent(MCTS_CONFIG);
      const rng = createRng(600n);

      const result = agent.chooseMove({
        def: validated,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng,
        runtime,
      });

      if (result.move.actionId === asActionId('pickStrategy')) {
        // chooseOne params must be scalar, never arrays.
        for (const [key, value] of Object.entries(result.move.params)) {
          assert.ok(
            !Array.isArray(value),
            `chooseOne param ${key} should be scalar, got array: ${JSON.stringify(value)}`,
          );
        }

        // The $strategy binding should be a number (1 or 2).
        assert.ok(
          hasScalarParam(result.move),
          `chooseOne move should have at least one scalar param, got: ${JSON.stringify(result.move.params)}`,
        );
      }

      // applyMove must succeed.
      assert.doesNotThrow(
        () => applyMove(validated, state, result.move, undefined, runtime),
        `applyMove should succeed for chooseOne-only move: ${JSON.stringify(result.move)}`,
      );
    });
  });
});
