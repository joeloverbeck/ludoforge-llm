import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GreedyAgent } from '../../../src/agents/greedy-agent.js';
import {
  createTemplateChooseNDuplicatesAction,
  createTemplateChooseNDuplicatesProfile,
  createTemplateChooseOneAction,
  createTemplateChooseOneProfile,
} from '../../helpers/agent-template-fixtures.js';
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
  type GameState,
  type Move,
  type ActionPipelineDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const createAction = (id: string, effects: ActionDef['effects']): ActionDef => ({
  id: asActionId(id),
actor: 'active',
executor: 'actor',
phase: [phaseId],
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
  turnStructure: { phases: [{ id: phaseId }] },
  actions,
  triggers: [],
  terminal: { conditions: endConditions },
});

const choose = (def: GameDef, seed = 5n) => {
  const state = initialState(def, Number(seed), 2).state;
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

// --- Template move fixtures ---

const stateStub: GameState = {
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
};

const createDefWithProfile = (
  actions: readonly ActionDef[],
  profiles: readonly ActionPipelineDef[],
): GameDef => ({
  metadata: { id: 'agents-greedy-template', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [
    { name: 'vp', type: 'int', init: 0, min: 0, max: 20 },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions,
  triggers: [],
  terminal: { conditions: [] },
  actionPipelines: profiles,
});

describe('GreedyAgent core', () => {
  it('rejects non-positive maxMovesToEvaluate config', () => {
    assert.throws(
      () => new GreedyAgent({ maxMovesToEvaluate: 0 }),
      /GreedyAgent maxMovesToEvaluate must be a positive safe integer/,
    );
  });

  it('rejects invalid completionsPerTemplate config', () => {
    const invalidValues = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];
    for (const value of invalidValues) {
      assert.throws(
        () => new GreedyAgent({ completionsPerTemplate: value }),
        /GreedyAgent completionsPerTemplate must be a positive safe integer/,
      );
    }
  });

  it('accepts valid completionsPerTemplate boundary values', () => {
    assert.doesNotThrow(() => new GreedyAgent({ completionsPerTemplate: 1 }));
    assert.doesNotThrow(() => new GreedyAgent({ completionsPerTemplate: Number.MAX_SAFE_INTEGER }));
  });

  it('throws descriptive error when legalMoves is empty', () => {
    const def = createDef([]);
    const state = initialState(def, 1, 2).state;
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
    const state = initialState(def, 6, 2).state;
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
    const state = initialState(def, 14, 2).state;
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
    const state = initialState(def, 6, 2).state;
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

  // --- Template move tests ---

  it('can play operations via template moves', () => {
    const action = createTemplateChooseOneAction(asActionId('op1'), phaseId);
    const profile = createTemplateChooseOneProfile(asActionId('op1'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op1'), params: {} };
    const agent = new GreedyAgent();
    const result = agent.chooseMove({
      def,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [templateMove],
      rng: createRng(42n),
    });

    assert.equal(result.move.actionId, asActionId('op1'));
    assert.ok('decision:$target' in result.move.params, 'should have decision:$target param filled');
    const target = result.move.params['decision:$target'];
    assert.ok(
      target === 'alpha' || target === 'beta' || target === 'gamma',
      `selected target "${String(target)}" should be one of the enum options`,
    );
  });

  it('still works with simple (non-template) moves as before', () => {
    const def = createDef([
      createAction('best', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } }]),
      createAction('worse', [{ addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } }]),
    ]);

    const result = choose(def, 10n);
    assert.equal(result.move.actionId, asActionId('best'));
  });

  it('produces deterministic results with same seed for template moves', () => {
    const action = createTemplateChooseOneAction(asActionId('op1'), phaseId);
    const profile = createTemplateChooseOneProfile(asActionId('op1'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op1'), params: {} };
    const agent = new GreedyAgent();

    const makeInput = () => ({
      def,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [templateMove],
      rng: createRng(77n),
    });

    const first = agent.chooseMove(makeInput());
    const second = agent.chooseMove(makeInput());

    assert.deepEqual(first, second);
  });

  it('respects maxMovesToEvaluate cap with template moves', () => {
    const action = createTemplateChooseOneAction(asActionId('op1'), phaseId);
    const profile = createTemplateChooseOneProfile(asActionId('op1'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op1'), params: {} };
    // With completionsPerTemplate=5 we get 5 candidates, cap at 2
    const agent = new GreedyAgent({ maxMovesToEvaluate: 2 });
    const result = agent.chooseMove({
      def,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [templateMove],
      rng: createRng(42n),
    });

    // Should still produce a valid complete move despite cap
    assert.equal(result.move.actionId, asActionId('op1'));
    assert.ok('decision:$target' in result.move.params);
  });

  it('completes chooseN template moves with unique selections when options contain duplicates', () => {
    const action = createTemplateChooseNDuplicatesAction(asActionId('op-choose-n'), phaseId);
    const profile = createTemplateChooseNDuplicatesProfile(asActionId('op-choose-n'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op-choose-n'), params: {} };
    const agent = new GreedyAgent({ completionsPerTemplate: 1 });
    const result = agent.chooseMove({
      def,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [templateMove],
      rng: createRng(42n),
    });

    const selected = result.move.params['decision:$targets'];
    assert.ok(Array.isArray(selected), 'expected chooseN param to be an array');
    assert.equal(selected.length, 2);
    assert.equal(new Set(selected).size, 2);
    assert.equal(selected.includes('alpha'), true);
    assert.equal(selected.includes('beta'), true);
  });
});
