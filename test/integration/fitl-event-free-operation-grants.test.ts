import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type EventDeckDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'event-turn-flow-directives-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2', '3'],
            overrideWindows: [],
          },
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-1', 'card-2'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-grant-nva', 'none'] } },
        ],
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
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-1',
            title: 'Directive From Side',
            sideMode: 'single',
            unshaded: {
              text: 'Grant free op to VC.',
              freeOperationGrants: [{ faction: '3', actionIds: ['operation'] }],
            },
          },
          {
            id: 'card-2',
            title: 'Directive From Branch',
            sideMode: 'single',
            unshaded: {
              text: 'Branch grants free op to NVA.',
              branches: [
                {
                  id: 'branch-grant-nva',
                  freeOperationGrants: [{ faction: '2', actionIds: ['operation'] }],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

describe('event free-operation grants integration', () => {
  it('creates pending free-operation grants from event side declarations', () => {
    const def = createDef();
    const start = initialState(def, 9, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-1', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.deepEqual(runtime.pendingFreeOperationGrants, [{ faction: '3', actionIds: ['operation'] }]);
    assert.equal(second.activePlayer, asPlayerId(2));

    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), false);

    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    const vcMoves = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMoves.some((move) => move.freeOperation === true), true);
  });

  it('creates pending free-operation grants from event branch declarations', () => {
    const def = createDef();
    const start = initialState(def, 10, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-2', side: 'unshaded', branch: 'branch-grant-nva' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.deepEqual(runtime.pendingFreeOperationGrants, [{ faction: '2', actionIds: ['operation'] }]);
    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), true);
  });
});
