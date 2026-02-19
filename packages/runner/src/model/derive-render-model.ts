import {
  type ActiveLastingEffect,
  asPlayerId,
  matchesAllTokenFilterPredicates,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type NumericTrackDef,
  type PlayerId,
  type RevealGrant,
  type TerminalResult,
  type Token,
} from '@ludoforge/engine/runtime';

import type {
  RenderAdjacency,
  RenderChoiceOption,
  RenderChoiceTarget,
  RenderChoiceUi,
  RenderChoiceUiInvalidReason,
  RenderEventDeck,
  RenderGlobalMarker,
  RenderLastingEffect,
  RenderLastingEffectAttribute,
  RenderMarker,
  RenderModel,
  RenderToken,
  RenderTrack,
  RenderVariable,
  RenderZone,
} from './render-model.js';
import type { RenderContext } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { formatChoiceValueFallback, serializeChoiceValueIdentity } from './choice-value-utils.js';

const OWNER_ZONE_ID_PATTERN = /^.+:(\d+)$/;

interface StaticRenderDerivation {
  readonly markerStatesById: ReadonlyMap<string, readonly string[]>;
  readonly globalMarkerStatesById: ReadonlyMap<string, readonly string[]>;
  readonly cardTitleById: ReadonlyMap<string, string>;
  readonly trackDefs: readonly NumericTrackDef[];
  readonly eventDecks: readonly GameDefEventDeckProjection[];
  readonly playedCardZoneId: string | null;
  readonly tokenTypeFactionById: ReadonlyMap<string, string>;
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
  previousModel: RenderModel | null = null,
): RenderModel {
  const staticDerivation = deriveStaticRenderDerivation(def);
  const selectionTargets = deriveSelectionTargets(context);
  const zoneDerivation = deriveZones(state, def, context, selectionTargets.selectableZoneIDs);
  const zones = zoneDerivation.zones;
  const selectedZoneIDs = deriveSelectedZoneIDs(context.choiceStack, zones);
  const highlightedAdjacencyKeys = deriveHighlightedAdjacencyKeys(
    def,
    zones,
    selectionTargets.selectableZoneIDs,
    selectedZoneIDs,
  );
  const factionByPlayer = deriveFactionByPlayer(state);
  const tokens = deriveTokens(
    state,
    zones,
    zoneDerivation.visibleTokenIDsByZone,
    selectionTargets.selectableTokenIDs,
    staticDerivation.tokenTypeFactionById,
  );
  const adjacencies = deriveAdjacencies(def, zones, highlightedAdjacencyKeys);
  const globalVars = deriveGlobalVars(state);
  const playerVars = derivePlayerVars(state);
  const globalMarkers = deriveGlobalMarkers(state, staticDerivation.globalMarkerStatesById);
  const tracks = deriveTracks(state, staticDerivation.trackDefs);
  const activeEffects = deriveActiveEffects(state, staticDerivation.cardTitleById);
  const interruptStack = state.interruptPhaseStack ?? [];
  const eventDecks = deriveEventDecks(state, staticDerivation.eventDecks, staticDerivation.playedCardZoneId);
  const players = derivePlayers(state, context, factionByPlayer);
  const turnOrder = deriveTurnOrder(state, factionByPlayer);
  const choiceUi = deriveChoiceUi(context, zones, tokens, players);

  const nextModel: RenderModel = {
    zones: zones.map((zone) => ({
      ...zone,
      markers: deriveZoneMarkers(zone.id, state, staticDerivation.markerStatesById),
    })),
    adjacencies,
    tokens,
    globalVars,
    playerVars,
    globalMarkers,
    tracks,
    activeEffects,
    players,
    activePlayerID: state.activePlayer,
    turnOrder,
    turnOrderType: state.turnOrderState.type,
    simultaneousSubmitted: deriveSimultaneousSubmitted(state),
    interruptStack,
    isInInterrupt: interruptStack.length > 0,
    phaseName: String(state.currentPhase),
    phaseDisplayName: formatIdAsDisplayName(String(state.currentPhase)),
    eventDecks,
    actionGroups: deriveActionGroups(context.legalMoveResult?.moves ?? []),
    choiceBreadcrumb: deriveChoiceBreadcrumb(context),
    choiceUi,
    moveEnumerationWarnings: (context.legalMoveResult?.warnings ?? []).map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    terminal: deriveTerminal(context.terminal),
  };

  return stabilizeRenderModel(previousModel, nextModel);
}

