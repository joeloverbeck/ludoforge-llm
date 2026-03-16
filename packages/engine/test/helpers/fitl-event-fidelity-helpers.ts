import * as assert from 'node:assert/strict';

import {
  asPlayerId,
  asTokenId,
  legalMoves,
  type ApplyMoveResult,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import {
  applyMoveWithResolvedDecisionIds,
  type ResolveDecisionParamsOptions,
} from './decision-param-helpers.js';
import {
  makeIsolatedInitialState,
  type IsolatedStateTurnOrderMode,
} from './isolated-state-helpers.js';
import { getFitlProductionFixture } from './production-spec-helpers.js';

export type FitlEventSide = 'unshaded' | 'shaded';

export interface FitlEventStateOptions {
  readonly seed?: number;
  readonly playerCount?: number;
  readonly activePlayer?: number;
  readonly turnOrderMode?: IsolatedStateTurnOrderMode;
  readonly cardIdInDiscardZone?: string;
  readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  readonly globalVars?: Readonly<Record<string, number>>;
  readonly globalMarkers?: Readonly<Record<string, string>>;
  readonly zoneVars?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const getFitlEventFixture = () => getFitlProductionFixture();

export const getFitlEventDef = (): GameDef => getFitlEventFixture().gameDef;

export const makeFitlToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

export const setupFitlEventState = (
  def: GameDef,
  options: FitlEventStateOptions = {},
): GameState => {
  const base = makeIsolatedInitialState(def, options.seed ?? 1, options.playerCount ?? 4, {
    turnOrderMode: options.turnOrderMode ?? 'roundRobin',
  });
  const eventDeck = def.eventDecks?.[0];
  const discardToken = options.cardIdInDiscardZone === undefined || eventDeck === undefined
    ? {}
    : {
        [eventDeck.discardZone]: [makeFitlToken(options.cardIdInDiscardZone, 'card', 'none')],
      };

  return {
    ...base,
    activePlayer: asPlayerId(options.activePlayer ?? 0),
    globalVars: {
      ...base.globalVars,
      ...(options.globalVars ?? {}),
    },
    globalMarkers: {
      ...(base.globalMarkers ?? {}),
      ...(options.globalMarkers ?? {}),
    },
    zoneVars: {
      ...base.zoneVars,
      ...(options.zoneVars ?? {}),
    },
    markers: {
      ...base.markers,
      ...(options.markers ?? {}),
    },
    zones: {
      ...base.zones,
      ...discardToken,
      ...(options.zoneTokens ?? {}),
    },
  };
};

export const getEventCard = (def: GameDef, cardId: string) => {
  const card = def.eventDecks?.flatMap((deck) => deck.cards).find((entry) => entry.id === cardId);
  if (card === undefined) {
    assert.fail(`Expected event card ${cardId}`);
  }
  return card;
};

export const assertEventText = (
  def: GameDef,
  cardId: string,
  expected: {
    readonly title?: string;
    readonly unshaded?: string;
    readonly shaded?: string;
  },
): void => {
  const card = getEventCard(def, cardId);
  if (expected.title !== undefined) {
    assert.equal(card.title, expected.title);
  }
  if (expected.unshaded !== undefined) {
    assert.equal(card.unshaded?.text, expected.unshaded);
  }
  if (expected.shaded !== undefined) {
    assert.equal(card.shaded?.text, expected.shaded);
  }
};

export const findEventMove = (
  def: GameDef,
  state: GameState,
  cardId: string,
  side: FitlEventSide,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.eventCardId === cardId
      && move.params.side === side,
  );

export const requireEventMove = (
  def: GameDef,
  state: GameState,
  cardId: string,
  side: FitlEventSide,
): Move => {
  const move = findEventMove(def, state, cardId, side);
  if (move === undefined) {
    assert.fail(`Expected ${cardId} ${side} event move`);
  }
  return move;
};

export const runEvent = (
  def: GameDef,
  state: GameState,
  cardId: string,
  side: FitlEventSide,
  options?: ResolveDecisionParamsOptions,
): ApplyMoveResult => applyMoveWithResolvedDecisionIds(def, state, requireEventMove(def, state, cardId, side), options);

export const tokenIdsInZone = (state: GameState, zoneId: string): Set<string> =>
  new Set((state.zones[zoneId] ?? []).map((token) => String((token as Token).id)));

export const countTokensInZone = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

export const findTokenInZone = (
  state: GameState,
  zoneId: string,
  tokenId: string,
): Token | undefined =>
  (state.zones[zoneId] ?? []).find((token) => String((token as Token).id) === asTokenId(tokenId)) as Token | undefined;

/**
 * Set a single marker to the same value on every zone matching a category filter.
 * Useful for neutralizing default marker eligibility in shaded event tests —
 * e.g., set all provinces to `activeOpposition` so `markerShiftAllowed(delta: -2)` returns false,
 * then selectively override the provinces you want eligible.
 */
export const withCategoryMarker = (
  def: GameDef,
  state: GameState,
  category: string,
  marker: string,
  value: string,
): GameState => {
  const overrides: Record<string, Record<string, string>> = {};
  for (const zone of def.zones) {
    if (zone.category === category) {
      overrides[zone.id] = {
        ...(state.markers?.[zone.id] ?? {}),
        [marker]: value,
      };
    }
  }
  return {
    ...state,
    markers: {
      ...state.markers,
      ...overrides,
    },
  };
};

export const assertNoOpEvent = (
  def: GameDef,
  state: GameState,
  cardId: string,
  side: FitlEventSide,
  options?: ResolveDecisionParamsOptions,
): ApplyMoveResult => {
  const result = runEvent(def, state, cardId, side, options);
  assert.deepEqual(result.state.zones, state.zones, `${cardId} ${side} should not change zones`);
  assert.deepEqual(result.state.markers, state.markers, `${cardId} ${side} should not change markers`);
  assert.deepEqual(result.state.globalVars, state.globalVars, `${cardId} ${side} should not change global vars`);
  assert.deepEqual(result.state.zoneVars, state.zoneVars, `${cardId} ${side} should not change zone vars`);
  assert.deepEqual(result.state.globalMarkers, state.globalMarkers, `${cardId} ${side} should not change global markers`);
  return result;
};
