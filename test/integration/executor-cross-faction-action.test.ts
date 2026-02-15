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
    metadata: { id: 'executor-cross-faction-action', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'influence', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('pressure'),
        actor: 'active',
        executor: { id: asPlayerId(1) },
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'perPlayer', player: 'actor', var: 'influence', delta: 2 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('integration: cross-faction action executor', () => {
  it('applies effects under non-active executor while move remains active-player initiated', () => {
    const def = buildDef();
    const initial = initialState(def, 99, 2);
    const moves = legalMoves(def, initial);

    assert.deepEqual(moves.map((move) => String(move.actionId)), ['pressure']);

    const applied = applyMove(def, initial, { actionId: asActionId('pressure'), params: {} }).state;
    assert.equal(applied.perPlayerVars[0]?.influence, 0);
    assert.equal(applied.perPlayerVars[1]?.influence, 2);
  });
});