function stabilizeRenderModel(previous: RenderModel | null, next: RenderModel): RenderModel {
  if (previous === null) {
    return next;
  }

  const stabilizedZones = stabilizeZoneArray(previous.zones, next.zones);
  const stabilizedTokens = stabilizeTokenArray(previous.tokens, next.tokens);

  if (stabilizedZones === next.zones && stabilizedTokens === next.tokens) {
    return next;
  }

  return {
    ...next,
    zones: stabilizedZones,
    tokens: stabilizedTokens,
  };
}

function stabilizeZoneArray(previous: readonly RenderZone[], next: readonly RenderZone[]): readonly RenderZone[] {
  if (previous.length === 0 || next.length === 0) {
    return next;
  }

  const previousById = new Map(previous.map((zone) => [zone.id, zone] as const));
  let hasChange = false;
  const stabilized = next.map((zone) => {
    const prior = previousById.get(zone.id);
    if (prior === undefined || !isZoneEquivalent(prior, zone)) {
      hasChange = true;
      return zone;
    }
    return prior;
  });

  if (!hasChange && stabilized.length === previous.length && stabilized.every((zone, index) => zone === previous[index])) {
    return previous;
  }

  return hasChange ? stabilized : next;
}

function stabilizeTokenArray(previous: readonly RenderToken[], next: readonly RenderToken[]): readonly RenderToken[] {
  if (previous.length === 0 || next.length === 0) {
    return next;
  }

  const previousById = new Map(previous.map((token) => [token.id, token] as const));
  let hasChange = false;
  const stabilized = next.map((token) => {
    const prior = previousById.get(token.id);
    if (prior === undefined || !isTokenEquivalent(prior, token)) {
      hasChange = true;
      return token;
    }
    return prior;
  });

  if (!hasChange && stabilized.length === previous.length && stabilized.every((token, index) => token === previous[index])) {
    return previous;
  }

  return hasChange ? stabilized : next;
}

function isZoneEquivalent(left: RenderZone, right: RenderZone): boolean {
  return left.id === right.id
    && left.displayName === right.displayName
    && left.ordering === right.ordering
    && left.hiddenTokenCount === right.hiddenTokenCount
    && left.visibility === right.visibility
    && left.isSelectable === right.isSelectable
    && left.isHighlighted === right.isHighlighted
    && left.ownerID === right.ownerID
    && left.category === right.category
    && isAttributeRecordEqual(left.attributes, right.attributes)
    && left.visual.shape === right.visual.shape
    && left.visual.width === right.visual.width
    && left.visual.height === right.visual.height
    && left.visual.color === right.visual.color
    && isStringArrayEqual(left.tokenIDs, right.tokenIDs)
    && isMarkerArrayEqual(left.markers, right.markers)
    && isShallowRecordEqual(left.metadata, right.metadata);
}

function isTokenEquivalent(left: RenderToken, right: RenderToken): boolean {
  return left.id === right.id
    && left.type === right.type
    && left.zoneID === right.zoneID
    && left.ownerID === right.ownerID
    && left.factionId === right.factionId
    && left.faceUp === right.faceUp
    && left.isSelectable === right.isSelectable
    && left.isSelected === right.isSelected
    && isShallowRecordEqual(left.properties, right.properties);
}

function isMarkerArrayEqual(left: readonly RenderMarker[], right: readonly RenderMarker[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftMarker, index) => {
    const rightMarker = right[index];
    if (rightMarker === undefined) {
      return false;
    }
    return leftMarker.id === rightMarker.id
      && leftMarker.displayName === rightMarker.displayName
      && leftMarker.state === rightMarker.state
      && isStringArrayEqual(leftMarker.possibleStates, rightMarker.possibleStates);
  });
}

function isStringArrayEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function isShallowRecordEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

function isAttributeRecordEqual(
  left: RenderZone['attributes'],
  right: RenderZone['attributes'],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === undefined || rightValue === undefined) {
      return false;
    }
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return Array.isArray(leftValue) && Array.isArray(rightValue) && isStringArrayEqual(leftValue, rightValue);
    }
    return Object.is(leftValue, rightValue);
  });
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
    markerStatesById: buildMarkerStatesById(def.markerLattices),
    globalMarkerStatesById: buildMarkerStatesById(def.globalMarkerLattices),
    cardTitleById,
    trackDefs: def.tracks ?? [],
    eventDecks,
    playedCardZoneId,
    tokenTypeFactionById: buildTokenTypeFactionById(def),
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
      displayName: formatIdAsDisplayName(id),
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
      displayName: formatIdAsDisplayName(id),
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
    displayName: deriveEffectDisplayName(effect, cardTitleById),
    attributes: deriveEffectAttributes(effect),
  }));
}

function deriveEffectDisplayName(
  effect: ActiveLastingEffect,
  cardTitleById: ReadonlyMap<string, string>,
): string {
  const sourceCardId = effect.sourceCardId;
  return cardTitleById.get(sourceCardId) ?? formatIdAsDisplayName(sourceCardId);
}

function deriveEffectAttributes(effect: ActiveLastingEffect): readonly RenderLastingEffectAttribute[] {
  const entries: RenderLastingEffectAttribute[] = [];
  const excludedKeys = new Set(['id', 'setupEffects', 'teardownEffects']);
  const effectEntries = Object.entries(effect) as readonly (readonly [string, unknown])[];
  const valuesByKey = new Map(effectEntries);
  const attributeKeys = effectEntries
    .map(([key]) => key)
    .filter((key) => !excludedKeys.has(key))
    .sort((left, right) => left.localeCompare(right));

  for (const key of attributeKeys) {
    const value = toEffectAttributeValue(valuesByKey.get(key));
    if (value === null) {
      continue;
    }
    entries.push({
      key,
      label: formatIdAsDisplayName(key),
      value,
    });
  }

  return entries;
}

function toEffectAttributeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
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

function deriveZones(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  selectableZoneIDs: ReadonlySet<string>,
): ZoneDerivationResult {
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
      displayName: context.visualConfigProvider.getZoneLabel(zoneID) ?? formatIdAsDisplayName(zoneID),
      ordering: zoneDef.ordering,
      tokenIDs: visibleTokenIDs,
      hiddenTokenCount: zoneTokens.length - visibleTokenIDs.length,
      markers: [],
      visibility: zoneDef.visibility,
      isSelectable: selectableZoneIDs.has(zoneID),
      isHighlighted: false,
      ownerID,
      category: zoneDef.category ?? null,
      attributes: zoneDef.attributes ?? {},
      visual: context.visualConfigProvider.resolveZoneVisual(
        zoneID,
        zoneDef.category ?? null,
        zoneDef.attributes ?? {},
      ),
      metadata: deriveZoneMetadata(zoneDef),
    });
  }

  return {
    zones,
    visibleTokenIDsByZone,
  };
}

function deriveZoneMetadata(zoneDef: GameDef['zones'][number]): Readonly<Record<string, unknown>> {
  const metadata: Record<string, unknown> = {
    zoneKind: zoneDef.zoneKind ?? 'aux',
  };

  if (zoneDef.category !== undefined) {
    metadata.category = zoneDef.category;
  }

  if (zoneDef.attributes !== undefined) {
    metadata.attributes = zoneDef.attributes;
  }

  return metadata;
}

