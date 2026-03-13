import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  parseDecisionKey,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-80';
const HUE = 'hue:none';
const SAIGON = 'saigon:none';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';

const decisionIndex = (decisionKey: string): number => {
  const parsed = parseDecisionKey(decisionKey as Parameters<typeof parseDecisionKey>[0]);
  if (parsed === null) {
    return -1;
  }
  const match = parsed.iterationPath.match(/\[(\d+)\]$/u);
  return match === null ? 0 : Number.parseInt(match[1]!, 10);
};

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, unknown>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const countFactionType = (state: GameState, zone: string, faction: string, type: string): number =>
  (state.zones[zone] ?? []).filter((token) => token.props.faction === faction && token.type === type).length;

const findCard80Move = (def: GameDef, state: GameState): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === 'unshaded'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  overrides: {
    readonly patronage?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly activePlayer?: 0 | 1 | 2 | 3;
    readonly firstEligible?: 'arvn' | 'nva' | 'vc' | 'us';
    readonly secondEligible?: 'arvn' | 'nva' | 'vc' | 'us' | null;
  } = {},
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  assert.equal(base.turnOrderState.type, 'cardDriven');
  const runtime = requireCardDrivenRuntime(base);

  return {
    ...base,
    activePlayer: asPlayerId(overrides.activePlayer ?? 1),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: overrides.firstEligible ?? 'arvn',
          secondEligible: overrides.secondEligible ?? 'nva',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    globalVars: {
      ...base.globalVars,
      patronage: overrides.patronage ?? 10,
    },
    markers: {
      ...base.markers,
      ...(overrides.markers ?? {}),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(overrides.zoneTokens ?? {}),
    },
  };
};

