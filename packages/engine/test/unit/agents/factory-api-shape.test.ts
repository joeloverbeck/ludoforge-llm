// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, GreedyAgent, parseAgentDescriptor, parseAgentSpec, PolicyAgent, RandomAgent } from '../../../src/agents/index.js';
import { completeClassifiedMoves } from '../../helpers/classified-move-fixtures.js';
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
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [
    {
      id: asActionId('only'),
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
  terminal: { conditions: [] },
};

const stateStub: GameState = {
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
};

const moveStub: Move = { actionId: asActionId('only'), params: {} };

describe('agents factory API shape', () => {
  it("createAgent({ kind: 'builtin', builtinId: 'random' }) returns an object with chooseDecision", () => {
    const agent = createAgent({ kind: 'builtin', builtinId: 'random' });
    assert.equal(typeof agent.chooseDecision, 'function');
  });

  it("createAgent({ kind: 'builtin', builtinId: 'random' }) chooseDecision returns the only legal move", () => {
    const agent = createAgent({ kind: 'builtin', builtinId: 'random' });
    const result = agent.chooseDecision({
      def: defStub,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: completeClassifiedMoves([moveStub]),
      rng: createRng(1n),
    });
    assert.deepEqual(result.move.move, moveStub);
  });

  it("createAgent({ kind: 'builtin', builtinId: 'greedy' }) returns an object with chooseDecision", () => {
    const agent = createAgent({ kind: 'builtin', builtinId: 'greedy' });
    assert.equal(typeof agent.chooseDecision, 'function');
  });

  it("createAgent({ kind: 'policy' }) returns an object with chooseDecision", () => {
    const agent = createAgent({ kind: 'policy' });
    assert.equal(typeof agent.chooseDecision, 'function');
    assert.equal(agent instanceof PolicyAgent, true);
  });

  it("createAgent({ kind: 'builtin', builtinId: 'greedy' }) chooseDecision works for a simple legal move", () => {
    const def: GameDef = {
      ...defStub,
      actions: [
        {
          id: asActionId('only'),
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
    };
    const state = initialState(def, 1, 2).state;
    const moves = legalMoves(def, state);
    const agent = createAgent({ kind: 'builtin', builtinId: 'greedy' });
    const result = agent.chooseDecision({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: completeClassifiedMoves(moves, state.stateHash),
      rng: createRng(1n),
    });
    assert.deepEqual(result.move.move, moves[0]);
  });

  it("createAgent rejects unknown builtin ids", () => {
    assert.throws(
      () => createAgent({ kind: 'builtin', builtinId: 'unknown' as never }),
      /Unknown builtin agent id: unknown/,
    );
  });

  it('parseAgentSpec export exists and validates count mismatch', () => {
    assert.equal(typeof parseAgentSpec, 'function');
    assert.throws(() => parseAgentSpec('policy', 2), /Agent spec has 1 agents but game needs 2 players/);
  });

  it('parseAgentDescriptor export exists and parses structured text', () => {
    assert.equal(typeof parseAgentDescriptor, 'function');
    assert.deepEqual(parseAgentDescriptor('builtin:random'), { kind: 'builtin', builtinId: 'random' });
  });

  it('parseAgentSpec creates ordered descriptors from normalized tokens', () => {
    const descriptors = parseAgentSpec(' builtin:random , policy:baseline ', 2);
    assert.deepEqual(descriptors, [
      { kind: 'builtin', builtinId: 'random' },
      { kind: 'policy', profileId: 'baseline' },
    ]);
  });

  it('parseAgentSpec rejects unknown agent names', () => {
    assert.throws(
      () => parseAgentSpec('builtin:random,builtin:smart', 2),
      /Unknown builtin agent id: smart\. Allowed: random, greedy/,
    );
  });

  it('parseAgentSpec ignores empty tokens when remaining count matches', () => {
    const descriptors = parseAgentSpec('builtin:random,,builtin:greedy', 2);
    assert.deepEqual(descriptors, [
      { kind: 'builtin', builtinId: 'random' },
      { kind: 'builtin', builtinId: 'greedy' },
    ]);
  });

  it('parseAgentSpec still enforces count after filtering empty tokens', () => {
    assert.throws(
      () => parseAgentSpec('builtin:random,,builtin:greedy', 3),
      /Agent spec has 2 agents but game needs 3 players/,
    );
  });

  it('callers can instantiate parsed descriptors through createAgent', () => {
    const descriptors = parseAgentSpec('builtin:random,builtin:greedy', 2);
    const agents = descriptors.map((descriptor) => createAgent(descriptor));
    assert.equal(agents[0] instanceof RandomAgent, true);
    assert.equal(agents[1] instanceof GreedyAgent, true);
  });
});
