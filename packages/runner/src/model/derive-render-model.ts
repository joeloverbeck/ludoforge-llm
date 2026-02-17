import {
  asPlayerId,
  matchesAllTokenFilterPredicates,
  type GameDef,
  type GameState,
  type NumericTrackDef,
  type PlayerId,
  type RevealGrant,
  type Token,
} from '@ludoforge/engine';

import type {
  RenderAdjacency,
  RenderEventDeck,
  RenderGlobalMarker,
  RenderLastingEffect,
  RenderMapSpace,
  RenderMarker,
  RenderModel,
  RenderToken,
  RenderTrack,
  RenderVariable,
  RenderZone,
} from './render-model.js';
import type { RenderContext } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

const OWNER_ZONE_ID_PATTERN = /^.+:(\d+)$/;

interface StaticRenderDerivation {
  readonly mapSpaces: readonly RenderMapSpace[];
  readonly markerStatesById: ReadonlyMap<string, readonly string[]>;
  readonly globalMarkerStatesById: ReadonlyMap<string, readonly string[]>;
  readonly cardTitleById: ReadonlyMap<string, string>;
  readonly trackDefs: readonly NumericTrackDef[];
  readonly eventDecks: readonly GameDefEventDeckProjection[];
  readonly playedCardZoneId: string | null;
}

interface GameDefEventDeckProjection {
  readonly id: string;
  readonly displayName: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly cardsById: ReadonlyMap<string, string>;
}

export function deriveRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
): RenderModel {
  const staticDerivation = deriveStaticRenderDerivation(def);
  const zoneDerivation = deriveZones(state, def, context);
  const zones = zoneDerivation.zones;
  const tokens = deriveTokens(state, zones, zoneDerivation.visibleTokenIDsByZone);
  const adjacencies = deriveAdjacencies(def, zones);
  const globalVars = deriveGlobalVars(state);
  const playerVars = derivePlayerVars(state);
  const globalMarkers = deriveGlobalMarkers(state, staticDerivation.globalMarkerStatesById);
  const tracks = deriveTracks(state, staticDerivation.trackDefs);
  const activeEffects = deriveActiveEffects(state, staticDerivation.cardTitleById);
  const interruptStack = state.interruptPhaseStack ?? [];
  const eventDecks = deriveEventDecks(state, staticDerivation.eventDecks, staticDerivation.playedCardZoneId);

  return {
    zones: zones.map((zone) => ({
      ...zone,
      markers: deriveZoneMarkers(zone.id, state, staticDerivation.markerStatesById),
    })),
    adjacencies,
    mapSpaces: staticDerivation.mapSpaces,
    tokens,
    globalVars,
    playerVars,
    globalMarkers,
    tracks,
    activeEffects,
    players: [],
    activePlayerID: state.activePlayer,
    turnOrder: [],
    turnOrderType: state.turnOrderState.type,
    simultaneousSubmitted: deriveSimultaneousSubmitted(state),
    interruptStack,
    isInInterrupt: interruptStack.length > 0,
    phaseName: String(state.currentPhase),
    phaseDisplayName: formatIdAsDisplayName(String(state.currentPhase)),
    eventDecks,
    actionGroups: [],
    choiceBreadcrumb: [],
    currentChoiceOptions: null,
    currentChoiceDomain: null,
    choiceType: null,
    choiceMin: null,
    choiceMax: null,
    moveEnumerationWarnings: [],
    terminal: null,
  };
}

function deriveStaticRenderDerivation(def: GameDef): StaticRenderDerivation {
  const cardTitleById = new Map<string, string>();
  const eventDecks: GameDefEventDeckProjection[] = [];
  for (const deck of def.eventDecks ?? []) {
    const cardsById = new Map<string, string>();
    for (const card of deck.cards) {
      cardsById.set(card.id, card.title);
      cardTitleById.set(card.id, card.title);
    }

    eventDecks.push({
      id: deck.id,
      displayName: formatIdAsDisplayName(deck.id),
      drawZoneId: deck.drawZone,
      discardZoneId: deck.discardZone,
      cardsById,
    });
  }

  const playedCardZoneId = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardLifecycle.played
    : null;

  return {
    mapSpaces: deriveMapSpaces(def),
    markerStatesById: buildMarkerStatesById(def.markerLattices),
    globalMarkerStatesById: buildMarkerStatesById(def.globalMarkerLattices),
    cardTitleById,
    trackDefs: def.tracks ?? [],
    eventDecks,
    playedCardZoneId,
  };
}