function deriveTokens(
  state: GameState,
  zones: readonly RenderZone[],
  visibleTokenIDsByZone: ReadonlyMap<string, readonly string[]>,
  selectableTokenIDs: ReadonlySet<string>,
  tokenTypeFactionById: ReadonlyMap<string, string>,
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
        factionId: resolveTokenFactionId(token, tokenTypeFactionById),
        faceUp: true,
        properties: token.props,
        isSelectable: selectableTokenIDs.has(String(token.id)),
        isSelected: false,
      });
    }
  }

  return tokens;
}

function buildTokenTypeFactionById(def: GameDef): ReadonlyMap<string, string> {
  const factionByTokenType = new Map<string, string>();
  for (const tokenType of def.tokenTypes) {
    if (typeof tokenType.faction === 'string' && tokenType.faction.length > 0) {
      factionByTokenType.set(tokenType.id, tokenType.faction);
    }
  }
  return factionByTokenType;
}

function resolveTokenFactionId(
  token: Token,
  tokenTypeFactionById: ReadonlyMap<string, string>,
): string | null {
  return tokenTypeFactionById.get(token.type) ?? null;
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

function deriveAdjacencies(
  def: GameDef,
  zones: readonly RenderZone[],
  highlightedAdjacencyKeys: ReadonlySet<string>,
): readonly RenderAdjacency[] {
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

      pushAdjacency(adjacencies, deduped, from, to, highlightedAdjacencyKeys.has(toAdjacencyKey(from, to)));
      pushAdjacency(adjacencies, deduped, to, from, highlightedAdjacencyKeys.has(toAdjacencyKey(to, from)));
    }
  }

  return adjacencies;
}

function pushAdjacency(
  output: RenderAdjacency[],
  deduped: Set<string>,
  from: string,
  to: string,
  isHighlighted: boolean,
): void {
  const key = toAdjacencyKey(from, to);
  if (deduped.has(key)) {
    return;
  }

  deduped.add(key);
  output.push({ from, to, isHighlighted });
}

function toAdjacencyKey(from: string, to: string): string {
  return `${from}->${to}`;
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

interface SelectionTargets {
  readonly selectableZoneIDs: ReadonlySet<string>;
  readonly selectableTokenIDs: ReadonlySet<string>;
}

function deriveSelectionTargets(context: RenderContext): SelectionTargets {
  const pending = context.choicePending;
  if (pending === null) {
    return {
      selectableZoneIDs: new Set<string>(),
      selectableTokenIDs: new Set<string>(),
    };
  }

  const targetKinds = new Set(pending.targetKinds);
  if (targetKinds.size === 0) {
    return {
      selectableZoneIDs: new Set<string>(),
      selectableTokenIDs: new Set<string>(),
    };
  }

  const candidateIDs = new Set<string>();
  for (const option of pending.options) {
    if (option.legality !== 'legal') {
      continue;
    }
    addStringChoiceValues(option.value, candidateIDs);
  }

  const selectableZoneIDs = new Set<string>();
  const selectableTokenIDs = new Set<string>();
  for (const candidateId of candidateIDs) {
    if (targetKinds.has('zone')) {
      selectableZoneIDs.add(candidateId);
    }
    if (targetKinds.has('token')) {
      selectableTokenIDs.add(candidateId);
    }
  }
  return {
    selectableZoneIDs,
    selectableTokenIDs,
  };
}

function addStringChoiceValues(value: MoveParamValue, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        output.add(item);
      }
    }
    return;
  }

  if (typeof value === 'string') {
    output.add(value);
  }
}

function deriveSelectedZoneIDs(
  choiceStack: RenderContext['choiceStack'],
  zones: readonly RenderZone[],
): ReadonlySet<string> {
  if (choiceStack.length === 0 || zones.length === 0) {
    return new Set<string>();
  }

  const renderedZoneIDs = new Set(zones.map((zone) => zone.id));
  const selectedZoneIDs = new Set<string>();
  for (const step of choiceStack) {
    const candidates = new Set<string>();
    addStringChoiceValues(step.value, candidates);
    for (const candidate of candidates) {
      if (renderedZoneIDs.has(candidate)) {
        selectedZoneIDs.add(candidate);
      }
    }
  }

  return selectedZoneIDs;
}

