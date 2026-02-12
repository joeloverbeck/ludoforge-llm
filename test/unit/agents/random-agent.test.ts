import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../../src/agents/random-agent.js';
import { asActionId, asPhaseId, asPlayerId, createRng, nextInt, type GameDef, type GameState, type Move } from '../../../src/kernel/index.js';

const defStub: GameDef = {
  metadata: { id: 'agents-random', players: { min: 2, max: 2 } },
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
  markers: {},
};

const createMoves = (count: number): readonly Move[] =>
  Array.from({ length: count }, (_, index) => ({
    actionId: asActionId(`m${index}`),
    params: {},
  }));

const createInput = (legalMoves: readonly Move[], rngSeed = 42n) => ({
  def: defStub,
  state: stateStub,
  playerId: asPlayerId(0),
  legalMoves,
  rng: createRng(rngSeed),
});

describe('RandomAgent', () => {
  it('throws descriptive error when legalMoves is empty', () => {
    const agent = new RandomAgent();
    assert.throws(
      () => agent.chooseMove(createInput([])),
      /RandomAgent\.chooseMove called with empty legalMoves/,
    );
  });

  it('returns the single legal move and leaves rng unchanged', () => {
    const agent = new RandomAgent();
    const move = createMoves(1)[0] as Move;
    const input = createInput([move], 19n);
    const result = agent.chooseMove(input);

    assert.deepEqual(result.move, move);
    assert.equal(result.rng, input.rng);
  });

  it('with known seed and 5 legal moves selects expected index and advances rng once', () => {
    const agent = new RandomAgent();
    const legalMoves = createMoves(5);
    const input = createInput(legalMoves, 42n);
    const [expectedIndex, expectedRng] = nextInt(input.rng, 0, legalMoves.length - 1);
    const result = agent.chooseMove(input);

    assert.deepEqual(result.move, legalMoves[expectedIndex]);
    assert.deepEqual(result.rng, expectedRng);
  });

  it('with known seed and 2 legal moves is deterministic', () => {
    const agent = new RandomAgent();
    const legalMoves = createMoves(2);
    const first = agent.chooseMove(createInput(legalMoves, 7n));
    const second = agent.chooseMove(createInput(legalMoves, 7n));

    assert.deepEqual(first, second);
  });

  it('same input state plus same rng returns identical move and rng', () => {
    const agent = new RandomAgent();
    const legalMoves = createMoves(4);
    const first = agent.chooseMove(createInput(legalMoves, 99n));
    const second = agent.chooseMove(createInput(legalMoves, 99n));

    assert.deepEqual(first, second);
  });

  it('over 100 draws on 3 legal moves each move is selected at least once', () => {
    const agent = new RandomAgent();
    const legalMoves = createMoves(3);
    const seen = new Set<string>();
    let rng = createRng(123n);

    for (let i = 0; i < 100; i += 1) {
      const result = agent.chooseMove({
        def: defStub,
        state: stateStub,
        playerId: asPlayerId(0),
        legalMoves,
        rng,
      });
      seen.add(result.move.actionId);
      rng = result.rng;
    }

    assert.equal(seen.size, 3);
  });
});
