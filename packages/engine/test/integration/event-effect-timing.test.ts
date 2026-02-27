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
      { name: 'afterCounterTwo', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'afterNoGrantCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'beforeCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'defaultCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'batchCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchNoGrantCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchSideCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'branchSideNoGrantCounter', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'selfGrantCounter', type: 'int', init: 0, min: 0, max: 99 },
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
                  values: [
                    'card-after',
                    'card-after-2',
                    'card-after-no-grant',
                    'card-before',
                    'card-default',
                    'card-batch',
                    'card-branch',
                    'card-branch-no-grant',
                    'card-self-grant',
                  ],
                },
              },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-after', 'branch-after-no-grant', 'none'] } },
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
            id: 'card-after-2',
            title: 'Second deferred side effect',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              freeOperationGrants: [
                {
                  seat: '3',
                  sequence: { chain: 'vc-after-2', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'afterCounterTwo', delta: 1 } }],
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
            id: 'card-after-no-grant',
            title: 'Deferred timing without grants',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              effects: [{ addVar: { scope: 'global', var: 'afterNoGrantCounter', delta: 1 } }],
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
          {
            id: 'card-branch-no-grant',
            title: 'Branch timing override without grants',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'beforeGrants',
              effects: [{ addVar: { scope: 'global', var: 'branchSideNoGrantCounter', delta: 1 } }],
              branches: [
                {
                  id: 'branch-after-no-grant',
                  effectTiming: 'afterGrants',
                  effects: [{ addVar: { scope: 'global', var: 'branchNoGrantCounter', delta: 1 } }],
                },
              ],
            },
          },
          {
            id: 'card-self-grant',
            title: 'Same-seat grant deferred',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              freeOperationGrants: [
                {
                  seat: '0',
                  sequence: { chain: 'self-grant', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [{ addVar: { scope: 'global', var: 'selfGrantCounter', delta: 1 } }],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const advanceToSeat = (def: GameDef, state: ReturnType<typeof initialState>['state'], targetSeat: number) => {
  let next = state;
  for (let step = 0; step < 16; step += 1) {
    if (next.activePlayer === asPlayerId(targetSeat)) {
      return next;
    }
    next = applyMove(def, next, { actionId: asActionId('operation'), params: {} }).state;
  }
  assert.fail(`expected to rotate active seat to ${targetSeat} within 16 operation moves`);
};

const advanceToVc = (def: GameDef, state: ReturnType<typeof initialState>['state']) =>
  advanceToSeat(def, state, 3);

const deferredLifecycleEntries = (
  triggerFirings: readonly { readonly kind: string }[],
) =>
  triggerFirings.filter(
    (entry): entry is {
      readonly kind: 'turnFlowDeferredEventLifecycle';
      readonly stage: 'queued' | 'released' | 'executed';
      readonly deferredId: string;
      readonly actionId: string;
      readonly requiredGrantBatchIds: readonly string[];
    } => entry.kind === 'turnFlowDeferredEventLifecycle',
  );

describe('event effect timing integration', () => {
  it('defers effects for afterGrants until a granted free operation is consumed', () => {
    const def = createDef();
    const start = initialState(def, 31, 4).state;

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-after', side: 'unshaded', branch: 'none' },
    });
    const afterEvent = afterEventResult.state;
    assert.equal(afterEvent.globalVars.afterCounter, 0);
    const queued = deferredLifecycleEntries(afterEventResult.triggerFirings);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.stage, 'queued');
    assert.equal(queued[0]?.actionId, 'event');
    assert.deepEqual(queued[0]?.requiredGrantBatchIds.length, 1);

    const vcWindow = advanceToVc(def, afterEvent);
    assert.equal(vcWindow.activePlayer, asPlayerId(3));
    assert.equal(vcWindow.globalVars.afterCounter, 0);

    const afterFreeOpResult = applyMove(def, vcWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const afterFreeOp = afterFreeOpResult.state;
    assert.equal(afterFreeOp.globalVars.afterCounter, 1);
    assert.equal(requireCardDrivenRuntime(afterFreeOp).pendingFreeOperationGrants, undefined);
    const lifecycle = deferredLifecycleEntries(afterFreeOpResult.triggerFirings);
    assert.deepEqual(lifecycle.map((entry) => entry.stage), ['released', 'executed']);
    assert.equal(lifecycle[0]?.deferredId, queued[0]?.deferredId);
    assert.equal(lifecycle[1]?.deferredId, queued[0]?.deferredId);
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

  it('releases afterGrants effects immediately when no grants are emitted', () => {
    const def = createDef();
    const start = initialState(def, 321, 4).state;

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-after-no-grant', side: 'unshaded', branch: 'none' },
    });
    const afterEvent = afterEventResult.state;

    assert.equal(afterEvent.globalVars.afterNoGrantCounter, 1);
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants, undefined);
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingDeferredEventEffects, undefined);

    const lifecycle = deferredLifecycleEntries(afterEventResult.triggerFirings);
    assert.deepEqual(lifecycle.map((entry) => entry.stage), ['released', 'executed']);
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

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-batch', side: 'unshaded', branch: 'none' },
    });
    const afterEvent = afterEventResult.state;
    const vcWindow = advanceToVc(def, afterEvent);
    const queued = deferredLifecycleEntries(afterEventResult.triggerFirings);
    assert.deepEqual(queued.map((entry) => entry.stage), ['queued']);

    assert.equal(requireCardDrivenRuntime(vcWindow).pendingFreeOperationGrants?.length, 2);
    assert.equal(vcWindow.globalVars.batchCounter, 0);

    const afterFirstFreeResult = applyMove(def, vcWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const afterFirstFree = afterFirstFreeResult.state;
    assert.equal(requireCardDrivenRuntime(afterFirstFree).pendingFreeOperationGrants?.length, 1);
    assert.equal(afterFirstFree.globalVars.batchCounter, 0);
    assert.equal(deferredLifecycleEntries(afterFirstFreeResult.triggerFirings).length, 0);

    const afterSecondFreeResult = applyMove(def, afterFirstFree, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const afterSecondFree = afterSecondFreeResult.state;
    assert.equal(requireCardDrivenRuntime(afterSecondFree).pendingFreeOperationGrants, undefined);
    assert.equal(afterSecondFree.globalVars.batchCounter, 1);
    const lifecycle = deferredLifecycleEntries(afterSecondFreeResult.triggerFirings);
    assert.deepEqual(lifecycle.map((entry) => entry.stage), ['released', 'executed']);
    assert.equal(lifecycle[0]?.deferredId, queued[0]?.deferredId);
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

  it('releases branch-selected afterGrants effects immediately when branch emits no grants', () => {
    const def = createDef();
    const start = initialState(def, 351, 4).state;

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-branch-no-grant', side: 'unshaded', branch: 'branch-after-no-grant' },
    });
    const afterEvent = afterEventResult.state;

    assert.equal(afterEvent.globalVars.branchSideNoGrantCounter, 1);
    assert.equal(afterEvent.globalVars.branchNoGrantCounter, 1);
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants, undefined);
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingDeferredEventEffects, undefined);

    const lifecycle = deferredLifecycleEntries(afterEventResult.triggerFirings);
    assert.deepEqual(lifecycle.map((entry) => entry.stage), ['released', 'executed']);
  });

  it('preserves per-deferred lifecycle ordering across multiple queued deferred payloads', () => {
    const def = createDef();
    const start = initialState(def, 36, 4).state;
    const vcStart = advanceToVc(def, start);

    const firstEventResult = applyMove(def, vcStart, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-after', side: 'unshaded', branch: 'none' },
    });
    const secondEventWindow = advanceToVc(def, firstEventResult.state);
    const secondEventResult = applyMove(def, secondEventWindow, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-after-2', side: 'unshaded', branch: 'none' },
    });
    const firstFreeWindow = advanceToVc(def, secondEventResult.state);
    const firstFreeResult = applyMove(def, firstFreeWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const secondFreeWindow = advanceToVc(def, firstFreeResult.state);
    const secondFreeResult = applyMove(def, secondFreeWindow, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });

    assert.equal(secondFreeResult.state.globalVars.afterCounter, 1);
    assert.equal(secondFreeResult.state.globalVars.afterCounterTwo, 1);
    assert.equal(requireCardDrivenRuntime(secondFreeResult.state).pendingFreeOperationGrants, undefined);

    const firstQueued = deferredLifecycleEntries(firstEventResult.triggerFirings);
    const secondQueued = deferredLifecycleEntries(secondEventResult.triggerFirings);
    assert.deepEqual(firstQueued.map((entry) => entry.stage), ['queued']);
    assert.deepEqual(secondQueued.map((entry) => entry.stage), ['queued']);
    assert.notEqual(firstQueued[0]?.deferredId, secondQueued[0]?.deferredId);

    const lifecycleByDeferredId = new Map<string, Array<'queued' | 'released' | 'executed'>>();
    for (const entry of [
      ...deferredLifecycleEntries(firstEventResult.triggerFirings),
      ...deferredLifecycleEntries(secondEventResult.triggerFirings),
      ...deferredLifecycleEntries(firstFreeResult.triggerFirings),
      ...deferredLifecycleEntries(secondFreeResult.triggerFirings),
    ]) {
      const stages = lifecycleByDeferredId.get(entry.deferredId) ?? [];
      stages.push(entry.stage);
      lifecycleByDeferredId.set(entry.deferredId, stages);
    }

    assert.equal(lifecycleByDeferredId.size, 2);
    for (const stages of lifecycleByDeferredId.values()) {
      assert.deepEqual(stages, ['queued', 'released', 'executed']);
    }
  });

  it('resolves deferred effects when the grant is assigned to the same seat that played the event', () => {
    const def = createDef();
    const start = initialState(def, 40, 4).state;

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-self-grant', side: 'unshaded', branch: 'none' },
    });
    const afterEvent = afterEventResult.state;
    assert.equal(afterEvent.globalVars.selfGrantCounter, 0, 'deferred effect must not fire immediately');
    const queued = deferredLifecycleEntries(afterEventResult.triggerFirings);
    assert.equal(queued.length, 1, 'exactly one deferred payload should be queued');
    assert.equal(queued[0]?.stage, 'queued');
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants?.length, 1);
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants?.[0]?.seat, '0');

    const seat0Window = advanceToSeat(def, afterEvent, 0);
    assert.equal(seat0Window.activePlayer, asPlayerId(0), 'seat 0 must become active again through natural rotation');
    assert.equal(seat0Window.globalVars.selfGrantCounter, 0, 'deferred effect must still be pending before free op');
    assert.equal(
      (requireCardDrivenRuntime(seat0Window).pendingFreeOperationGrants ?? []).length,
      1,
      'grant must persist across card boundaries',
    );

    const afterFreeOpResult = applyMove(def, seat0Window, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const afterFreeOp = afterFreeOpResult.state;
    assert.equal(afterFreeOp.globalVars.selfGrantCounter, 1, 'deferred effect must fire after same-seat grant consumption');
    assert.equal(requireCardDrivenRuntime(afterFreeOp).pendingFreeOperationGrants, undefined, 'grant must be consumed');
    assert.equal(requireCardDrivenRuntime(afterFreeOp).pendingDeferredEventEffects, undefined, 'no deferred effects must remain');
    const lifecycle = deferredLifecycleEntries(afterFreeOpResult.triggerFirings);
    assert.deepEqual(lifecycle.map((entry) => entry.stage), ['released', 'executed']);
    assert.equal(lifecycle[0]?.deferredId, queued[0]?.deferredId);
  });
});
