import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  legalMoves,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';

const createGoldenDef = (): GameDef =>
  ({
    metadata: { id: 'game-loop-golden', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('boost'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [{ name: 'amount', domain: { query: 'intsInRange', min: 1, max: 2 } }],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'amount' } } }],
        limits: [],
      },
      {
        id: asActionId('flat'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const fixedScript: readonly Move[] = [
  { actionId: asActionId('boost'), params: { amount: 2 } },
  { actionId: asActionId('flat'), params: {} },
  { actionId: asActionId('boost'), params: { amount: 1 } },
];

describe('game-loop golden outputs', () => {
  it('seed 42 initial legal move order is canonical', () => {
    const def = createGoldenDef();
    const state = initialState(def, 42, 2);

    const moves = legalMoves(def, state);
    const canonical = moves.map((move) => ({ actionId: move.actionId, params: move.params }));

    assert.deepEqual(canonical, [
      { actionId: asActionId('boost'), params: { amount: 1 } },
      { actionId: asActionId('boost'), params: { amount: 2 } },
      { actionId: asActionId('flat'), params: {} },
    ]);
  });

  it('seed 42 plus fixed move script yields expected final hash', () => {
    const def = createGoldenDef();
    let state = initialState(def, 42, 2);

    for (const move of fixedScript) {
      state = applyMove(def, state, move).state;
    }

    assert.equal(state.stateHash, 12628418626665617762n);
  });
});
