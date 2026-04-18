// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  assertEventText,
  findTokenInZone,
  getEventCard,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-111';

// Jungle spaces
const TAY_NINH = 'tay-ninh:none'; // jungle, pop 2
const CENTRAL_LAOS = 'central-laos:none'; // jungle, pop 0
const QUANG_DUC = 'quang-duc-long-khanh:none'; // jungle, pop 1

// Highland spaces
const PLEIKU_DARLAC = 'pleiku-darlac:none'; // highland, pop 1
const BINH_DINH = 'binh-dinh:none'; // highland, pop 2

// Non-jungle/highland
const SAIGON = 'saigon:none'; // city, terrainTags: [], pop 6
const KIEN_PHONG = 'kien-phong:none'; // lowland, pop 2

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

describe('FITL card-111 Agent Orange', () => {
  it('card structure: text, sideMode, seatOrder, grants, and lasting effects', () => {
    const def = compileDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Agent Orange');
    assert.equal(card.sideMode, 'dual');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'US', 'NVA']);

    assertEventText(def, CARD_ID, {
      unshaded: 'All Insurgents in Jungle go Active. US free Air Strikes among up to any 2 Jungle spaces (no effect on Trail).',
      shaded: 'Jungle and Highland with Insurgents 1 level toward Active Opposition.',
    });

    // Verify freeOperationGrants structure
    const grants = card.unshaded?.freeOperationGrants ?? [];
    assert.equal(grants.length, 1, 'Expected exactly 1 free operation grant');
    assert.equal(grants[0]?.seat, 'us');
    assert.deepEqual(grants[0]?.actionIds, ['airStrike']);
    assert.equal(grants[0]?.allowDuringMonsoon, true);

    // Verify lastingEffects structure
    const lasting = card.unshaded?.lastingEffects ?? [];
    assert.equal(lasting.length, 1, 'Expected exactly 1 lasting effect');
    assert.equal(lasting[0]?.id, 'evt-agent-orange-window');
    assert.equal(lasting[0]?.duration, 'turn');
  });

  it('unshaded: activates underground guerrillas in Jungle spaces', () => {
    const def = compileDef();
    const state = setupFitlEventState(def, {
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('vc-g-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('nva-g-1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeFitlToken('vc-g-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [CENTRAL_LAOS]: [
          makeFitlToken('vc-g-3', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('nva-g-2', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
      },
    });

    const after = runEvent(def, state, CARD_ID, 'unshaded').state;

    // Tay Ninh underground guerrillas -> active
    const vcG1 = findTokenInZone(after, TAY_NINH, 'vc-g-1');
    assert.equal(vcG1?.props.activity, 'active', 'Underground VC guerrilla in Tay Ninh should become active');

    const nvaG1 = findTokenInZone(after, TAY_NINH, 'nva-g-1');
    assert.equal(nvaG1?.props.activity, 'active', 'Underground NVA guerrilla in Tay Ninh should become active');

    // Already-active guerrilla unchanged
    const vcG2 = findTokenInZone(after, TAY_NINH, 'vc-g-2');
    assert.equal(vcG2?.props.activity, 'active', 'Already-active guerrilla should remain active');

    // Central Laos (pop 0, still jungle) underground guerrillas -> active
    const vcG3 = findTokenInZone(after, CENTRAL_LAOS, 'vc-g-3');
    assert.equal(vcG3?.props.activity, 'active', 'Underground VC guerrilla in Central Laos should become active');

    const nvaG2 = findTokenInZone(after, CENTRAL_LAOS, 'nva-g-2');
    assert.equal(nvaG2?.props.activity, 'active', 'Underground NVA guerrilla in Central Laos should become active');
  });

  it('unshaded: non-Jungle guerrillas remain underground', () => {
    const def = compileDef();
    const state = setupFitlEventState(def, {
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SAIGON]: [
          makeFitlToken('vc-g-saigon', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('vc-g-bd', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    });

    const after = runEvent(def, state, CARD_ID, 'unshaded').state;

    const vcSaigon = findTokenInZone(after, SAIGON, 'vc-g-saigon');
    assert.equal(vcSaigon?.props.activity, 'underground', 'City guerrilla should remain underground');

    const vcBD = findTokenInZone(after, BINH_DINH, 'vc-g-bd');
    assert.equal(vcBD?.props.activity, 'underground', 'Highland guerrilla should remain underground');
  });

  it('unshaded: Air Strike window mode 3 restricts to Jungle, max 2 spaces', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected first event deck');

    const base = clearAllZones(initialState(def, 11101, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'us',
            secondEligible: 'nva',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeFitlToken(CARD_ID, 'card', 'none')],
        [TAY_NINH]: [
          makeFitlToken('nva-t-1', 'troops', 'NVA'),
          makeFitlToken('vc-g-a-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [QUANG_DUC]: [
          makeFitlToken('nva-t-2', 'troops', 'NVA'),
          makeFitlToken('vc-g-a-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('nva-t-3', 'troops', 'NVA'),
          makeFitlToken('vc-g-a-3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    };

    // Apply event
    const eventMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event' &&
        move.params.eventCardId === CARD_ID &&
        move.params.side === 'unshaded',
    );
    assert.notEqual(eventMove, undefined, 'Expected card-111 unshaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    assert.equal(afterEvent.globalVars.fitl_airStrikeWindowMode, 3, 'Agent Orange should set window mode to 3');

    const pendingGrants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingGrants.length, 1, 'Should queue exactly one free operation grant');
    assert.equal(pendingGrants[0]?.seat, 'us', 'Grant must belong to US seat');
    assert.deepEqual(pendingGrants[0]?.actionIds, ['airStrike']);
    assert.equal(pendingGrants[0]?.allowDuringMonsoon, true);

    // Set up for free Air Strike resolution
    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'us',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrike = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrike, undefined, 'Expected free Air Strike legal move during Agent Orange window');

    // Highland space should be rejected
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrike!,
          params: { ...freeAirStrike!.params, $spaces: [BINH_DINH] },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Agent Orange must reject non-Jungle targets',
    );

    // 2 Jungle spaces should be accepted
    const afterFreeStrike = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrike!,
      params: { ...freeAirStrike!.params, $spaces: [TAY_NINH, QUANG_DUC] },
    }).state;

    assert.equal(
      afterFreeStrike.globalVars.fitl_airStrikeWindowMode,
      0,
      'Window mode should close after grant resolution',
    );
    assert.deepEqual(
      requireCardDrivenRuntime(afterFreeStrike).pendingFreeOperationGrants ?? [],
      [],
      'Free operation grant should be consumed',
    );
  });

  it('unshaded: Trail unchanged during mode 3 Air Strike', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const base = clearAllZones(initialState(def, 11102, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'us',
            secondEligible: 'nva',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeFitlToken(CARD_ID, 'card', 'none')],
        [TAY_NINH]: [
          makeFitlToken('nva-t-1', 'troops', 'NVA'),
          makeFitlToken('nva-t-2', 'troops', 'NVA'),
          makeFitlToken('vc-g-a-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    };

    const eventMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event' &&
        move.params.eventCardId === CARD_ID &&
        move.params.side === 'unshaded',
    );
    assert.notEqual(eventMove, undefined);

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'us',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrike = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrike, undefined);

    const afterFreeStrike = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrike!,
      params: { ...freeAirStrike!.params, $spaces: [TAY_NINH] },
    }).state;

    assert.equal(afterFreeStrike.globalVars.trail, 3, 'Trail should be unchanged after mode 3 Air Strike');
  });

  it('shaded: Jungle and Highland with insurgents shift 1 level toward Active Opposition', () => {
    const def = compileDef();
    const state = setupFitlEventState(def, {
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Jungle, pop 2 — has insurgent
        [TAY_NINH]: [
          makeFitlToken('vc-g-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        // Highland, pop 1 — has NVA troops (still counts as insurgent presence)
        [PLEIKU_DARLAC]: [
          makeFitlToken('nva-t-1', 'troops', 'NVA'),
        ],
        // Highland, pop 2 — NO insurgents
        [BINH_DINH]: [
          makeFitlToken('us-t-1', 'troops', 'US'),
        ],
        // Lowland, pop 2 — has insurgent, but not jungle/highland
        [KIEN_PHONG]: [
          makeFitlToken('vc-g-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      markers: {
        [TAY_NINH]: { supportOpposition: 'neutral' },
        [PLEIKU_DARLAC]: { supportOpposition: 'passiveSupport' },
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
        [KIEN_PHONG]: { supportOpposition: 'neutral' },
      },
    });

    const after = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(
      after.markers?.[TAY_NINH]?.supportOpposition,
      'passiveOpposition',
      'Tay Ninh (jungle, pop 2, with insurgent) should shift from neutral toward Active Opposition',
    );
    assert.equal(
      after.markers?.[PLEIKU_DARLAC]?.supportOpposition,
      'neutral',
      'Pleiku-Darlac (highland, pop 1, with NVA troops) should shift from passiveSupport toward Active Opposition',
    );
    assert.equal(
      after.markers?.[BINH_DINH]?.supportOpposition,
      'passiveSupport',
      'Binh Dinh (highland, pop 2, no insurgents) should be unchanged',
    );
    assert.equal(
      after.markers?.[KIEN_PHONG]?.supportOpposition,
      'neutral',
      'Kien Phong (lowland, pop 2, with insurgent) should be unchanged — not jungle/highland',
    );
  });

  it('shaded: pop-0 Jungle spaces are excluded from shift', () => {
    const def = compileDef();
    const state = setupFitlEventState(def, {
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [CENTRAL_LAOS]: [
          makeFitlToken('vc-g-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      markers: {
        [CENTRAL_LAOS]: { supportOpposition: 'neutral' },
      },
    });

    const after = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(
      after.markers?.[CENTRAL_LAOS]?.supportOpposition,
      'neutral',
      'Central Laos (jungle, pop 0) should not be shifted — pop-0 filter excludes it',
    );
  });

  it('shaded: Active Opposition clamps safely (no-op)', () => {
    const def = compileDef();
    const state = setupFitlEventState(def, {
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('vc-g-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      markers: {
        [TAY_NINH]: { supportOpposition: 'activeOpposition' },
      },
    });

    const after = runEvent(def, state, CARD_ID, 'shaded').state;

    assert.equal(
      after.markers?.[TAY_NINH]?.supportOpposition,
      'activeOpposition',
      'Already at Active Opposition — shift should be safe no-op',
    );
  });
});
