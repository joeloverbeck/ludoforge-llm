import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-window-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
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
            seats: ['US', 'ARVN', 'NVA', 'VC'],
          },
          windows: [
            { id: 'force-eligible-now', duration: 'turn', usages: ['eligibilityOverride'] },
            { id: 'force-ineligible-now', duration: 'turn', usages: ['eligibilityOverride'] },
            { id: 'remain-eligible', duration: 'nextTurn', usages: ['eligibilityOverride'] },
            { id: 'force-ineligible', duration: 'nextTurn', usages: ['eligibilityOverride'] },
          ],
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
              values: ['card-overrides', 'card-immediate', 'card-immediate-negative', 'card-mixed-overrides', 'card-free-op'],
            },
          },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
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
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-overrides',
            title: 'Overrides Only',
            sideMode: 'single',
            unshaded: {
              text: 'No free operation grant.',
              eligibilityOverrides: [
                { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
                { target: { kind: 'seat', seat: 'NVA' }, eligible: false, windowId: 'force-ineligible' },
              ],
            },
          },
          {
            id: 'card-immediate',
            title: 'Immediate Eligibility',
            sideMode: 'single',
            unshaded: {
              text: 'Make US eligible right now.',
              eligibilityOverrides: [
                { target: { kind: 'seat', seat: 'US' }, eligible: true, windowId: 'force-eligible-now' },
              ],
            },
          },
          {
            id: 'card-immediate-negative',
            title: 'Immediate Ineligibility',
            sideMode: 'single',
            unshaded: {
              text: 'Make ARVN ineligible right now.',
              eligibilityOverrides: [
                { target: { kind: 'seat', seat: 'ARVN' }, eligible: false, windowId: 'force-ineligible-now' },
              ],
            },
          },
          {
            id: 'card-mixed-overrides',
            title: 'Mixed Overrides',
            sideMode: 'single',
            unshaded: {
              text: 'Make ARVN ineligible now and keep US eligible next turn.',
              eligibilityOverrides: [
                { target: { kind: 'seat', seat: 'ARVN' }, eligible: false, windowId: 'force-ineligible-now' },
                { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
              ],
            },
          },
          {
            id: 'card-free-op',
            title: 'Free Operation Grant',
            sideMode: 'single',
            unshaded: {
              text: 'Grant a free operation.',
              freeOperationGrants: [
                {
                  seat: 'NVA',
                  sequence: { chain: 'grant-nva-op', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
        ],
      },
    ],
  }) as unknown as GameDef;

describe('FITL eligibility window integration', () => {
  it('applies declared nextTurn overrides at card end', () => {
    const def = createDef();
    const start = initialState(def, 41, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-overrides', side: 'unshaded' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} });

    assert.deepEqual(requireCardDrivenRuntime(second.state).eligibility, { US: true, ARVN: false, NVA: false, VC: true });
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.firstEligible, 'US');
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.secondEligible, 'VC');
  });

  it('applies declared turn-duration overrides immediately without queuing them for the next card', () => {
    const def = createDef();
    const start = initialState(def, 42, 4).state;
    const runtime = requireCardDrivenRuntime(start);

    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          eligibility: { US: false, ARVN: false, NVA: true, VC: true },
          currentCard: {
            ...runtime.currentCard,
            firstEligible: 'NVA',
            secondEligible: 'VC',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...start.zones,
        'played:none': [{
          id: asTokenId('card-immediate'),
          type: 'card',
          props: { faction: 'none', type: 'card' },
        } as Token],
      },
    };

    const first = applyMove(def, configured, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-immediate', side: 'unshaded' },
    }).state;

    assert.deepEqual(requireCardDrivenRuntime(first).eligibility, { US: true, ARVN: false, NVA: true, VC: true });
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, 'US');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, 'VC');
    assert.deepEqual(requireCardDrivenRuntime(first).pendingEligibilityOverrides ?? [], []);
  });

  it('applies declared turn-duration ineligibility overrides immediately without queuing them for the next card', () => {
    const def = createDef();
    const start = initialState(def, 44, 4).state;
    const runtime = requireCardDrivenRuntime(start);

    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          eligibility: { US: true, ARVN: true, NVA: true, VC: false },
          currentCard: {
            ...runtime.currentCard,
            firstEligible: 'US',
            secondEligible: 'ARVN',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...start.zones,
        'played:none': [{
          id: asTokenId('card-immediate-negative'),
          type: 'card',
          props: { faction: 'none', type: 'card' },
        } as Token],
      },
    };

    const first = applyMove(def, configured, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-immediate-negative', side: 'unshaded' },
    }).state;

    assert.deepEqual(requireCardDrivenRuntime(first).eligibility, { US: true, ARVN: false, NVA: true, VC: false });
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, 'NVA');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, null);
    assert.deepEqual(requireCardDrivenRuntime(first).pendingEligibilityOverrides ?? [], []);
  });

  it('keeps turn overrides current-card-only while nextTurn overrides queue and apply at card end', () => {
    const def = createDef();
    const start = initialState(def, 45, 4).state;
    const runtime = requireCardDrivenRuntime(start);

    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          eligibility: { US: true, ARVN: true, NVA: true, VC: false },
          currentCard: {
            ...runtime.currentCard,
            firstEligible: 'US',
            secondEligible: 'ARVN',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...start.zones,
        'played:none': [{
          id: asTokenId('card-mixed-overrides'),
          type: 'card',
          props: { faction: 'none', type: 'card' },
        } as Token],
      },
    };

    const firstResult = applyMove(def, configured, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-mixed-overrides', side: 'unshaded' },
    });
    const afterEvent = firstResult.state;

    assert.deepEqual(requireCardDrivenRuntime(afterEvent).eligibility, { US: true, ARVN: false, NVA: true, VC: false });
    assert.equal(requireCardDrivenRuntime(afterEvent).currentCard.firstEligible, 'NVA');
    assert.equal(requireCardDrivenRuntime(afterEvent).currentCard.secondEligible, null);
    assert.deepEqual(requireCardDrivenRuntime(afterEvent).pendingEligibilityOverrides ?? [], [
      { seat: 'US', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);

    const overrideCreate = firstResult.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    ) as
      | {
        overrides?: readonly unknown[];
        eligibilityBefore?: unknown;
        eligibilityAfter?: unknown;
      }
      | undefined;
    assert.deepEqual(overrideCreate?.overrides, [
      { seat: 'ARVN', eligible: false, windowId: 'force-ineligible-now', duration: 'turn' },
      { seat: 'US', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);
    assert.deepEqual(overrideCreate?.eligibilityBefore, { US: true, ARVN: true, NVA: true, VC: false });
    assert.deepEqual(overrideCreate?.eligibilityAfter, { US: true, ARVN: false, NVA: true, VC: false });

    const secondResult = applyMove(def, afterEvent, { actionId: asActionId('operation'), params: {} });
    const nextCard = secondResult.state;

    assert.deepEqual(requireCardDrivenRuntime(nextCard).eligibility, { US: true, ARVN: true, NVA: false, VC: true });
    assert.equal(requireCardDrivenRuntime(nextCard).currentCard.firstEligible, 'US');
    assert.equal(requireCardDrivenRuntime(nextCard).currentCard.secondEligible, 'ARVN');
    assert.deepEqual(requireCardDrivenRuntime(nextCard).pendingEligibilityOverrides ?? [], []);
  });

  it('emits and consumes one-shot free-operation move variants from freeOpGranted directives', () => {
    const def = createDef();
    const start = initialState(def, 43, 4).state;

    const firstMove: Move = {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-free-op', side: 'unshaded' },
    };
    const firstResult = applyMove(def, start, firstMove);

    // Player 1 acts second and ends the card; player 2 becomes first eligible next card.
    const secondResult = applyMove(def, firstResult.state, { actionId: asActionId('operation'), params: {} });
    const second = secondResult.state;

    const pendingFreeOperationGrants = requireCardDrivenRuntime(second).pendingFreeOperationGrants ?? [];
    assert.equal(pendingFreeOperationGrants.length, 1);
    assert.equal(pendingFreeOperationGrants[0]?.seat, 'NVA');
    assert.equal(pendingFreeOperationGrants[0]?.operationClass, 'operation');
    assert.deepEqual(pendingFreeOperationGrants[0]?.actionIds, ['operation']);
    assert.equal(pendingFreeOperationGrants[0]?.remainingUses, 1);
    assert.equal(typeof pendingFreeOperationGrants[0]?.grantId, 'string');

    const grantedMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(
      grantedMoves.some((move) => move.freeOperation === true),
      true,
      'Expected operation freeOperation variant for granted faction',
    );
    assert.equal(
      grantedMoves.some((move) => move.freeOperation !== true),
      true,
      'Expected normal operation variant to remain available',
    );

    const freeMoveResult = applyMove(def, second, { actionId: asActionId('operation'), params: {}, freeOperation: true });
    const freeRuntime = requireCardDrivenRuntime(freeMoveResult.state);
    assert.deepEqual(freeRuntime.pendingFreeOperationGrants, undefined);

    assert.equal(
      firstResult.triggerFirings.some(
        (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
      ),
      false,
    );

    const cardEndEntry = secondResult.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'cardEnd',
    );
    assert.equal(cardEndEntry?.kind, 'turnFlowEligibility');
    assert.equal(cardEndEntry?.overrides, undefined);

    assert.deepEqual(requireCardDrivenRuntime(second).eligibility, { US: false, ARVN: false, NVA: true, VC: true });
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, 'NVA');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, 'VC');
  });
});
