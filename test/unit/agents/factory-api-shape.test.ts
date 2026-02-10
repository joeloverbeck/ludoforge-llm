import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, GreedyAgent, parseAgentSpec, RandomAgent } from '../../../src/agents/index.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const defStub: GameDef = {
  metadata: { id: 'agents-factory', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
};

const stateStub: GameState = {
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
};

const moveStub: Move = { actionId: asActionId('only'), params: {} };

describe('agents factory API shape', () => {
  it("createAgent('random') returns an object with chooseMove", () => {
    const agent = createAgent('random');
    assert.equal(typeof agent.chooseMove, 'function');
  });

  it("createAgent('random') chooseMove returns the only legal move", () => {
    const agent = createAgent('random');
    const result = agent.chooseMove({
      def: defStub,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [moveStub],
      rng: createRng(1n),
    });
    assert.deepEqual(result.move, moveStub);
  });

  it("createAgent('greedy') returns an object with chooseMove", () => {
    const agent = createAgent('greedy');
    assert.equal(typeof agent.chooseMove, 'function');
  });

  it("createAgent('greedy') chooseMove works for a simple legal move", () => {
    const def: GameDef = {
      ...defStub,
      actions: [
        {
          id: asActionId('only'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };
    const state = initialState(def, 1, 2);
    const moves = legalMoves(def, state);
    const agent = createAgent('greedy');
    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(1n),
    });
    assert.deepEqual(result.move, moves[0]);
  });

  it("createAgent('unknown' as never) throws Unknown agent type", () => {
    assert.throws(() => createAgent('unknown' as never), /Unknown agent type: unknown/);
  });

  it('parseAgentSpec export exists and validates count mismatch', () => {
    assert.equal(typeof parseAgentSpec, 'function');
    assert.throws(() => parseAgentSpec('random', 2), /Agent spec has 1 agents but game needs 2 players/);
  });

  it('parseAgentSpec creates ordered agents from normalized tokens', () => {
    const agents = parseAgentSpec(' random , GREEDY ', 2);
    assert.equal(agents.length, 2);
    assert.equal(agents[0] instanceof RandomAgent, true);
    assert.equal(agents[1] instanceof GreedyAgent, true);
  });

  it('parseAgentSpec rejects unknown agent names', () => {
    assert.throws(() => parseAgentSpec('random,smart', 2), /Unknown agent type: smart\. Allowed: random, greedy/);
  });

  it('parseAgentSpec ignores empty tokens when remaining count matches', () => {
    const agents = parseAgentSpec('random,,greedy', 2);
    assert.equal(agents.length, 2);
    assert.equal(agents[0] instanceof RandomAgent, true);
    assert.equal(agents[1] instanceof GreedyAgent, true);
  });

  it('parseAgentSpec still enforces count after filtering empty tokens', () => {
    assert.throws(() => parseAgentSpec('random,,greedy', 3), /Agent spec has 2 agents but game needs 3 players/);
  });
});
