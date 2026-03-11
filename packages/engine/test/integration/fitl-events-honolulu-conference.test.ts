import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-64';
const QUANG_NAM = 'quang-nam:none';
const HUE = 'hue:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupCard64State = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  eligibility: Readonly<Record<'us' | 'arvn' | 'nva' | 'vc', boolean>>,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  overrides?: {
    readonly globalVars?: Partial<GameState['globalVars']>;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Partial<GameState['markers']>;
    readonly zoneVars?: Partial<GameState['zoneVars']>;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      aid: 30,
      patronage: 12,
      arvnResources: 20,
      totalEcon: 12,
      ...(overrides?.globalVars ?? {}),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: ['arvn', 'us', 'nva', 'vc'],
        eligibility,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(overrides?.zones ?? {}),
    },
    markers: (
      overrides?.markers === undefined
        ? base.markers
        : { ...base.markers, ...overrides.markers }
    ) as GameState['markers'],
    zoneVars: (
      overrides?.zoneVars === undefined
        ? base.zoneVars
        : { ...base.zoneVars, ...overrides.zoneVars }
    ) as GameState['zoneVars'],
  };
};

const findEventMove = (
  def: GameDef,
  state: GameState,
  branch: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.eventCardId === CARD_ID
      && move.params.side === 'unshaded'
      && move.params.branch === branch,
  );

