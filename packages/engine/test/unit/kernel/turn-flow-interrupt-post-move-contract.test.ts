// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  type EventDeckDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { requireCardDrivenRuntime } from '../../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'interrupt-post-move-contract', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [
      { name: 'interruptCounter', type: 'int', init: 0, min: 0, max: 99 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
      interrupts: [{ id: asPhaseId('interrupt') }],
    },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            seats: ['0', '1', '2', '3'],
          },
          windows: [{ id: 'remain-eligible', duration: 'nextTurn', usages: ['eligibilityOverride'] }],
          actionClassByActionId: { event: 'event', operation: 'operation' },
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
        phase: [asPhaseId('main'), asPhaseId('interrupt')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-interrupt-after'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
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
        phase: [asPhaseId('main'), asPhaseId('interrupt')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('resolveInterrupt'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('interrupt')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ popInterruptPhase: {} })],
        limits: [],
      },
    ],
    actionPipelines: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-interrupt-after',
            title: 'Interrupt after-grants contract',
            sideMode: 'single',
            unshaded: {
              effectTiming: 'afterGrants',
              eligibilityOverrides: [
                {
                  target: { kind: 'active' },
                  eligible: true,
                  windowId: 'remain-eligible',
                },
              ],
              freeOperationGrants: [
                {
                  seat: '0',
                  sequence: { batch: 'interrupt-self', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
              effects: [eff({ addVar: { scope: 'global', var: 'interruptCounter', delta: 1 } })],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createInterruptState = (def: GameDef): GameState => {
  const base = initialState(def, 4101, 4).state;
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    currentPhase: asPhaseId('interrupt'),
    activePlayer: asPlayerId(0),
    interruptPhaseStack: [{ phase: asPhaseId('interrupt'), resumePhase: asPhaseId('main') }],
    zones: {
      ...base.zones,
      'played:none': [{ id: asTokenId('card-interrupt-after'), type: 'card', props: { cardId: 'card-interrupt-after' } }],
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        eligibility: { '0': true, '1': true, '2': true, '3': true },
        currentCard: {
          ...runtime.currentCard,
          firstEligible: '1',
          secondEligible: '2',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

describe('interrupt-originated turn-flow post-move contract', () => {
  it('persists generic turn-flow side effects without mutating interrupted card sequencing', () => {
    const def = createDef();
    const start = createInterruptState(def);
    const beforeCard = requireCardDrivenRuntime(start).currentCard;

    const afterEventResult = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-interrupt-after', side: 'unshaded', branch: 'none' },
    });
    const afterEvent = afterEventResult.state;
    const runtimeAfterEvent = requireCardDrivenRuntime(afterEvent);

    assert.equal(afterEvent.currentPhase, 'interrupt');
    assert.equal(afterEvent.activePlayer, asPlayerId(0));
    assert.equal(afterEvent.globalVars.interruptCounter, 0, 'afterGrants effect must remain deferred');
    assert.deepEqual(runtimeAfterEvent.currentCard, beforeCard, 'interrupt event must not advance interrupted card sequencing');
    assert.deepEqual(runtimeAfterEvent.pendingEligibilityOverrides ?? [], [
      { seat: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);
    assert.equal(runtimeAfterEvent.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtimeAfterEvent.pendingFreeOperationGrants?.[0]?.seat, '0');
    assert.equal(runtimeAfterEvent.pendingDeferredEventEffects?.length, 1);
    assert.deepEqual(
      afterEventResult.triggerFirings
        .filter((entry) => entry.kind === 'turnFlowEligibility')
        .map((entry) => entry.step),
      ['overrideCreate'],
    );
    assert.deepEqual(
      afterEventResult.triggerFirings
        .filter((entry) => entry.kind === 'turnFlowDeferredEventLifecycle')
        .map((entry) => entry.stage),
      ['queued'],
    );

    const afterFreeOpResult = applyMove(def, afterEvent, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    });
    const afterFreeOp = afterFreeOpResult.state;
    const runtimeAfterFreeOp = requireCardDrivenRuntime(afterFreeOp);

    assert.equal(afterFreeOp.currentPhase, 'interrupt');
    assert.equal(afterFreeOp.activePlayer, asPlayerId(0));
    assert.equal(afterFreeOp.globalVars.interruptCounter, 1, 'deferred effect must fire after free-op grant consumption');
    assert.deepEqual(runtimeAfterFreeOp.currentCard, beforeCard, 'free-op resolution inside interrupt must not mutate interrupted card sequencing');
    assert.equal(runtimeAfterFreeOp.pendingFreeOperationGrants, undefined);
    assert.equal(runtimeAfterFreeOp.pendingDeferredEventEffects, undefined);
    assert.deepEqual(
      afterFreeOpResult.triggerFirings
        .filter((entry) => entry.kind === 'turnFlowDeferredEventLifecycle')
        .map((entry) => entry.stage),
      ['released', 'executed'],
    );

    const afterResume = applyMove(def, afterFreeOp, {
      actionId: asActionId('resolveInterrupt'),
      params: {},
    }).state;
    const runtimeAfterResume = requireCardDrivenRuntime(afterResume);

    assert.equal(afterResume.currentPhase, 'main');
    assert.equal(afterResume.activePlayer, asPlayerId(1), 'resume must return control to the interrupted card flow');
    assert.deepEqual(runtimeAfterResume.currentCard, beforeCard);
    assert.deepEqual(runtimeAfterResume.pendingEligibilityOverrides ?? [], [
      { seat: '0', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);
  });
});