function deriveGlobalVars(state: GameState): readonly RenderVariable[] {
  return Object.entries(state.globalVars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({
      name,
      value,
      displayName: formatIdAsDisplayName(name),
    }));
}

function derivePlayerVars(state: GameState): ReadonlyMap<PlayerId, readonly RenderVariable[]> {
  const numericPlayerIds = Object.keys(state.perPlayerVars)
    .map((playerId) => Number(playerId))
    .filter((playerId) => Number.isInteger(playerId) && playerId >= 0 && playerId < state.playerCount)
    .sort((left, right) => left - right);
  const playerVars = new Map<PlayerId, readonly RenderVariable[]>();

  for (const playerId of numericPlayerIds) {
    const playerEntry = state.perPlayerVars[String(playerId)] ?? {};
    const vars: readonly RenderVariable[] = Object.entries(playerEntry)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => ({
        name,
        value,
        displayName: formatIdAsDisplayName(name),
      }));

    playerVars.set(asPlayerId(playerId), vars);
  }

  return playerVars;
}

function buildMarkerStatesById(
  markerLattices: readonly { readonly id: string; readonly states: readonly string[] }[] | undefined,
): ReadonlyMap<string, readonly string[]> {
  const statesById = new Map<string, readonly string[]>();
  for (const lattice of markerLattices ?? []) {
    statesById.set(lattice.id, lattice.states);
  }
  return statesById;
}

function deriveZoneMarkers(
  zoneId: string,
  state: GameState,
  markerStatesById: ReadonlyMap<string, readonly string[]>,
): readonly RenderMarker[] {
  return Object.entries(state.markers[zoneId] ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, markerState]) => ({
      id,
      state: markerState,
      possibleStates: markerStatesById.get(id) ?? [],
    }));
}

function deriveGlobalMarkers(
  state: GameState,
  statesById: ReadonlyMap<string, readonly string[]>,
): readonly RenderGlobalMarker[] {
  return Object.entries(state.globalMarkers ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, markerState]) => ({
      id,
      state: markerState,
      possibleStates: statesById.get(id) ?? [],
    }));
}

function deriveTracks(state: GameState, trackDefs: readonly NumericTrackDef[]): readonly RenderTrack[] {
  return trackDefs.map((track) => ({
    id: track.id,
    displayName: formatIdAsDisplayName(track.id),
    scope: track.scope,
    faction: track.faction ?? null,
    min: track.min,
    max: track.max,
    currentValue: resolveTrackValue(state, track),
  }));
}

function resolveTrackValue(state: GameState, track: NumericTrackDef): number {
  if (track.scope === 'global') {
    const value = state.globalVars[track.id];
    return typeof value === 'number' ? value : track.min;
  }

  const faction = track.faction;
  if (faction === undefined || state.turnOrderState.type !== 'cardDriven') {
    return track.min;
  }

  const playerIndex = state.turnOrderState.runtime.factionOrder.indexOf(faction);
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= state.playerCount) {
    return track.min;
  }

  const value = state.perPlayerVars[String(playerIndex)]?.[track.id];
  return typeof value === 'number' ? value : track.min;
}

function deriveActiveEffects(
  state: GameState,
  cardTitleById: ReadonlyMap<string, string>,
): readonly RenderLastingEffect[] {
  return (state.activeLastingEffects ?? []).map((effect) => ({
    id: effect.id,
    sourceCardId: effect.sourceCardId,
    side: effect.side,
    duration: effect.duration,
    displayName: cardTitleById.get(effect.sourceCardId) ?? formatIdAsDisplayName(effect.sourceCardId),
  }));
}