describe('FITL card-64 Honolulu Conference', () => {
  it('encodes the exact event text, branch matrix, insurgent stay-eligible override, and Honolulu interrupt wiring', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.sideMode, 'single');
    assert.equal(card?.metadata?.flavorText, 'Uneasy allies.');
    assert.equal(
      card?.unshaded?.text,
      'Aid +10 or -10. Patronage +3 or -5. If US or ARVN executing, that Faction Pacifies as if Support Phase. If Insurgent executing, that Faction remains Eligible.',
    );
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      {
        target: { kind: 'active' },
        eligible: true,
        windowId: 'remain-eligible',
        when: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'activeSeat' }, right: 'nva' },
            { op: '==', left: { ref: 'activeSeat' }, right: 'vc' },
          ],
        },
      },
    ]);
    assert.deepEqual(
      [...(card?.unshaded?.branches?.map((branch) => branch.id) ?? [])].sort(),
      [
        'aid-minus-10-patronage-minus-5',
        'aid-minus-10-patronage-plus-3',
        'aid-plus-10-patronage-minus-5',
        'aid-plus-10-patronage-plus-3',
      ],
    );

    const interruptIds = def.turnStructure.interrupts?.map((phase) => String(phase.id)) ?? [];
    assert.equal(interruptIds.includes('honoluluPacify'), true);
    assert.equal(def.actions.some((action) => String(action.id) === 'resolveHonoluluPacify'), true);
  });

  it('US execution applies the chosen deltas, enters a dedicated pacify interrupt, and resumes card flow after pacification', () => {
    const def = compileDef();
    const setup = setupCard64State(def, 64001, 0, {
      us: true,
      arvn: false,
      nva: true,
      vc: true,
    }, 'us', 'nva', {
      zones: {
        [QUANG_NAM]: [
          makeToken('honolulu-us-t-1', 'troops', 'US'),
          makeToken('honolulu-arvn-p-1', 'police', 'ARVN'),
        ],
        [HUE]: [
          makeToken('honolulu-us-t-2', 'troops', 'US'),
          makeToken('honolulu-arvn-p-2', 'police', 'ARVN'),
        ],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'neutral' },
        [HUE]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        [QUANG_NAM]: { terrorCount: 1 },
        [HUE]: { terrorCount: 0 },
      },
    });

    const eventMove = findEventMove(def, setup, 'aid-plus-10-patronage-plus-3');
    assert.notEqual(eventMove, undefined, 'Expected card-64 US event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    const runtimeAfterEvent = requireCardDrivenRuntime(afterEvent);
    assert.equal(afterEvent.currentPhase, 'honoluluPacify');
    assert.equal(afterEvent.activePlayer, asPlayerId(0), 'US should retain control during the Honolulu pacify interrupt');
    assert.equal(afterEvent.globalVars.aid, 40);
    assert.equal(afterEvent.globalVars.patronage, 15);
    assert.equal(runtimeAfterEvent.currentCard.firstEligible, 'nva');
    assert.equal(runtimeAfterEvent.currentCard.secondEligible, 'vc');
    assert.equal(runtimeAfterEvent.currentCard.nonPassCount, 1);
    assert.equal(runtimeAfterEvent.currentCard.firstActionClass, 'event');
    assert.equal(runtimeAfterEvent.pendingFreeOperationGrants, undefined);
    assert.equal(runtimeAfterEvent.pendingDeferredEventEffects, undefined);

    const interruptMoves = legalMoves(def, afterEvent);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'coupPacifyUS'), true);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'resolveHonoluluPacify'), true);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'coupPacifyARVN'), false);

    const afterTerrorRemoval = applyMove(def, afterEvent, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: QUANG_NAM, action: 'removeTerror' },
    }).state;
    assert.equal(afterTerrorRemoval.activePlayer, asPlayerId(0), 'Interrupt pacify steps must not hand off the card turn');
    assert.equal(afterTerrorRemoval.zoneVars[QUANG_NAM]?.terrorCount ?? 0, 0);
    assert.equal(afterTerrorRemoval.globalVars.arvnResources, 17);
    assert.equal(requireCardDrivenRuntime(afterTerrorRemoval).currentCard.nonPassCount, 1);

    const afterShift = applyMove(def, afterTerrorRemoval, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: QUANG_NAM, action: 'shiftSupport' },
    }).state;
    assert.equal(afterShift.markers[QUANG_NAM]?.supportOpposition, 'passiveSupport');
    assert.equal(afterShift.markers[QUANG_NAM]?.coupSupportShiftCount, 'one');
    assert.equal(afterShift.globalVars.arvnResources, 14);
    assert.equal(requireCardDrivenRuntime(afterShift).currentCard.nonPassCount, 1);
    assert.equal(requireCardDrivenRuntime(afterShift).pendingFreeOperationGrants, undefined);
    assert.equal(requireCardDrivenRuntime(afterShift).pendingDeferredEventEffects, undefined);

    const final = applyMove(def, afterShift, {
      actionId: asActionId('resolveHonoluluPacify'),
      params: {},
    }).state;
    const finalRuntime = requireCardDrivenRuntime(final);
    assert.equal(final.currentPhase, 'main');
    assert.equal(final.activePlayer, asPlayerId(2), 'Card flow should hand off to the next eligible faction after the interrupt ends');
    assert.equal(finalRuntime.currentCard.firstEligible, 'nva');
    assert.equal(finalRuntime.currentCard.secondEligible, 'vc');
    assert.equal(finalRuntime.currentCard.nonPassCount, 1);
    assert.equal(finalRuntime.currentCard.firstActionClass, 'event');
    assert.equal(finalRuntime.pendingFreeOperationGrants, undefined);
    assert.equal(finalRuntime.pendingDeferredEventEffects, undefined);
  });

  it('ARVN execution only exposes ARVN pacification and can end immediately when no legal pacify exists', () => {
    const def = compileDef();
    const setup = setupCard64State(def, 64002, 1, {
      us: false,
      arvn: true,
      nva: true,
      vc: true,
    }, 'arvn', 'nva', {
      globalVars: {
        arvnResources: 2,
      },
      zones: {
        [QUANG_NAM]: [
          makeToken('honolulu-arvn-t-1', 'troops', 'ARVN'),
          makeToken('honolulu-arvn-p-1', 'police', 'ARVN'),
        ],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        [QUANG_NAM]: { terrorCount: 0 },
      },
    });

    const eventMove = findEventMove(def, setup, 'aid-minus-10-patronage-minus-5');
    assert.notEqual(eventMove, undefined, 'Expected card-64 ARVN event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.equal(afterEvent.currentPhase, 'honoluluPacify');
    assert.equal(afterEvent.globalVars.aid, 20);
    assert.equal(afterEvent.globalVars.patronage, 7);

    const interruptMoves = legalMoves(def, afterEvent);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'coupPacifyUS'), false);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'coupPacifyARVN'), false, 'ARVN should have no pacify move when it cannot pay the cost');
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'resolveHonoluluPacify'), true);

    const final = applyMove(def, afterEvent, {
      actionId: asActionId('resolveHonoluluPacify'),
      params: {},
    }).state;
    assert.equal(final.currentPhase, 'main');
    assert.equal(final.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(final).currentCard.firstEligible, 'nva');
  });

  it('Insurgent execution applies deltas, skips the pacify interrupt, and keeps the executing faction eligible for the next card', () => {
    const def = compileDef();
    const setup = setupCard64State(def, 64003, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'nva', 'vc');

    const eventMove = findEventMove(def, setup, 'aid-minus-10-patronage-plus-3');
    assert.notEqual(eventMove, undefined, 'Expected card-64 NVA event move');

    const result = applyMove(def, setup, eventMove!);
    const final = result.state;
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(final.currentPhase, 'main');
    assert.equal(final.globalVars.aid, 20);
    assert.equal(final.globalVars.patronage, 15);
    assert.equal(final.activePlayer, asPlayerId(3));
    assert.deepEqual(runtime.pendingEligibilityOverrides ?? [], [
      { seat: 'nva', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);

    const overrideCreate = result.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.deepEqual(
      (overrideCreate as { overrides?: readonly unknown[] } | undefined)?.overrides,
      [{ seat: 'nva', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
    );
  });
});
