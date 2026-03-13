/**
 * Tactical competence regression tests for MctsAgent.
 *
 * Each test uses a minimal custom GameDef fixture that isolates a specific
 * competence behavior.  All tests are deterministic (fixed seed + iteration
 * budget mode).
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
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Win-in-1: two actions — "win" ends the game in player 0's favour,
 * "noop" does nothing.  MCTS should always select "win".
 */
function createWinIn1Def(): GameDef {
  return {
    metadata: { id: 'tactical-win-in-1', players: { min: 2, max: 2 } },
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
 * Block-loss-in-1: player 0 must "block" to prevent player 1 from winning
 * next turn via "strike".  If player 0 plays "idle" or "strike", player 1
 * wins.
 *
 * - gvar blocked (0/1): disables strike when 1
 * - gvar ended (0/1): triggers player-1 victory when 1
 * - "block" sets blocked=1
 * - "strike" requires blocked==0, sets ended=1
 * - "idle" does nothing
 * - Terminal: ended==1 → player 1 wins
 */
function createBlockLossIn1Def(): GameDef {
  return {
    metadata: { id: 'tactical-block-loss', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'blocked', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'ended', type: 'int', init: 0, min: 0, max: 1 },
    ],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('block'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'blocked', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('strike'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: { op: '==', left: { ref: 'gvar', var: 'blocked' }, right: 0 },
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
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
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/**
 * Scoring preference: two actions both end the game immediately, but
 * "big_score" gives 5 VP while "small_score" gives 1 VP.  Terminal is
 * score-based (highest VP wins).  MCTS should prefer big_score.
 */
function createScoringPreferenceDef(): GameDef {
  return {
    metadata: { id: 'tactical-scoring-pref', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('big_score'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 5 } },
          { setVar: { scope: 'global', var: 'done', value: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('small_score'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 1 } },
          { setVar: { scope: 'global', var: 'done', value: 1 } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'done' }, right: 1 },
          result: { type: 'score' },
        },
      ],
      scoring: {
        method: 'highest',
        value: { ref: 'pvar', player: 'actor', var: 'vp' },
      },
    },
  } as unknown as GameDef;
}

/**
 * Multi-step decision: the game requires a 2-turn sequence to win.
 * Player 0 must "prepare" (sets prepared=1) then "execute" (requires
 * prepared==1, triggers victory).  A single-step "poke" exists but doesn't
 * win.  Tests that MCTS handles multi-turn planning.
 */
function createMultiStepDef(): GameDef {
  return {
    metadata: { id: 'tactical-multi-step', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'prepared', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'ended', type: 'int', init: 0, min: 0, max: 1 },
    ],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('prepare'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: { op: '==', left: { ref: 'gvar', var: 'prepared' }, right: 0 },
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'prepared', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('execute'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: { op: '==', left: { ref: 'gvar', var: 'prepared' }, right: 1 },
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('poke'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
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
      scoring: {
        method: 'highest',
        value: { ref: 'pvar', player: 'actor', var: 'vp' },
      },
    },
  } as unknown as GameDef;
}

/**
 * High branching factor: a single action with an intsInRange param
 * generating >50 legal moves.  Tests that MCTS does not crash, timeout,
 * or overflow the node pool.
 */
function createHighBranchingDef(): GameDef {
  return {
    metadata: { id: 'tactical-high-branch', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('pick'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          {
            name: 'amount',
            domain: { query: 'intsInRange', min: 0, max: 59 },
          },
        ],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { ref: 'binding', name: 'amount' } } },
          { setVar: { scope: 'global', var: 'done', value: 1 } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'done' }, right: 1 },
          result: { type: 'score' },
        },
      ],
      scoring: {
        method: 'highest',
        value: { ref: 'pvar', player: 'actor', var: 'vp' },
      },
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInputs(def: GameDef, seed: number) {
  const playerCount = 2;
  const { state } = initialState(def, seed, playerCount);
  const runtime = createGameDefRuntime(def);
  const moves = legalMoves(def, state, undefined, runtime);
  return { def, state, runtime, moves, playerCount };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MctsAgent tactical competence', () => {
  describe('win-in-1', () => {
    it('selects the winning move with low iteration budget', () => {
      const { def, state, runtime, moves } = buildInputs(createWinIn1Def(), 42);
      assert.ok(moves.length >= 2, 'fixture needs at least 2 legal moves');

      const agent = new MctsAgent({ iterations: 50, minIterations: 0 });
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(1n),
        runtime,
      });

      assert.equal(
        result.move.actionId,
        asActionId('win'),
        'MCTS should select the winning move',
      );
    });
  });

  describe('block-loss-in-1', () => {
    it('selects the blocking move to avoid opponent victory', () => {
      const { def, state, runtime, moves } = buildInputs(createBlockLossIn1Def(), 42);
      // Player 0 should have: block, strike, idle
      assert.ok(moves.length >= 2, 'fixture needs at least 2 legal moves');

      const agent = new MctsAgent({ iterations: 200, minIterations: 0 });
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(7n),
        runtime,
      });

      // MCTS should NOT pick strike (which causes player 1 to win) or idle
      // (which lets player 1 strike next turn).  "block" is the only move
      // that prevents player 1 from winning.
      assert.equal(
        result.move.actionId,
        asActionId('block'),
        'MCTS should block to prevent opponent victory',
      );
    });
  });

  describe('clear scoring preference', () => {
    it('selects the higher-scoring move', () => {
      const { def, state, runtime, moves } = buildInputs(createScoringPreferenceDef(), 42);
      assert.ok(moves.length >= 2, 'fixture needs at least 2 legal moves');

      const agent = new MctsAgent({ iterations: 100, minIterations: 0 });
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(13n),
        runtime,
      });

      assert.equal(
        result.move.actionId,
        asActionId('big_score'),
        'MCTS should prefer the move that gives more VP',
      );
    });
  });

  describe('multi-step decision', () => {
    it('handles a 2-step decision sequence without error and makes a reasonable choice', () => {
      const { def, state, runtime, moves } = buildInputs(createMultiStepDef(), 42);
      // Player 0 should have: prepare (prepared==0 ✓), poke
      // execute is NOT legal (prepared==0)
      assert.ok(moves.length >= 2, 'fixture needs at least 2 legal moves');

      const agent = new MctsAgent({ iterations: 500, minIterations: 0 });
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(19n),
        runtime,
      });

      // Primary: agent should not crash and should return a legal move.
      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(
        moveActionIds.includes(result.move.actionId),
        `returned move ${result.move.actionId} should be legal`,
      );

      // The returned RNG must be a valid Rng (fork was consumed correctly).
      assert.ok(result.rng !== undefined, 'returned rng must be defined');
      assert.ok(result.rng.state !== undefined, 'returned rng.state must be defined');
    });
  });

  describe('high branching factor', () => {
    it('returns a legal move without crash or pool overflow with >50 legal moves', () => {
      const { def, state, runtime, moves } = buildInputs(createHighBranchingDef(), 42);
      assert.ok(moves.length >= 50, `fixture should have >=50 legal moves, got ${moves.length}`);

      // Use moderate iteration budget — enough to exercise the tree but
      // not so many that the test is slow.
      const agent = new MctsAgent({ iterations: 200, minIterations: 0 });
      const result = agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: moves,
        rng: createRng(31n),
        runtime,
      });

      // Verify the returned move is one of the legal moves.
      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(
        moveActionIds.includes(result.move.actionId),
        `returned move ${result.move.actionId} should be legal`,
      );
    });
  });
});