function deriveEventDecks(
  state: GameState,
  eventDecks: readonly GameDefEventDeckProjection[],
  playedCardZoneId: string | null,
): readonly RenderEventDeck[] {
  const playedCardId = resolvePlayedCardId(state, playedCardZoneId);
  return eventDecks.map((deck) => {
    const currentCardTitle = playedCardId === null ? null : deck.cardsById.get(playedCardId) ?? null;
    return {
      id: deck.id,
      displayName: deck.displayName,
      drawZoneId: deck.drawZoneId,
      discardZoneId: deck.discardZoneId,
      currentCardId: currentCardTitle === null ? null : playedCardId,
      currentCardTitle,
      deckSize: state.zones[deck.drawZoneId]?.length ?? 0,
      discardSize: state.zones[deck.discardZoneId]?.length ?? 0,
    };
  });
}

function resolvePlayedCardId(state: GameState, playedCardZoneId: string | null): string | null {
  if (state.turnOrderState.type !== 'cardDriven') {
    return null;
  }

  if (playedCardZoneId === null) {
    return null;
  }

  return state.zones[playedCardZoneId]?.[0]?.id ?? null;
}

interface ZoneDerivationResult {
  readonly zones: readonly RenderZone[];
  readonly visibleTokenIDsByZone: ReadonlyMap<string, readonly string[]>;
}

function deriveZones(state: GameState, def: GameDef, context: RenderContext): ZoneDerivationResult {
  const zones: RenderZone[] = [];
  const visibleTokenIDsByZone = new Map<string, readonly string[]>();

  for (const zoneDef of def.zones) {
    const zoneID = String(zoneDef.id);
    const ownerID = zoneDef.owner === 'player' ? parseOwnerPlayerId(zoneID, state.playerCount) : null;
    if (zoneDef.owner === 'player' && ownerID === null) {
      continue;
    }
    const zoneTokens = state.zones[zoneID] ?? [];
    const visibleTokenIDs = deriveVisibleTokenIDs(
      zoneTokens,
      zoneDef.visibility,
      ownerID,
      context.playerID,
      state.reveals?.[zoneID] ?? [],
    );

    visibleTokenIDsByZone.set(zoneID, visibleTokenIDs);

    zones.push({
      id: zoneID,
      displayName: formatIdAsDisplayName(zoneID),
      ordering: zoneDef.ordering,
      tokenIDs: visibleTokenIDs,
      hiddenTokenCount: zoneTokens.length - visibleTokenIDs.length,
      markers: [],
      visibility: zoneDef.visibility,
      isSelectable: false,
      isHighlighted: false,
      ownerID,
      metadata: {},
    });
  }

  return {
    zones,
    visibleTokenIDsByZone,
  };
}

function deriveTokens(
  state: GameState,
  zones: readonly RenderZone[],
  visibleTokenIDsByZone: ReadonlyMap<string, readonly string[]>,
): readonly RenderToken[] {
  const tokens: RenderToken[] = [];

  for (const zone of zones) {
    const visibleTokenIDs = visibleTokenIDsByZone.get(zone.id) ?? [];
    if (visibleTokenIDs.length === 0) {
      continue;
    }
    const visibleTokenIDSet = new Set(visibleTokenIDs);

    for (const token of state.zones[zone.id] ?? []) {
      if (!visibleTokenIDSet.has(String(token.id))) {
        continue;
      }

      tokens.push({
        id: String(token.id),
        type: token.type,
        zoneID: zone.id,
        ownerID: zone.ownerID,
        faceUp: true,
        properties: token.props,
        isSelectable: false,
        isSelected: false,
      });
    }
  }

  return tokens;
}

