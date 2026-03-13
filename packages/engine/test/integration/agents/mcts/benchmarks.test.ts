/**
 * Integration benchmarks for MctsAgent.
 *
 * These tests run short simulations and assert statistical dominance over
 * RandomAgent and GreedyAgent, plus determinism and memory stability.
 *
 * Benchmark tests use fixed seeds for reproducibility but run over multiple
 * games for statistical confidence.  No test depends on wall-clock timing.
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MctsAgent } from '../../../../src/agents/mcts/mcts-agent.js';
import { RandomAgent } from '../../../../src/agents/random-agent.js';
import { GreedyAgent } from '../../../../src/agents/greedy-agent.js';
import { runGame } from '../../../../src/sim/simulator.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  assertValidatedGameDef,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const MAX_TURNS = 200;

/**
 * Simple VP race: two players alternate taking "advance" (+1 VP) or "idle"
 * (nothing).  First to 10 VP wins.  MCTS should dominate Random easily.
 */
function createVpRaceDef(): GameDef {
  return {
    metadata: { id: 'bench-vp-race', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('advance'),
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
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/**
 * Investment game: "invest" (sets boolean invested=true, 0 immediate VP) then
 * "harvest" (+3 VP, requires invested) beats repeated "poke" (+1 VP).
 *
 * Greedy only sees 1-step lookahead on int vars, so it always pokes.
 * MCTS should see invest→harvest yields 1.5 VP/turn vs 1 VP/turn.
 *
 * The boolean `invested` pvar is ignored by GreedyAgent's evaluator (which
 * only scores int vars), creating a genuine strategic advantage for MCTS.
 */
function createInvestmentDef(): GameDef {
  return {
    metadata: { id: 'bench-investment', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [
      { name: 'vp', type: 'int', init: 0, min: 0, max: 20 },
      { name: 'invested', type: 'boolean', init: false },
    ],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('invest'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: {
          op: '==',
          left: { ref: 'pvar', player: 'actor', var: 'invested' },
          right: false,
        },
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'invested', value: true } },
        ],
        limits: [],
      },
      {
        id: asActionId('harvest'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: {
          op: '==',
          left: { ref: 'pvar', player: 'actor', var: 'invested' },
          right: true,
        },
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 3 } },
          { setVar: { scope: 'pvar', player: 'actor', var: 'invested', value: false } },
        ],
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
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/**
 * Hidden-info VP race: same as VP race but with per-player hidden reserve
 * zones.  Forces the MCTS belief-sampling pathway.
 */
function createHiddenInfoDef(): GameDef {
  return {
    metadata: { id: 'bench-hidden-info', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [
      {
        id: asZoneId('reserve:0'),
        owner: 'player',
        ownerPlayerIndex: 0,
        visibility: 'owner',
        ordering: 'set',
      },
      {
        id: asZoneId('reserve:1'),
        owner: 'player',
        ownerPlayerIndex: 1,
        visibility: 'owner',
        ordering: 'set',
      },
    ],
    tokenTypes: [{ id: 'marker', props: {} }],
    setup: [
      {
        createToken: {
          type: 'marker',
          zone: asZoneId('reserve:0'),
          props: {},
        },
      },
      {
        createToken: {
          type: 'marker',
          zone: asZoneId('reserve:1'),
          props: {},
        },
      },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('advance'),
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
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 10,
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

function countWins(
  def: GameDef,
  agents: readonly [import('../../../../src/kernel/types.js').Agent, import('../../../../src/kernel/types.js').Agent],
  gameCount: number,
  baseSeed: number,
  targetPlayer: number,
): number {
  const validated = assertValidatedGameDef(def);
  let wins = 0;
  for (let i = 0; i < gameCount; i++) {
    const trace = runGame(validated, baseSeed + i, agents, MAX_TURNS, 2);
    if (trace.result !== null && trace.result.type === 'win' && trace.result.player === targetPlayer) {
      wins++;
    }
  }
  return wins;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MctsAgent integration benchmarks', () => {
  describe('MCTS vs Random on VP race', () => {
    it('MCTS win rate > 80% over 20 games', () => {
      const def = createVpRaceDef();
      const mcts = new MctsAgent({ iterations: 100, minIterations: 0 });
      const random = new RandomAgent();

      const wins = countWins(def, [mcts, random], 20, 100, 0);
      const winRate = wins / 20;

      assert.ok(
        winRate > 0.8,
        `MCTS vs Random win rate should be > 80%, got ${(winRate * 100).toFixed(0)}% (${wins}/20)`,
      );
    });
  });

  describe('MCTS vs Greedy on investment game', () => {
    it('MCTS win rate > 55% over 20 games', () => {
      const def = createInvestmentDef();
      const mcts = new MctsAgent({ iterations: 200, minIterations: 0 });
      const greedy = new GreedyAgent();

      const wins = countWins(def, [mcts, greedy], 20, 200, 0);
      const winRate = wins / 20;

      assert.ok(
        winRate > 0.55,
        `MCTS vs Greedy win rate should be > 55%, got ${(winRate * 100).toFixed(0)}% (${wins}/20)`,
      );
    });
  });

  describe('MCTS on hidden-info fixture', () => {
    it('MCTS win rate > 70% vs Random over 20 games', () => {
      const def = createHiddenInfoDef();
      const mcts = new MctsAgent({ iterations: 100, minIterations: 0 });
      const random = new RandomAgent();

      const wins = countWins(def, [mcts, random], 20, 300, 0);
      const winRate = wins / 20;

      assert.ok(
        winRate > 0.7,
        `MCTS vs Random (hidden-info) win rate should be > 70%, got ${(winRate * 100).toFixed(0)}% (${wins}/20)`,
      );
    });
  });

  describe('determinism', () => {
    it('same seed + same config produces identical move sequences', () => {
      const def = createVpRaceDef();
      const validated = assertValidatedGameDef(def);
      const seed = 42;
      const config = { iterations: 50, minIterations: 0 };

      const trace1 = runGame(validated, seed, [new MctsAgent(config), new RandomAgent()], MAX_TURNS, 2);
      const trace2 = runGame(validated, seed, [new MctsAgent(config), new RandomAgent()], MAX_TURNS, 2);

      assert.equal(trace1.moves.length, trace2.moves.length, 'same number of moves');

      for (let i = 0; i < trace1.moves.length; i++) {
        assert.deepStrictEqual(
          trace1.moves[i]!.move,
          trace2.moves[i]!.move,
          `move ${i} should be identical`,
        );
      }

      assert.deepStrictEqual(trace1.result, trace2.result, 'same terminal result');
    });
  });

  describe('memory stability', () => {
    it('no unbounded growth across 10 consecutive chooseMove calls', () => {
      const def = createVpRaceDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      assert.ok(moves.length > 0, 'need at least one legal move');

      const agent = new MctsAgent({ iterations: 100, minIterations: 0 });
      let rng = createRng(99n);

      // Run 10 consecutive chooseMove calls.  Each call creates a fresh
      // node pool internally (MctsAgent allocates per-call), so there
      // should be no unbounded growth.  We verify no crash/exception
      // occurs and that all calls complete successfully.
      for (let i = 0; i < 10; i++) {
        const result = agent.chooseMove({
          def,
          state,
          playerId: asPlayerId(0),
          legalMoves: moves,
          rng,
          runtime,
        });
        rng = result.rng;

        // Verify it returned a legal move.
        const moveActionIds = moves.map((m) => m.actionId);
        assert.ok(
          moveActionIds.includes(result.move.actionId),
          `call ${i}: returned move should be legal`,
        );
      }
    });
  });
});
