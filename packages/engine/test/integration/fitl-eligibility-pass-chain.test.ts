import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type GameDef,
  type Move,
  type GameState,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-pass-chain-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
    constants: {},
    globalVars: [
      { name: 'res0', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'res1', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'ops', type: 'int', init: 0, min: 0, max: 99 },
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
          eligibility: { seats: ['US', 'ARVN', 'NVA', 'VC'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [
            { seat: 'US', resource: 'res0', amount: 1 },
            { seat: 'ARVN', resource: 'res1', amount: 3 },
          ],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'ops', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createCardLifecycleDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-pass-chain-lifecycle-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
    constants: {},
    globalVars: [
      { name: 'aid', type: 'int', init: 0, min: -99, max: 99 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['US', 'ARVN', 'NVA', 'VC'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
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
  }) as unknown as GameDef;

describe('FITL eligibility/pass-chain integration', () => {
  it('scans candidates deterministically, applies pass rewards, and resets on rightmost pass', () => {
    const def = createDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 19, 4).state;

    assert.equal(start.activePlayer, asPlayerId(0));
    assert.equal(requireCardDrivenRuntime(start).currentCard.firstEligible, 'US');
    assert.equal(requireCardDrivenRuntime(start).currentCard.secondEligible, 'ARVN');

    const first = applyMove(def, start, passMove).state;
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(first.globalVars.res0, 1);
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, 'ARVN');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, 'NVA');

    const second = applyMove(def, first, passMove).state;
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(second.globalVars.res1, 3);
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, 'NVA');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, 'VC');

    const third = applyMove(def, second, passMove).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    assert.equal(requireCardDrivenRuntime(third).currentCard.firstEligible, 'VC');
    assert.equal(requireCardDrivenRuntime(third).currentCard.secondEligible, null);

    const fourth = applyMove(def, third, passMove).state;
    assert.equal(fourth.activePlayer, asPlayerId(0));
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.firstEligible, 'US');
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.secondEligible, 'ARVN');
    assert.equal(requireCardDrivenRuntime(fourth).currentCard.nonPassCount, 0);
    assert.deepEqual(requireCardDrivenRuntime(fourth).currentCard.passedSeats, []);
  });

  it('ends the card after two non-pass actions and resets candidate slots', () => {
    const def = createDef();
    const operateMove: Move = { actionId: asActionId('operate'), params: {} };
    const start = initialState(def, 23, 4).state;

    const first = applyMove(def, start, operateMove).state;
    assert.equal(first.globalVars.ops, 1);
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(first).currentCard.nonPassCount, 1);
    assert.equal(requireCardDrivenRuntime(first).currentCard.firstEligible, 'ARVN');
    assert.equal(requireCardDrivenRuntime(first).currentCard.secondEligible, 'NVA');

    const second = applyMove(def, first, operateMove).state;
    assert.equal(second.globalVars.ops, 2);
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(second).currentCard.nonPassCount, 0);
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, 'NVA');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, 'VC');
    assert.deepEqual(requireCardDrivenRuntime(second).eligibility, { US: false, ARVN: false, NVA: true, VC: true });
    assert.deepEqual(requireCardDrivenRuntime(second).currentCard.actedSeats, []);
  });

  it('promotes cards across successive rightmost-pass boundaries without stale boundary reuse', () => {
    const def = createCardLifecycleDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 43, 4).state;

    const initialPlayed = start.zones['played:none']?.[0]?.id ?? null;
    const initialLookahead = start.zones['lookahead:none']?.[0]?.id ?? null;
    assert.notEqual(initialPlayed, null);
    assert.notEqual(initialLookahead, null);

    const afterFirstBoundary = applyMove(
      def,
      applyMove(def, applyMove(def, applyMove(def, start, passMove).state, passMove).state, passMove).state,
      passMove,
    ).state;
    const firstBoundaryPlayed = afterFirstBoundary.zones['played:none']?.[0]?.id ?? null;
    const firstBoundaryLookahead = afterFirstBoundary.zones['lookahead:none']?.[0]?.id ?? null;
    assert.equal(firstBoundaryPlayed, initialLookahead);
    assert.notEqual(firstBoundaryLookahead, null);
    assert.equal(
      Object.prototype.hasOwnProperty.call(requireCardDrivenRuntime(afterFirstBoundary) as unknown as Record<string, unknown>, 'pendingCardBoundaryTraceEntries'),
      false,
    );

    const afterSecondBoundary = applyMove(
      def,
      applyMove(def, applyMove(def, applyMove(def, afterFirstBoundary, passMove).state, passMove).state, passMove).state,
      passMove,
    ).state;
    const secondBoundaryPlayed = afterSecondBoundary.zones['played:none']?.[0]?.id ?? null;
    assert.equal(secondBoundaryPlayed, firstBoundaryLookahead);
  });

  it('expires turn-duration lasting effects immediately when eligibility resolves a card boundary', () => {
    const def = createCardLifecycleDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 71, 4).state;
    const playedCardId = start.zones['played:none']?.[0]?.id ?? null;
    assert.notEqual(playedCardId, null);

    const withLasting: GameState = {
      ...start,
      globalVars: { ...start.globalVars, aid: 3 },
      activeLastingEffects: [
        {
          id: 'aid-shift',
          sourceCardId: playedCardId!,
          side: 'unshaded',
          duration: 'turn',
          setupEffects: [{ addVar: { scope: 'global', var: 'aid', delta: 3 } }],
          teardownEffects: [{ addVar: { scope: 'global', var: 'aid', delta: -3 } }],
          remainingTurnBoundaries: 1,
        },
      ],
    };

    const afterBoundary = applyMove(
      def,
      applyMove(def, applyMove(def, applyMove(def, withLasting, passMove).state, passMove).state, passMove).state,
      passMove,
    ).state;

    assert.equal(afterBoundary.globalVars.aid, 0);
    assert.equal(afterBoundary.activeLastingEffects, undefined);
  });
});
