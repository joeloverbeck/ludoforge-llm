import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
} from '../../src/kernel/index.js';

const buildDef = (): GameDef =>
  ({
    metadata: { id: 'action-executor-semantics', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('crossFactionScore'),
        actor: 'active',
        executor: { id: asPlayerId(1) },
        phase: [asPhaseId('main')],
        params: [],
        pre: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
        cost: [],
        effects: [{ addVar: { scope: 'perPlayer', player: 'actor', var: 'score', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('action executor semantics', () => {
  it('legalMoves evaluates action preconditions under executor context', () => {
    const def = buildDef();
    const state = initialState(def, 123, 2);
    assert.deepEqual(legalMoves(def, state).map((move) => String(move.actionId)), ['crossFactionScore']);
  });

  it('applyMove mutates executor-owned state, not active-player state', () => {
    const def = buildDef();
    const state = initialState(def, 123, 2);
    const result = applyMove(def, state, { actionId: asActionId('crossFactionScore'), params: {} });

    assert.equal(result.state.perPlayerVars[0]?.score, 0);
    assert.equal(result.state.perPlayerVars[1]?.score, 1);
  });
});
