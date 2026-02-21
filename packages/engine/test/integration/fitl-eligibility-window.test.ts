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
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-window-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
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
            seats: ['0', '1', '2', '3'],
            overrideWindows: [
              { id: 'remain-eligible', duration: 'nextTurn' },
              { id: 'force-ineligible', duration: 'nextTurn' },
            ],
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
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-overrides', 'card-free-op'] } },
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
                { target: { kind: 'seat', seat: '2' }, eligible: false, windowId: 'force-ineligible' },
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
                  seat: '2',
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

    assert.deepEqual(requireCardDrivenRuntime(second.state).eligibility, { '0': true, '1': false, '2': false, '3': true });
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.secondEligible, '3');
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
    assert.equal(pendingFreeOperationGrants[0]?.seat, '2');
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

    assert.deepEqual(requireCardDrivenRuntime(second).eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, '2');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, '3');
  });
});