function deriveHighlightedAdjacencyKeys(
  def: GameDef,
  zones: readonly RenderZone[],
  selectableZoneIDs: ReadonlySet<string>,
  selectedZoneIDs: ReadonlySet<string>,
): ReadonlySet<string> {
  if (selectableZoneIDs.size === 0 || selectedZoneIDs.size === 0 || zones.length === 0) {
    return new Set<string>();
  }

  const renderedZoneIDs = new Set(zones.map((zone) => zone.id));
  const highlighted = new Set<string>();

  for (const zoneDef of def.zones) {
    const from = String(zoneDef.id);
    if (!renderedZoneIDs.has(from) || !selectedZoneIDs.has(from)) {
      continue;
    }

    for (const adjacentTo of zoneDef.adjacentTo ?? []) {
      const to = String(adjacentTo);
      if (!renderedZoneIDs.has(to) || !selectableZoneIDs.has(to)) {
        continue;
      }

      highlighted.add(toAdjacencyKey(from, to));
      highlighted.add(toAdjacencyKey(to, from));
    }
  }

  return highlighted;
}

function deriveFactionByPlayer(state: GameState): ReadonlyMap<PlayerId, string> {
  const factionByPlayer = new Map<PlayerId, string>();
  if (state.turnOrderState.type !== 'cardDriven') {
    return factionByPlayer;
  }

  state.turnOrderState.runtime.factionOrder.forEach((faction, index) => {
    if (index >= state.playerCount) {
      return;
    }

    factionByPlayer.set(asPlayerId(index), faction);
  });

  return factionByPlayer;
}

function derivePlayers(
  state: GameState,
  context: RenderContext,
  factionByPlayer: ReadonlyMap<PlayerId, string>,
): RenderModel['players'] {
  return Array.from({ length: state.playerCount }, (_unused, index) => {
    const playerId = asPlayerId(index);
    const faction = factionByPlayer.get(playerId) ?? null;
    return {
      id: playerId,
      displayName: faction === null ? formatIdAsDisplayName(String(index)) : formatIdAsDisplayName(faction),
      isHuman: context.playerSeats.get(playerId) === 'human',
      isActive: playerId === state.activePlayer,
      isEliminated: state.perPlayerVars[String(index)]?.eliminated === true,
      factionId: faction,
    };
  });
}

function deriveTurnOrder(state: GameState, factionByPlayer: ReadonlyMap<PlayerId, string>): readonly PlayerId[] {
  const allPlayers = Array.from({ length: state.playerCount }, (_unused, index) => asPlayerId(index));
  if (state.turnOrderState.type === 'fixedOrder') {
    const normalizedIndex = normalizeIndex(state.turnOrderState.currentIndex, state.playerCount);
    return [...allPlayers.slice(normalizedIndex), ...allPlayers.slice(0, normalizedIndex)];
  }

  if (state.turnOrderState.type === 'cardDriven') {
    const byFaction = state.turnOrderState.runtime.factionOrder
      .map((faction) => findPlayerIdForFaction(factionByPlayer, faction))
      .filter((playerId): playerId is PlayerId => playerId !== null);
    const seen = new Set(byFaction);
    const remaining = allPlayers.filter((playerId) => !seen.has(playerId));
    return [...byFaction, ...remaining];
  }

  return allPlayers;
}

function normalizeIndex(index: number, playerCount: number): number {
  if (playerCount <= 0) {
    return 0;
  }
  const normalized = index % playerCount;
  return normalized < 0 ? normalized + playerCount : normalized;
}

function findPlayerIdForFaction(
  factionByPlayer: ReadonlyMap<PlayerId, string>,
  faction: string,
): PlayerId | null {
  for (const [playerId, playerFaction] of factionByPlayer.entries()) {
    if (playerFaction === faction) {
      return playerId;
    }
  }
  return null;
}

