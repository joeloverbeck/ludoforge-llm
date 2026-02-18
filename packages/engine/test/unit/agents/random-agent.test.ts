import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../../src/agents/random-agent.js';
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
  nextInt,
  type ActionDef,
  type GameDef,
  type GameState,
  type Move,
  type ActionPipelineDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const defStub: GameDef = {
  metadata: { id: 'agents-random', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
};

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

// --- Fixtures for template move tests ---

const createEmptyOptionsProfile = (actionId: string): ActionPipelineDef => ({
  id: `profile-${actionId}`,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null, costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
});

const createDefWithProfile = (
  actions: readonly ActionDef[],
  profiles: readonly ActionPipelineDef[],
): GameDef => ({
  ...defStub,
  actions,
  actionPipelines: profiles,
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

  // --- Template move tests ---

  it('can play operations via template moves (fills params via legalChoicesDiscover() loop)', () => {
    const action = createTemplateChooseOneAction(asActionId('op1'), phaseId);
    const profile = createTemplateChooseOneProfile(asActionId('op1'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op1'), params: {} };
    const agent = new RandomAgent();
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
    const agent = new RandomAgent();
    const legalMoves = createMoves(3);
    const first = agent.chooseMove(createInput(legalMoves, 42n));
    const [expectedIndex] = nextInt(createRng(42n), 0, legalMoves.length - 1);

    assert.deepEqual(first.move, legalMoves[expectedIndex]);
  });

  it('produces deterministic results with same seed for template moves', () => {
    const action = createTemplateChooseOneAction(asActionId('op1'), phaseId);
    const profile = createTemplateChooseOneProfile(asActionId('op1'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op1'), params: {} };
    const agent = new RandomAgent();

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

  it('completes chooseN template moves with unique selections when options contain duplicates', () => {
    const action = createTemplateChooseNDuplicatesAction(asActionId('op-choose-n'), phaseId);
    const profile = createTemplateChooseNDuplicatesProfile(asActionId('op-choose-n'));
    const def = createDefWithProfile([action], [profile]);

    const templateMove: Move = { actionId: asActionId('op-choose-n'), params: {} };
    const agent = new RandomAgent();
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

  it('skips unplayable templates (empty options domain)', () => {
    const action = createTemplateChooseOneAction(asActionId('unplayable'), phaseId);
    const emptyProfile = createEmptyOptionsProfile('unplayable');

    // Also add a simple non-template action so there's something to pick
    const simpleAction: ActionDef = {
      id: asActionId('simple'),
actor: 'active',
executor: 'actor',
phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = createDefWithProfile([action, simpleAction], [emptyProfile]);

    const templateMove: Move = { actionId: asActionId('unplayable'), params: {} };
    const simpleMove: Move = { actionId: asActionId('simple'), params: { x: 1 } };
    const agent = new RandomAgent();

    const result = agent.chooseMove({
      def,
      state: stateStub,
      playerId: asPlayerId(0),
      legalMoves: [templateMove, simpleMove],
      rng: createRng(42n),
    });

    // Should have skipped the unplayable template and selected the simple move
    assert.equal(result.move.actionId, asActionId('simple'));
  });
});