describe('FITL card-80 Light at the End of the Tunnel', () => {
  it('encodes exact text, remain-eligible override, and the per-piece removal/shift/placement structure in data', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Light at the End of the Tunnel');
    assert.equal(card?.sideMode, 'single');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'VC', 'US']);
    assert.equal(card?.metadata?.flavorText, 'Wind down seen.');
    assert.equal(
      card?.unshaded?.text,
      'Remove 1-4 US pieces from map to Available. For each piece, Patronage +2, shift a space 1 level toward Active Opposition, and place 4 NVA Troops outside the South. Stay Eligible.',
    );
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);

    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(parsedCard, undefined, 'Expected parsed card-80 definition');

    const usRemovalSelector = findDeep(parsedCard?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { chooseN?: { bind?: string; options?: { query?: string; filter?: Record<string, unknown> } } };
      return candidate.chooseN?.bind === '$usPiecesToRemove'
        && candidate.chooseN?.options?.query === 'tokensInMapSpaces'
        && JSON.stringify(candidate.chooseN?.options?.filter ?? {}).includes('"value":"US"');
    });
    const outsideSouthProvinceDestination = findDeep(parsedCard?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { chooseOne?: { options?: { filter?: Record<string, unknown> } } };
      return JSON.stringify(candidate.chooseOne?.options?.filter ?? {}).includes('"fitl-space-outside-south-province"');
    });
    const supportShift = findDeep(parsedCard?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { shiftMarker?: { marker?: string; delta?: number } };
      return candidate.shiftMarker?.marker === 'supportOpposition'
        && candidate.shiftMarker?.delta === -1;
    });

    assert.equal(usRemovalSelector.length > 0, true, 'Expected chooseN over map US pieces');
    assert.equal(outsideSouthProvinceDestination.length > 0, true, 'Expected outside-South province destination selection');
    assert.equal(supportShift.length > 0, true, 'Expected per-piece support/opposition shift helper');
  });

  it('removes selected US pieces including bases, applies patronage and shifts per piece, places 4 NVA troops per piece, and keeps the executor eligible', () => {
    const def = compileDef();
    const usTroop = makeToken('card80-us-troop', 'troops', 'US');
    const usBase = makeToken('card80-us-base', 'base', 'US');
    const nvaTroops = Array.from({ length: 8 }, (_, index) => makeToken(`card80-nva-${index + 1}`, 'troops', 'NVA'));

    const setup = setupCardDrivenState(def, 80001, {
      patronage: 12,
      zoneTokens: {
        [HUE]: [usTroop],
        [SAIGON]: [usBase],
        'available-NVA:none': nvaTroops,
      },
      markers: {
        [HUE]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    });

    const move = findCard80Move(def, setup);
    assert.notEqual(move, undefined, 'Expected card-80 event move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending card-80 US removal selection.');
    }
    assert.equal(pending.type, 'chooseN');
    assert.equal(decisionIndex(pending.decisionKey), 0, 'First top-level removal choice should expose canonical index 0');
    assert.equal(pending.min, 1);
    assert.equal(pending.max, 2);
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      [usBase.id, usTroop.id].sort(),
      'Only on-map US pieces should be removable and bases must be eligible',
    );

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usPiecesToRemove',
        value: [usTroop.id, usBase.id],
      },
      {
        when: (request) => request.name === `$oppositionShiftSpace@${usTroop.id}`,
        value: HUE,
      },
      {
        when: (request) => request.name === `$oppositionShiftSpace@${usBase.id}`,
        value: SAIGON,
      },
      {
        when: (request) => request.name === `$nvaTroopsToPlace@${usTroop.id}`,
        value: ['card80-nva-1', 'card80-nva-2', 'card80-nva-3', 'card80-nva-4'],
      },
      {
        when: (request) => request.name === `$nvaTroopsToPlace@${usBase.id}`,
        value: ['card80-nva-5', 'card80-nva-6', 'card80-nva-7', 'card80-nva-8'],
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-troop}'
          && decisionIndex(request.decisionKey) === 0,
        value: NORTH_VIETNAM,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-troop}'
          && decisionIndex(request.decisionKey) === 1,
        value: NORTH_VIETNAM,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-troop}'
          && decisionIndex(request.decisionKey) === 2,
        value: CENTRAL_LAOS,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-troop}'
          && decisionIndex(request.decisionKey) === 3,
        value: CENTRAL_LAOS,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-base}'
          && decisionIndex(request.decisionKey) === 0,
        value: CENTRAL_LAOS,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-base}'
          && decisionIndex(request.decisionKey) === 1,
        value: NORTHEAST_CAMBODIA,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-base}'
          && decisionIndex(request.decisionKey) === 2,
        value: NORTHEAST_CAMBODIA,
      },
      {
        when: (request) =>
          request.name === '$nvaTroopDestination@{$nvaTroopToPlace@card80-us-base}'
          && decisionIndex(request.decisionKey) === 3,
        value: NORTHEAST_CAMBODIA,
      },
    ];
    const first = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides });
    const afterEvent = first.state;

    assert.equal(countFactionType(afterEvent, HUE, 'US', 'troops'), 0, 'Selected US troop should leave the map');
    assert.equal(countFactionType(afterEvent, SAIGON, 'US', 'base'), 0, 'Selected US base should leave the map');
    assert.equal(countFactionType(afterEvent, 'available-US:none', 'US', 'troops'), 1, 'Removed US troop should go to Available');
    assert.equal(countFactionType(afterEvent, 'available-US:none', 'US', 'base'), 1, 'Removed US base should go to Available');
    assert.equal(afterEvent.globalVars.patronage, 16, 'Patronage should increase by 4 for two removed US pieces');
    assert.equal(afterEvent.markers[HUE]?.supportOpposition, 'neutral', 'Hue should shift one level toward Active Opposition');
    assert.equal(afterEvent.markers[SAIGON]?.supportOpposition, 'passiveOpposition', 'Saigon should shift one level toward Active Opposition');
    assert.equal(countFactionType(afterEvent, NORTH_VIETNAM, 'NVA', 'troops'), 2, 'Occurrence-aware overrides should allow per-prompt destination choices');
    assert.equal(countFactionType(afterEvent, CENTRAL_LAOS, 'NVA', 'troops'), 3, 'Occurrence-aware overrides should allow per-prompt destination choices');
    assert.equal(countFactionType(afterEvent, NORTHEAST_CAMBODIA, 'NVA', 'troops'), 3, 'Occurrence-aware overrides should allow per-prompt destination choices');
    assert.equal(countFactionType(afterEvent, 'available-NVA:none', 'NVA', 'troops'), 0, 'All eight selected NVA troops should leave Available');
    assert.deepEqual(
      requireCardDrivenRuntime(afterEvent).pendingEligibilityOverrides ?? [],
      [{ seat: 'arvn', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
      'Card should queue remain-eligible for the executing faction',
    );

    const passMove = legalMoves(def, afterEvent).find((candidate) => String(candidate.actionId) === 'pass');
    assert.notEqual(passMove, undefined, 'Expected a legal pass move for the second actor');
    const second = applyMove(def, afterEvent, passMove!);
    assert.equal(requireCardDrivenRuntime(second.state).eligibility.arvn, true, 'ARVN should remain eligible on the next card');
  });

  it('still grants patronage and partial troop placement when no space can shift and fewer than 4 NVA troops remain per removed piece', () => {
    const def = compileDef();
    const usTroop = makeToken('card80-edge-us', 'troops', 'US');
    const limitedNvaTroops = Array.from({ length: 3 }, (_, index) => makeToken(`card80-edge-nva-${index + 1}`, 'troops', 'NVA'));
    const setup = setupCardDrivenState(def, 80002, {
      patronage: 74,
      zoneTokens: {
        [HUE]: [usTroop],
        'available-NVA:none': limitedNvaTroops,
      },
      markers: {
        [HUE]: { supportOpposition: 'activeOpposition' },
      },
    });

    const move = findCard80Move(def, setup);
    assert.notEqual(move, undefined, 'Expected card-80 event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usPiecesToRemove',
          value: [usTroop.id],
        },
        {
          when: (request) => request.name === '$nvaTroopsToPlace@card80-edge-us',
          value: ['card80-edge-nva-1', 'card80-edge-nva-2', 'card80-edge-nva-3'],
        },
      ],
    }).state;

    assert.equal(final.globalVars.patronage, 75, 'Patronage should clamp at the global maximum');
    assert.equal(final.markers[HUE]?.supportOpposition, 'activeOpposition', 'Already-maxed Opposition spaces must not shift further');
    assert.equal(countFactionType(final, CENTRAL_LAOS, 'NVA', 'troops'), 3, 'Only available NVA troops should be placed when fewer than 4 exist');
    assert.equal(countFactionType(final, 'available-NVA:none', 'NVA', 'troops'), 0, 'All remaining available NVA troops should be consumed');
    assert.equal(countFactionType(final, 'available-US:none', 'US', 'troops'), 1, 'Removed US troop should still go to Available');
  });
});