function deriveVisibleTokenIDs(
  zoneTokens: readonly Token[],
  visibility: RenderZone['visibility'],
  ownerID: PlayerId | null,
  viewingPlayerID: PlayerId,
  grants: readonly RevealGrant[],
): readonly string[] {
  const visibleTokenIDSet = new Set<string>();

  if (zoneVisibleByDefault(visibility, ownerID, viewingPlayerID)) {
    for (const token of zoneTokens) {
      visibleTokenIDSet.add(String(token.id));
    }
  }

  for (const grant of grants) {
    if (!grantAppliesToViewer(grant, viewingPlayerID)) {
      continue;
    }
    for (const token of zoneTokens) {
      if (grantRevealsToken(grant, token)) {
        visibleTokenIDSet.add(String(token.id));
      }
    }
  }

  return zoneTokens
    .map((token) => String(token.id))
    .filter((tokenID) => visibleTokenIDSet.has(tokenID));
}

function zoneVisibleByDefault(
  visibility: RenderZone['visibility'],
  ownerID: PlayerId | null,
  viewingPlayerID: PlayerId,
): boolean {
  switch (visibility) {
    case 'public':
      return true;
    case 'owner':
      return ownerID !== null && ownerID === viewingPlayerID;
    case 'hidden':
      return false;
  }
}

function grantAppliesToViewer(grant: RevealGrant, viewingPlayerID: PlayerId): boolean {
  if (grant.observers === 'all') {
    return true;
  }
  return grant.observers.some((observerID) => observerID === viewingPlayerID);
}

function grantRevealsToken(grant: RevealGrant, token: Token): boolean {
  if (grant.filter === undefined || grant.filter.length === 0) {
    return true;
  }

  return matchesAllTokenFilterPredicates(token, grant.filter);
}

function deriveAdjacencies(def: GameDef, zones: readonly RenderZone[]): readonly RenderAdjacency[] {
  const renderedZoneIDs = new Set(zones.map((zone) => zone.id));
  const deduped = new Set<string>();
  const adjacencies: RenderAdjacency[] = [];

  for (const zoneDef of def.zones) {
    const from = String(zoneDef.id);
    if (!renderedZoneIDs.has(from)) {
      continue;
    }

    for (const adjacentTo of zoneDef.adjacentTo ?? []) {
      const to = String(adjacentTo);
      if (!renderedZoneIDs.has(to)) {
        continue;
      }

      pushAdjacency(adjacencies, deduped, from, to);
      pushAdjacency(adjacencies, deduped, to, from);
    }
  }

  return adjacencies;
}

function pushAdjacency(
  output: RenderAdjacency[],
  deduped: Set<string>,
  from: string,
  to: string,
): void {
  const key = `${from}->${to}`;
  if (deduped.has(key)) {
    return;
  }

  deduped.add(key);
  output.push({ from, to });
}

function deriveMapSpaces(def: GameDef): readonly RenderMapSpace[] {
  return (def.mapSpaces ?? []).map((space) => ({
    ...space,
    displayName: formatIdAsDisplayName(space.id),
  }));
}

function deriveSimultaneousSubmitted(state: GameState): readonly PlayerId[] {
  if (state.turnOrderState.type !== 'simultaneous') {
    return [];
  }

  const submitted: PlayerId[] = [];
  for (const [playerId, isSubmitted] of Object.entries(state.turnOrderState.submitted)) {
    if (!isSubmitted) {
      continue;
    }

    const numericPlayerId = Number(playerId);
    if (!Number.isInteger(numericPlayerId) || numericPlayerId < 0 || numericPlayerId >= state.playerCount) {
      continue;
    }

    submitted.push(asPlayerId(numericPlayerId));
  }

  return submitted;
}

function parseOwnerPlayerId(zoneID: string, playerCount: number): PlayerId | null {
  const match = OWNER_ZONE_ID_PATTERN.exec(zoneID);
  if (match === null) {
    return null;
  }

  const numericPlayerId = Number(match[1]);
  if (!Number.isInteger(numericPlayerId) || numericPlayerId < 0 || numericPlayerId >= playerCount) {
    return null;
  }

  return asPlayerId(numericPlayerId);
}