function deriveActionGroups(moves: readonly Move[]): RenderModel['actionGroups'] {
  const groupsByClass = new Map<string, Map<string, string>>();
  for (const move of moves) {
    const actionClass = typeof move.actionClass === 'string' && move.actionClass.length > 0 ? move.actionClass : null;
    const groupKey = actionClass ?? 'Actions';
    const group = groupsByClass.get(groupKey) ?? new Map<string, string>();
    if (!groupsByClass.has(groupKey)) {
      groupsByClass.set(groupKey, group);
    }

    const actionId = String(move.actionId);
    if (!group.has(actionId)) {
      group.set(actionId, formatIdAsDisplayName(actionId));
    }
  }

  return Array.from(groupsByClass.entries()).map(([groupKey, actionsById]) => ({
    groupName: groupKey === 'Actions' ? 'Actions' : formatIdAsDisplayName(groupKey),
    actions: Array.from(actionsById.entries()).map(([actionId, displayName]) => ({
      actionId,
      displayName,
      isAvailable: true,
    })),
  }));
}

function deriveChoiceBreadcrumb(context: RenderContext): RenderModel['choiceBreadcrumb'] {
  return context.choiceStack.map((step) => ({
    decisionId: step.decisionId,
    name: step.name,
    displayName: formatIdAsDisplayName(step.name),
    chosenValueId: serializeChoiceValueIdentity(step.value),
    chosenValue: step.value,
    chosenDisplayName: formatChoiceValueFallback(step.value),
  }));
}

function deriveRenderChoiceOptions(context: RenderContext): readonly RenderChoiceOption[] {
  if (context.choicePending === null) {
    return [];
  }
  return context.choicePending.options.map((option) => ({
    choiceValueId: serializeChoiceValueIdentity(option.value),
    value: option.value,
    displayName: formatChoiceValueFallback(option.value),
    target: {
      kind: 'scalar',
      entityId: null,
      displaySource: 'fallback',
    },
    legality: option.legality,
    illegalReason: option.illegalReason,
  }));
}

interface ChoiceOptionResolution {
  readonly displayName: string;
  readonly target: RenderChoiceTarget;
}

function resolveChoiceOption(
  value: MoveParamValue,
  targetKinds: readonly ('zone' | 'token')[],
  zonesById: ReadonlyMap<string, RenderZone>,
  tokensById: ReadonlyMap<string, RenderToken>,
  playersById: ReadonlyMap<PlayerId, RenderModel['players'][number]>,
): ChoiceOptionResolution {
  const fallback: ChoiceOptionResolution = {
    displayName: formatChoiceValueFallback(value),
    target: {
      kind: 'scalar',
      entityId: null,
      displaySource: 'fallback',
    },
  };

  if (typeof value !== 'string') {
    return fallback;
  }

  for (const targetKind of targetKinds) {
    if (targetKind === 'zone') {
      const zone = zonesById.get(value);
      if (zone !== undefined) {
        return {
          displayName: zone.displayName,
          target: {
            kind: 'zone',
            entityId: zone.id,
            displaySource: 'zone',
          },
        };
      }
      continue;
    }

    const token = tokensById.get(value);
    if (token !== undefined) {
      return {
        displayName: formatTokenChoiceDisplayName(token, playersById),
        target: {
          kind: 'token',
          entityId: token.id,
          displaySource: 'token',
        },
      };
    }
  }

  return fallback;
}

function formatTokenChoiceDisplayName(
  token: RenderToken,
  playersById: ReadonlyMap<PlayerId, RenderModel['players'][number]>,
): string {
  const tokenType = formatIdAsDisplayName(token.type);
  const tokenId = formatIdAsDisplayName(token.id);
  const ownerDisplayName = token.ownerID === null
    ? null
    : playersById.get(token.ownerID)?.displayName ?? `Player ${token.ownerID}`;

  if (ownerDisplayName === null) {
    return `${tokenType} (${tokenId})`;
  }
  return `${tokenType} (${tokenId}, ${ownerDisplayName})`;
}

