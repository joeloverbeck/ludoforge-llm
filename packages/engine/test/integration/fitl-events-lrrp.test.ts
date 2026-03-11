import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-26';
const SHIFT_SPACE_A = 'quang-tri-thua-thien:none';
const SHIFT_SPACE_B = 'quang-nam:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
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

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const mapUsIrregularPlacementZones = (def: GameDef, state: GameState): string[] => {
  const mapZoneIds = new Set(
    def.zones.filter((zone) => zone.zoneKind === 'board').map((zone) => String(zone.id)),
  );
  return Object.entries(state.zones).flatMap(([zone, tokens]) =>
    !mapZoneIds.has(zone)
      ? []
      : (tokens as Token[])
        .filter((token) => token.type === 'irregular' && token.props.faction === 'US')
        .map(() => zone),
  );
};

const findCard26Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.eventCardId === CARD_ID &&
      move.params.side === side,
  );

describe('FITL card-26 LRRP', () => {
  it('encodes seat order, exact rules text, outside-South Irregular placement, and unrestricted free Air Strike grant', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'LRRP');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.equal(card?.metadata?.flavorText, 'Long Range Recon Patrol.');
    assert.equal(card?.unshaded?.text, 'US places 3 Irregulars outside the South then free Air Strikes.');
    assert.equal(
      card?.shaded?.text,
      'Patrols ambushed: 3 Irregulars map to Casualties. Shift each space they were in 1 level toward Active Opposition.',
    );

    const grant = card?.unshaded?.freeOperationGrants?.[0];
    assert.notEqual(grant, undefined, 'Expected unshaded free Air Strike grant');
    assert.equal(grant?.seat, 'us');
    assert.equal(grant?.operationClass, 'operation');
    assert.deepEqual(grant?.actionIds, ['airStrike']);
    assert.equal(grant?.zoneFilter, undefined, 'LRRP Air Strike should follow normal Air Strike target rules');
  });

  it('encodes LRRP unshaded/shaded minute structure details in the production AST', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);
    const card = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-26 parsed definition');

    const unshadedCap = findDeep(card?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { let?: { bind?: string; value?: { if?: { when?: { right?: unknown }; then?: unknown } } } };
      return candidate.let?.bind === '$irregularsToPlaceCount'
        && candidate.let.value?.if?.when?.right === 3
        && candidate.let.value?.if?.then === 3;
    });
    const unshadedPlacementSelector = findDeep(card?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { macro?: string };
      return candidate.macro === 'select-laos-cambodia-province';
    });
    const unshadedExactPlacementCount = findDeep(card?.unshaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { chooseN?: { bind?: string; min?: unknown; max?: unknown } };
      return candidate.chooseN?.bind === '$irregularsToPlace'
        && JSON.stringify(candidate.chooseN.min) === JSON.stringify({ ref: 'binding', name: '$irregularsToPlaceCount' })
        && JSON.stringify(candidate.chooseN.max) === JSON.stringify({ ref: 'binding', name: '$irregularsToPlaceCount' });
    });

    const shadedCap = findDeep(card?.shaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { let?: { bind?: string; value?: { if?: { when?: { right?: unknown }; then?: unknown } } } };
      return candidate.let?.bind === '$irregularsToCasualtiesCount'
        && candidate.let.value?.if?.when?.right === 3
        && candidate.let.value?.if?.then === 3;
    });
    const shadedMapOnlySelector = findDeep(card?.shaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { chooseN?: { bind?: string; options?: { query?: string } } };
      return candidate.chooseN?.bind === '$irregularsToCasualties'
        && candidate.chooseN?.options?.query === 'tokensInMapSpaces';
    });
    const shadedUniqueSourceShift = findDeep(card?.shaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { forEach?: { bind?: string; over?: { query?: string }; effects?: unknown[] } };
      return candidate.forEach?.bind === '$sourceSpace'
        && candidate.forEach?.over?.query === 'tokenZones'
        && findDeep(candidate.forEach.effects ?? [], (inner: unknown) => {
          const innerCandidate = inner as { macro?: string; args?: { space?: unknown; deltaExpr?: unknown } };
          return innerCandidate.macro === 'shift-support-opposition'
            && innerCandidate.args?.space === '$sourceSpace'
            && innerCandidate.args?.deltaExpr === -1;
        }).length > 0;
    });

    assert.equal(unshadedCap.length > 0, true, 'LRRP unshaded should cap placement at 3 or fewer available Irregulars');
    assert.equal(unshadedPlacementSelector.length > 0, true, 'LRRP unshaded should select a Laos/Cambodia province for each placed Irregular');
    assert.equal(unshadedExactPlacementCount.length > 0, true, 'LRRP unshaded should place exactly the chosen Irregular count');
    assert.equal(shadedCap.length > 0, true, 'LRRP shaded should cap casualties at 3 or fewer map Irregulars');
    assert.equal(shadedMapOnlySelector.length > 0, true, 'LRRP shaded should select Irregulars only from map spaces');
    assert.equal(shadedUniqueSourceShift.length > 0, true, 'LRRP shaded should shift each source space once via tokenZones before moving casualties');
  });

  it('unshaded defines Laos/Cambodia province placement and queues a normal free Air Strike grant', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 2601, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'us',
            secondEligible: 'vc',
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
        'available-US:none': [
          makeToken('lrrp-irregular-1', 'irregular', 'US'),
          makeToken('lrrp-irregular-2', 'irregular', 'US'),
          makeToken('lrrp-irregular-3', 'irregular', 'US'),
        ],
      },
    };

    const unshadedMove = findCard26Move(def, setup, 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected card-26 unshaded event move');
    const card = eventDeck!.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-26 definition');
    assert.deepEqual(card?.unshaded?.freeOperationGrants?.[0]?.actionIds, ['airStrike']);
    assert.equal(card?.unshaded?.freeOperationGrants?.[0]?.zoneFilter, undefined, 'LRRP free Air Strike should follow normal targeting');
  });

  it('unshaded places all available US Irregulars when fewer than 3 are available (0/1/2) and still grants free Air Strike', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    for (const availableCount of [0, 1, 2]) {
      const base = clearAllZones(initialState(def, 2610 + availableCount, 4).state);
      const availableIrregulars = Array.from({ length: availableCount }, (_, index) =>
        makeToken(`lrrp-limited-irregular-${availableCount}-${index + 1}`, 'irregular', 'US'),
      );
      const setup: GameState = {
        ...base,
        activePlayer: asPlayerId(0),
        turnOrderState: {
          type: 'cardDriven',
          runtime: {
            ...requireCardDrivenRuntime(base),
            currentCard: {
              ...requireCardDrivenRuntime(base).currentCard,
              firstEligible: 'us',
              secondEligible: 'vc',
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
          'available-US:none': availableIrregulars,
        },
      };

      const unshadedMove = findCard26Move(def, setup, 'unshaded');
      assert.notEqual(unshadedMove, undefined, `Expected card-26 unshaded event move for available count ${availableCount}`);

      const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, unshadedMove!).state;
      const placedZones = mapUsIrregularPlacementZones(def, afterEvent);
      const remainingAvailableIrregulars = countZoneTokens(
        afterEvent,
        'available-US:none',
        (token) => token.type === 'irregular' && token.props.faction === 'US',
      );

      assert.equal(
        placedZones.length,
        availableCount,
        `Expected LRRP to place exactly ${availableCount} US Irregulars when only ${availableCount} are available`,
      );
      assert.equal(
        remainingAvailableIrregulars,
        0,
        `Expected no US Irregulars to remain Available after LRRP with ${availableCount} available`,
      );
      for (const zoneId of placedZones) {
        const zone = def.zones.find((entry) => String(entry.id) === String(zoneId));
        assert.notEqual(zone, undefined, `Expected placed Irregular zone ${zoneId} to exist in GameDef`);
        assert.equal(zone?.category, 'province', `Expected LRRP placement destination ${zoneId} to be a Province`);
        assert.ok(
          zone?.attributes?.country === 'laos' || zone?.attributes?.country === 'cambodia',
          `Expected LRRP placement destination ${zoneId} to be in Laos or Cambodia`,
        );
      }

      const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
      assert.equal(pendingAfterEvent.length, 1, `Expected one pending free operation grant for available count ${availableCount}`);
      assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['airStrike']);
    }
  });

  it('shaded maps exactly 3 US Irregulars to Casualties and shifts each affected source space once', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 2602, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        [SHIFT_SPACE_A]: { ...(base.markers[SHIFT_SPACE_A] ?? {}), supportOpposition: 'activeSupport' },
        [SHIFT_SPACE_B]: { ...(base.markers[SHIFT_SPACE_B] ?? {}), supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [SHIFT_SPACE_A]: [
          makeToken('lrrp-shaded-a-1', 'irregular', 'US'),
          makeToken('lrrp-shaded-a-2', 'irregular', 'US'),
        ],
        [SHIFT_SPACE_B]: [
          makeToken('lrrp-shaded-b-1', 'irregular', 'US'),
        ],
      },
    };

    const shadedMove = findCard26Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-26 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!).state;

    assert.equal(
      countZoneTokens(final, 'casualties-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      3,
      'Shaded LRRP should move 3 US Irregulars to casualties-US:none',
    );
    assert.equal(
      countZoneTokens(final, SHIFT_SPACE_A, (token) => token.type === 'irregular' && token.props.faction === 'US'),
      0,
      'Shaded LRRP should remove selected Irregulars from first source space',
    );
    assert.equal(
      countZoneTokens(final, SHIFT_SPACE_B, (token) => token.type === 'irregular' && token.props.faction === 'US'),
      0,
      'Shaded LRRP should remove selected Irregulars from second source space',
    );

    assert.equal(
      final.markers[SHIFT_SPACE_A]?.supportOpposition,
      'passiveSupport',
      'Source space with two removed Irregulars should shift only once toward Active Opposition',
    );
    assert.equal(
      final.markers[SHIFT_SPACE_B]?.supportOpposition,
      'neutral',
      'Second affected source space should shift one level toward Active Opposition',
    );
  });

  it('shaded removes fewer than 3 Irregulars when fewer exist and still shifts each affected space once', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 2603, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        [SHIFT_SPACE_A]: { ...(base.markers[SHIFT_SPACE_A] ?? {}), supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [SHIFT_SPACE_A]: [
          makeToken('lrrp-fewer-a-1', 'irregular', 'US'),
          makeToken('lrrp-fewer-a-2', 'irregular', 'US'),
        ],
      },
    };

    const shadedMove = findCard26Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-26 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!).state;

    assert.equal(
      countZoneTokens(final, 'casualties-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      2,
      'Shaded LRRP should remove all available map Irregulars when fewer than 3 exist',
    );
    assert.equal(
      final.markers[SHIFT_SPACE_A]?.supportOpposition,
      'passiveOpposition',
      'Single affected source space should shift once even when multiple Irregulars are removed there',
    );
  });
});
