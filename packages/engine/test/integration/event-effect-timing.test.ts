import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type EventDeckDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'event-effect-timing-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'afterCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'beforeCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'defaultCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'batchCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchSideCounter', type: 'int', init: 0, min: 0, max: 99 },
    ],
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
            seats: ['0', '1', '2', '3'],
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
        capabilities: ['cardEvent'],
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          {
            name: 'eventCardId',
            domain: {
              query: 'enums',
              values: ['card-after', 'card-before', 'card-default', 'card-batch', 'card-branch'],
            },
          },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-after', 'none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
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
    actionPipelines: [
      {
        id: 'operation-profile',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'atomic',
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
            id: 'card-after',
            title: 'Deferred side effect',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              freeOperationGrants: [
                {
                  seat: '3',
                  sequence: { chain: 'vc-after', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'afterCounter', delta: 1 } }],
            },
          },
          {
            id: 'card-before',
            title: 'Immediate explicit before side effect',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'beforeGrants',
              freeOperationGrants: [
                {
                  seat: '3',
                  sequence: { chain: 'vc-before', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'beforeCounter', delta: 1 } }],
            },
          },
          {
            id: 'card-default',
            title: 'Immediate implicit before side effect',
            sideMode: 'single',
            unshaded: {
              freeOperationGrants: [
                {
                  seat: '3',
                  sequence: { chain: 'vc-default', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'defaultCounter', delta: 1 } }],
            },
          },
          {
            id: 'card-batch',
            title: 'Deferred side effect after two grants',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              freeOperationGrants: [
                {
                  seat: '3',
                  sequence: { chain: 'vc-batch-a', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
                {
                  seat: '3',
                  sequence: { chain: 'vc-batch-b', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'batchCounter', delta: 1 } }],
            },
          },
          {
            id: 'card-branch',
            title: 'Branch timing override',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'beforeGrants',
              effects: [{ addVar: { scope: 'global', var: 'branchSideCounter', delta: 1 } }],
              branches: [
                {
                  id: 'branch-after',
                  effectTiming: 'afterGrants',
                  freeOperationGrants: [
                    {
                      seat: '3',
                      sequence: { chain: 'vc-branch', step: 0 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                    },
                  ],
                  effects: [{ addVar: { scope: 'global', var: 'branchCounter', delta: 1 } }],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const advanceToVc = (def: GameDef, state: ReturnType<typeof initialState>['state']) => {
  const afterSeat1 = applyMove(def, state, { actionId: asActionId('operation'), params: {} }).state;
  return applyMove(def, afterSeat1, { actionId: asActionId('operation'), params: {} }).state;
};

describe('event effect timing integration', () => {
  it('defers effects for afterGrants until a granted free operation is consumed', () => {
    const def = createDef();
    const start = initialState(def, 31, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-after', side: 'unshaded', branch: 'none' },
    }).state;
    assert.equal(afterEvent.globalVars.afterCounter, 0);

    const vcWindow = advanceToVc(def, afterEvent);
    assert.equal(vcWindow.activePlayer, asPlayerId(3));
    assert.equal(vcWindow.globalVars.afterCounter, 0);

    const afterFreeOp = applyMove(def, vcWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.equal(afterFreeOp.globalVars.afterCounter, 1);
    assert.equal(requireCardDrivenRuntime(afterFreeOp).pendingFreeOperationGrants, undefined);
  });

  it('keeps explicit beforeGrants behavior immediate', () => {
    const def = createDef();
    const start = initialState(def, 32, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-before', side: 'unshaded', branch: 'none' },
    }).state;

    assert.equal(afterEvent.globalVars.beforeCounter, 1);
  });

  it('keeps omitted effectTiming behavior immediate', () => {
    const def = createDef();
    const start = initialState(def, 33, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-default', side: 'unshaded', branch: 'none' },
    }).state;

    assert.equal(afterEvent.globalVars.defaultCounter, 1);
  });

  it('fires deferred effects only after the last grant in a batch is consumed', () => {
    const def = createDef();
    const start = initialState(def, 34, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-batch', side: 'unshaded', branch: 'none' },
    }).state;
    const vcWindow = advanceToVc(def, afterEvent);

    assert.equal(requireCardDrivenRuntime(vcWindow).pendingFreeOperationGrants?.length, 2);
    assert.equal(vcWindow.globalVars.batchCounter, 0);

    const afterFirstFree = applyMove(def, vcWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.equal(requireCardDrivenRuntime(afterFirstFree).pendingFreeOperationGrants?.length, 1);
    assert.equal(afterFirstFree.globalVars.batchCounter, 0);

    const afterSecondFree = applyMove(def, afterFirstFree, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.equal(requireCardDrivenRuntime(afterSecondFree).pendingFreeOperationGrants, undefined);
    assert.equal(afterSecondFree.globalVars.batchCounter, 1);
  });

  it('lets branch timing override side timing for selected branches', () => {
    const def = createDef();
    const start = initialState(def, 35, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-branch', side: 'unshaded', branch: 'branch-after' },
    }).state;
    const vcWindow = advanceToVc(def, afterEvent);

    assert.equal(afterEvent.globalVars.branchSideCounter, 0);
    assert.equal(afterEvent.globalVars.branchCounter, 0);

    const afterFreeOp = applyMove(def, vcWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.equal(afterFreeOp.globalVars.branchSideCounter, 1);
    assert.equal(afterFreeOp.globalVars.branchCounter, 1);
  });
});