function normalizeChoiceBound(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toInvalidChoiceUi(reason: RenderChoiceUiInvalidReason): RenderChoiceUi {
  return {
    kind: 'invalid',
    reason,
  };
}

function deriveChoiceUi(
  context: RenderContext,
  zones: readonly RenderZone[],
  tokens: readonly RenderToken[],
  players: readonly RenderModel['players'][number][],
): RenderChoiceUi {
  const pending = context.choicePending;
  const hasSelectedAction = context.selectedAction !== null;
  const hasPartialMove = context.partialMove !== null;
  const hasActionMoveMismatch = hasSelectedAction
    && hasPartialMove
    && context.partialMove.actionId !== context.selectedAction;

  if (hasActionMoveMismatch) {
    return toInvalidChoiceUi('ACTION_MOVE_MISMATCH');
  }

  if (pending !== null) {
    if (!hasSelectedAction) {
      return toInvalidChoiceUi('PENDING_CHOICE_MISSING_ACTION');
    }
    if (!hasPartialMove) {
      return toInvalidChoiceUi('PENDING_CHOICE_MISSING_PARTIAL_MOVE');
    }

    const zonesById = new Map(zones.map((zone) => [zone.id, zone] as const));
    const tokensById = new Map(tokens.map((token) => [token.id, token] as const));
    const playersById = new Map(players.map((player) => [player.id, player] as const));
    const options = deriveRenderChoiceOptions(context).map((option) => {
      const resolved = resolveChoiceOption(
        option.value,
        pending.targetKinds,
        zonesById,
        tokensById,
        playersById,
      );
      return {
        ...option,
        displayName: resolved.displayName,
        target: resolved.target,
      };
    });
    if (pending.type === 'chooseN') {
      const min = normalizeChoiceBound(pending.min);
      const rawMax = normalizeChoiceBound(pending.max);
      const max = min !== null && rawMax !== null && rawMax < min ? min : rawMax;
      return {
        kind: 'discreteMany',
        options,
        min,
        max,
      };
    }

    return {
      kind: 'discreteOne',
      options,
    };
  }

  if (hasSelectedAction && hasPartialMove) {
    return {
      kind: 'confirmReady',
    };
  }

  if (hasSelectedAction && !hasPartialMove) {
    return toInvalidChoiceUi('CONFIRM_READY_MISSING_PARTIAL_MOVE');
  }

  if (!hasSelectedAction && hasPartialMove) {
    return toInvalidChoiceUi('CONFIRM_READY_MISSING_ACTION');
  }

  return {
    kind: 'none',
  };
}

function deriveTerminal(terminal: TerminalResult | null): RenderModel['terminal'] {
  if (terminal === null) {
    return null;
  }

  switch (terminal.type) {
    case 'win':
      if (terminal.victory === undefined) {
        return {
          type: 'win',
          player: terminal.player,
          message: `Player ${terminal.player} wins!`,
        };
      }

      return {
        type: 'win',
        player: terminal.player,
        message: `Player ${terminal.player} wins!`,
        victory: {
          timing: terminal.victory.timing,
          checkpointId: terminal.victory.checkpointId,
          winnerFaction: terminal.victory.winnerFaction,
          ...(terminal.victory.ranking === undefined
            ? {}
            : {
                ranking: terminal.victory.ranking.map((entry) => ({
                  faction: entry.faction,
                  margin: entry.margin,
                  rank: entry.rank,
                  tieBreakKey: entry.tieBreakKey,
                })),
              }),
        },
      };
    case 'lossAll':
      return {
        type: 'lossAll',
        message: 'All players lose.',
      };
    case 'draw':
      return {
        type: 'draw',
        message: 'The game is a draw.',
      };
    case 'score':
      return {
        type: 'score',
        ranking: terminal.ranking.map((entry) => ({
          player: entry.player,
          score: entry.score,
        })),
        message: 'Game over - final rankings.',
      };
  }
}
