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
  type Move,
} from '../../src/kernel/index.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-option-matrix-int', players: { min: 3, max: 3 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      eligibility: { factions: ['0', '1', '2'], overrideWindows: [] },
      optionMatrix: [
        { first: 'event', second: ['operation', 'operationPlusSpecialActivity'] },
        { first: 'operation', second: ['limitedOperation'] },
        { first: 'operationPlusSpecialActivity', second: ['limitedOperation', 'event'] },
      ],
      passRewards: [],
      durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('limitedOperation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operationPlusSpecialActivity'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

describe('FITL option matrix integration', () => {
  it('gates second eligible legal moves after first eligible resolves event', () => {
    const def = createDef();
    const start = initialState(def, 31, 3);
    const firstMove: Move = { actionId: asActionId('event'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(afterFirst.turnFlow?.currentCard.firstActionClass, 'event');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('operationPlusSpecialActivity')],
    );
  });

  it('treats limitedOperation as operation for next eligible matrix classification', () => {
    const def = createDef();
    const start = initialState(def, 37, 3);
    const firstMove: Move = { actionId: asActionId('limitedOperation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(afterFirst.turnFlow?.currentCard.firstActionClass, 'operation');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('limitedOperation')],
    );
  });
});
