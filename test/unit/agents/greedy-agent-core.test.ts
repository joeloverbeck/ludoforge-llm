import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GreedyAgent } from '../../../src/agents/greedy-agent.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  legalMoves,
  nextInt,
  type ActionDef,
  type EndCondition,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const createAction = (id: string, effects: ActionDef['effects']): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  phase: phaseId,
  params: [],
  pre: null,
  cost: [],
  effects,
  limits: [],
});

const createDef = (actions: readonly ActionDef[], endConditions: readonly EndCondition[] = []): GameDef => ({
  metadata: { id: 'agents-greedy-core', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'winNow', type: 'int', init: 0, min: 0, max: 1 },
    { name: 'loseNow', type: 'int', init: 0, min: 0, max: 1 },
  ],
  perPlayerVars: [
    { name: 'vp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'coins', type: 'int', init: 0, min: 0, max: 20 },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }], activePlayerOrder: 'roundRobin' },
  actions,
  triggers: [],
  endConditions,
});

const choose = (def: GameDef, seed = 5n) => {
  const state = initialState(def, Number(seed), 2);
  const moves = legalMoves(def, state);
  const agent = new GreedyAgent();
  return agent.chooseMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    rng: createRng(seed),
  });
};

describe('GreedyAgent core', () => {
  it('rejects non-positive maxMovesToEvaluate config', () => {
    assert.throws(
      () => new GreedyAgent({ maxMovesToEvaluate: 0 }),
      /GreedyAgent maxMovesToEvaluate must be a positive safe integer/,
    );
  });

  it('throws descriptive error when legalMoves is empty', () => {
    const def = createDef([]);
    const state = initialState(def, 1, 2);
    const agent = new GreedyAgent();

    assert.throws(
      () =>
        agent.chooseMove({
          def,
          state,
          playerId: asPlayerId(0),
          legalMoves: [],
          rng: createRng(1n),
        }),
      /GreedyAgent\.chooseMove called with empty legalMoves/,
    );
  });

  it('chooses move with higher immediate VP-like score', () => {
    const def = createDef([
      createAction('low', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
      createAction('high', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } }]),
    ]);

    const result = choose(def, 10n);
    assert.equal(result.move.actionId, asActionId('high'));
  });

  it('prefers immediate winning move over higher-resource nonterminal move', () => {
    const def = createDef(
      [
        createAction('resource', [{ addVar: { scope: 'pvar', player: 'actor', var: 'coins', delta: 10 } }]),
        createAction('win', [{ setVar: { scope: 'global', var: 'winNow', value: 1 } }]),
      ],
      [{ when: { op: '==', left: { ref: 'gvar', var: 'winNow' }, right: 1 }, result: { type: 'win', player: { id: asPlayerId(0) } } }],
    );

    const result = choose(def, 11n);
    assert.equal(result.move.actionId, asActionId('win'));
  });

  it('avoids immediate terminal non-win move when nonterminal alternative exists', () => {
    const def = createDef(
      [
        createAction('lose', [{ setVar: { scope: 'global', var: 'loseNow', value: 1 } }]),
        createAction('safe', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
      ],
      [{ when: { op: '==', left: { ref: 'gvar', var: 'loseNow' }, right: 1 }, result: { type: 'win', player: { id: asPlayerId(1) } } }],
    );

    const result = choose(def, 12n);
    assert.equal(result.move.actionId, asActionId('safe'));
  });

  it('same input plus same rng returns same move and rng when no tie path exists', () => {
    const def = createDef([
      createAction('best', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } }]),
      createAction('worse', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
    ]);
    const state = initialState(def, 6, 2);
    const moves = legalMoves(def, state);
    const agent = new GreedyAgent();
    const first = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(99n),
    });
    const second = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng: createRng(99n),
    });

    assert.deepEqual(first, second);
  });

  it('breaks equal-score ties via nextInt and advances rng exactly once', () => {
    const def = createDef([
      createAction('a', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
      createAction('b', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
    ]);
    const state = initialState(def, 14, 2);
    const moves = legalMoves(def, state);
    const rng = createRng(123n);
    const [expectedIndex, expectedRng] = nextInt(rng, 0, moves.length - 1);
    const agent = new GreedyAgent();
    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng,
    });

    assert.equal(result.move.actionId, moves[expectedIndex]?.actionId);
    assert.deepEqual(result.rng, expectedRng);
  });

  it('does not draw tie-break rng when no tie exists', () => {
    const def = createDef([
      createAction('best', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } }]),
      createAction('worse', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
    ]);
    const state = initialState(def, 6, 2);
    const moves = legalMoves(def, state);
    const rng = createRng(77n);
    const agent = new GreedyAgent();
    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      rng,
    });

    assert.equal(result.move.actionId, asActionId('best'));
    assert.equal(result.rng, rng);
  });
});
