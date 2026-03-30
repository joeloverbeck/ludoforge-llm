import {
  type ActiveLastingEffect,
  asPlayerId,
  buildSeatResolutionIndex,
  matchesTokenFilterExpr,
  type GameDef,
  type GameState,
  type Move,
  type DecisionKey,
  type MoveParamValue,
  parseDecisionKey,
  type PlayerId,
  type RevealGrant,
  resolvePlayerIndexForSeatValue,
  type SeatResolutionIndex,
  type TerminalResult,
  type Token,
} from '@ludoforge/engine/runtime';
import { isHumanSeatController } from '../seat/seat-controller.js';

import type {
  RunnerAction,
  RunnerActionGroup,
  RunnerAdjacency,
  RunnerChoiceContext,
  RunnerChoiceTarget,
  RunnerChoiceUi,
  RunnerChoiceUiInvalidReason,
  RunnerEligibilityEntry,
  RunnerEventCard,
  RunnerEventDeck,
  RunnerProjectionBundle,
  RunnerProjectionSource,
  RunnerChoiceStep,
  RunnerFrame,
  RunnerLastingEffect,
  RunnerLastingEffectAttribute,
  RunnerMarker,
  RunnerPlayer,
  RunnerRuntimeEligibleFaction,
  RunnerToken,
  RunnerVariable,
  RunnerZone,
} from './runner-frame.js';
import type { RenderContext } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { serializeChoiceValueIdentity } from './choice-value-utils.js';
import { deriveVictoryStandings } from './derive-victory-standings.js';
import { parseIterationContext } from './iteration-context.js';

const OWNER_ZONE_ID_PATTERN = /^.+:(\d+)$/;

interface StaticRenderDerivation {
  readonly markerStatesById: ReadonlyMap<string, readonly string[]>;
  readonly cardTitleById: ReadonlyMap<string, string>;
  readonly eventDecks: readonly GameDefEventDeckProjection[];
  readonly playedCardZoneId: string | null;
  readonly lookaheadCardZoneId: string | null;
  readonly tokenTypeFactionById: ReadonlyMap<string, string>;
}

interface EventCardProjection {
  readonly title: string;
  readonly orderNumber: number | null;
  readonly eligibility: readonly RunnerEligibilityEntry[] | null;
  readonly sideMode: 'single' | 'dual';
  readonly unshadedText: string | null;
  readonly shadedText: string | null;
}

interface GameDefEventDeckProjection {
  readonly id: string;
  readonly drawZoneId: string;
  readonly discardZoneId: string;
  readonly cardsById: ReadonlyMap<string, EventCardProjection>;
}

export function deriveRunnerFrame(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  previousBundle: RunnerProjectionBundle | null = null,
): RunnerProjectionBundle {
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
  const seatResolution = buildSeatResolutionIndex(def, state.playerCount);
  const factionByPlayer = deriveFactionByPlayer(state, seatResolution);
  const tokens = deriveTokens(
    state,
    zones,
    zoneDerivation.visibleTokenIDsByZone,
    selectionTargets.selectableTokenIDs,
    staticDerivation.tokenTypeFactionById,
    context.playerID,
  );
  const adjacencies = deriveAdjacencies(def, zones, highlightedAdjacencyKeys);
  const globalVars = deriveGlobalVars(state);
  const playerVars = derivePlayerVars(state);
  const activeEffects = deriveActiveEffects(state, staticDerivation.cardTitleById);
  const interruptStack = state.interruptPhaseStack ?? [];
  const eventDecks = deriveEventDecks(state, staticDerivation.eventDecks, staticDerivation.playedCardZoneId, staticDerivation.lookaheadCardZoneId);
  const players = derivePlayers(state, context, factionByPlayer);
  const turnOrder = deriveTurnOrder(state, seatResolution);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  const choiceUi = deriveChoiceUi(context, zonesById, tokens, players);
  const choiceContext = deriveChoiceContext(context, zonesById);

  const nextFrame: RunnerFrame = {
    zones: zones.map((zone) => ({
      ...zone,
      markers: deriveZoneMarkers(zone.id, state, staticDerivation.markerStatesById),
    })),
    adjacencies,
    tokens,
    activeEffects,
    players,
    activePlayerID: state.activePlayer,
    turnOrder,
    turnOrderType: state.turnOrderState.type,
    simultaneousSubmitted: deriveSimultaneousSubmitted(state),
    interruptStack,
    isInInterrupt: interruptStack.length > 0,
    phaseName: String(state.currentPhase),
    eventDecks,
    actionGroups: deriveActionGroups((context.legalMoveResult?.moves ?? []).map(({ move }) => move)),
    choiceBreadcrumb: deriveChoiceBreadcrumb(context, zonesById),
    selectedActionId: context.selectedAction ?? null,
    choiceContext,
    choiceUi,
    moveEnumerationWarnings: (context.legalMoveResult?.warnings ?? []).map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
    runtimeEligible: deriveRuntimeEligible(state),
    victoryStandings: deriveVictoryStandings(def, state),
    terminal: deriveTerminal(context.terminal),
  };

  const nextSource: RunnerProjectionSource = {
    globalVars,
    playerVars,
  };

  return stabilizeProjectionBundle(previousBundle, nextFrame, nextSource);
}

function stabilizeProjectionBundle(
  previous: RunnerProjectionBundle | null,
  nextFrame: RunnerFrame,
  nextSource: RunnerProjectionSource,
): RunnerProjectionBundle {
  if (previous === null) {
    return {
      frame: nextFrame,
      source: nextSource,
    };
  }

  const frame = stabilizeRunnerFrame(previous.frame, nextFrame);
  const source = stabilizeProjectionSource(previous.source, nextSource);

  if (frame === nextFrame && source === nextSource) {
    return {
      frame,
      source,
    };
  }

  return {
    frame,
    source,
  };
}

function stabilizeRunnerFrame(previous: RunnerFrame, next: RunnerFrame): RunnerFrame {
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

function stabilizeProjectionSource(
  previous: RunnerProjectionSource,
  next: RunnerProjectionSource,
): RunnerProjectionSource {
  const globalVars = stabilizeVariableArray(previous.globalVars, next.globalVars);
  const playerVars = stabilizePlayerVarMap(previous.playerVars, next.playerVars);

  if (globalVars === next.globalVars && playerVars === next.playerVars) {
    return next;
  }

  return {
    globalVars,
    playerVars,
  };
}

function stabilizeZoneArray(previous: readonly RunnerZone[], next: readonly RunnerZone[]): readonly RunnerZone[] {
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

function stabilizeTokenArray(previous: readonly RunnerToken[], next: readonly RunnerToken[]): readonly RunnerToken[] {
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

function stabilizeVariableArray(
  previous: readonly RunnerVariable[],
  next: readonly RunnerVariable[],
): readonly RunnerVariable[] {
  if (isVariableArrayEqual(previous, next)) {
    return previous;
  }
  return next;
}

function stabilizePlayerVarMap(
  previous: ReadonlyMap<PlayerId, readonly RunnerVariable[]>,
  next: ReadonlyMap<PlayerId, readonly RunnerVariable[]>,
): ReadonlyMap<PlayerId, readonly RunnerVariable[]> {
  if (previous.size !== next.size) {
    return next;
  }

  let changed = false;
  const stabilized = new Map<PlayerId, readonly RunnerVariable[]>();

  for (const [playerId, nextVars] of next.entries()) {
    const previousVars = previous.get(playerId);
    if (previousVars === undefined) {
      return next;
    }
    const vars = isVariableArrayEqual(previousVars, nextVars) ? previousVars : nextVars;
    if (vars !== previousVars) {
      changed = true;
    }
    stabilized.set(playerId, vars);
  }

  if (!changed && stabilized.size === previous.size) {
    let sameOrder = true;
    const previousEntries = Array.from(previous.entries());
    const stabilizedEntries = Array.from(stabilized.entries());
    for (let index = 0; index < previousEntries.length; index += 1) {
      const previousEntry = previousEntries[index];
      const stabilizedEntry = stabilizedEntries[index];
      if (
        previousEntry === undefined
        || stabilizedEntry === undefined
        || previousEntry[0] !== stabilizedEntry[0]
        || previousEntry[1] !== stabilizedEntry[1]
      ) {
        sameOrder = false;
        break;
      }
    }
    if (sameOrder) {
      return previous;
    }
  }

  return stabilized;
}

function isZoneEquivalent(left: RunnerZone, right: RunnerZone): boolean {
  return left.id === right.id
    && left.ordering === right.ordering
    && left.hiddenTokenCount === right.hiddenTokenCount
    && left.visibility === right.visibility
    && left.isSelectable === right.isSelectable
    && left.isHighlighted === right.isHighlighted
    && left.ownerID === right.ownerID
    && left.category === right.category
    && isAttributeRecordEqual(left.attributes, right.attributes)
    && isStringArrayEqual(left.tokenIDs, right.tokenIDs)
    && isMarkerArrayEqual(left.markers, right.markers)
    && isShallowRecordEqual(left.metadata, right.metadata);
}

function isTokenEquivalent(left: RunnerToken, right: RunnerToken): boolean {
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

function isMarkerArrayEqual(left: readonly RunnerMarker[], right: readonly RunnerMarker[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftMarker, index) => {
    const rightMarker = right[index];
    if (rightMarker === undefined) {
      return false;
    }
    return leftMarker.id === rightMarker.id
      && leftMarker.state === rightMarker.state
      && isStringArrayEqual(leftMarker.possibleStates, rightMarker.possibleStates);
  });
}

function isVariableArrayEqual(left: readonly RunnerVariable[], right: readonly RunnerVariable[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftVar, index) => {
    const rightVar = right[index];
    return rightVar !== undefined
      && leftVar.name === rightVar.name
      && Object.is(leftVar.value, rightVar.value);
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
  left: RunnerZone['attributes'],
  right: RunnerZone['attributes'],
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

  const seatOrderMetadataKey = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardSeatOrderMetadataKey ?? null
    : null;
  const seatOrderMapping: Readonly<Record<string, string>> = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardSeatOrderMapping ?? {}
    : {};

  for (const deck of def.eventDecks ?? []) {
    const cardsById = new Map<string, EventCardProjection>();
    for (const card of deck.cards) {
      const rawSeatOrder = seatOrderMetadataKey !== null
        ? card.metadata?.[seatOrderMetadataKey]
        : undefined;
      const eligibility: readonly RunnerEligibilityEntry[] | null = Array.isArray(rawSeatOrder) && rawSeatOrder.length > 0
        ? rawSeatOrder.map((entry: unknown) => ({
            label: String(entry),
            factionId: seatOrderMapping[String(entry)] ?? String(entry),
          }))
        : null;
      cardsById.set(card.id, {
        title: card.title,
        orderNumber: card.order ?? null,
        eligibility,
        sideMode: card.sideMode,
        unshadedText: card.unshaded?.text ?? null,
        shadedText: card.shaded?.text ?? null,
      });
      cardTitleById.set(card.id, card.title);
    }

    eventDecks.push({
      id: deck.id,
      drawZoneId: deck.drawZone,
      discardZoneId: deck.discardZone,
      cardsById,
    });
  }

  const cardLifecycle = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardLifecycle
    : null;

  const playedCardZoneId = cardLifecycle?.played ?? null;
  const lookaheadCardZoneId = cardLifecycle?.lookahead ?? null;

  return {
    markerStatesById: buildMarkerStatesById(def.markerLattices),
    cardTitleById,
    eventDecks,
    playedCardZoneId,
    lookaheadCardZoneId,
    tokenTypeFactionById: buildTokenTypeFactionById(def),
  };
}

function deriveGlobalVars(state: GameState): readonly RunnerVariable[] {
  return Object.entries(state.globalVars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({
      name,
      value,
    }));
}

function derivePlayerVars(state: GameState): ReadonlyMap<PlayerId, readonly RunnerVariable[]> {
  const numericPlayerIds = Object.keys(state.perPlayerVars)
    .map((playerId) => Number(playerId))
    .filter((playerId) => Number.isInteger(playerId) && playerId >= 0 && playerId < state.playerCount)
    .sort((left, right) => left - right);
  const playerVars = new Map<PlayerId, readonly RunnerVariable[]>();

  for (const playerId of numericPlayerIds) {
    const playerEntry = state.perPlayerVars[playerId] ?? {};
    const vars: readonly RunnerVariable[] = Object.entries(playerEntry)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => ({
        name,
        value,
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
): readonly RunnerMarker[] {
  return Object.entries(state.markers[zoneId] ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, markerState]) => ({
      id,
      state: markerState,
      possibleStates: markerStatesById.get(id) ?? [],
    }));
}

function deriveActiveEffects(
  state: GameState,
  cardTitleById: ReadonlyMap<string, string>,
): readonly RunnerLastingEffect[] {
  return (state.activeLastingEffects ?? []).map((effect) => ({
    id: effect.id,
    sourceCardId: effect.sourceCardId,
    sourceCardTitle: deriveEffectDisplayName(effect, cardTitleById),
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

function deriveEffectAttributes(effect: ActiveLastingEffect): readonly RunnerLastingEffectAttribute[] {
  const entries: RunnerLastingEffectAttribute[] = [];
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
  lookaheadCardZoneId: string | null,
): readonly RunnerEventDeck[] {
  const isCardDriven = state.turnOrderState.type === 'cardDriven';
  const playedCardId = isCardDriven ? resolveTopCardId(state, playedCardZoneId) : null;
  const lookaheadCardId = isCardDriven ? resolveTopCardId(state, lookaheadCardZoneId) : null;
  return eventDecks.map((deck) => ({
    id: deck.id,
    drawZoneId: deck.drawZoneId,
    discardZoneId: deck.discardZoneId,
    playedCard: resolveEventCard(playedCardId, deck.cardsById),
    lookaheadCard: resolveEventCard(lookaheadCardId, deck.cardsById),
    deckSize: state.zones[deck.drawZoneId]?.length ?? 0,
    discardSize: state.zones[deck.discardZoneId]?.length ?? 0,
  }));
}

function resolveTopCardId(state: GameState, zoneId: string | null): string | null {
  if (zoneId === null) {
    return null;
  }
  const token = state.zones[zoneId]?.[0];
  if (token === undefined) {
    return null;
  }
  const cardId = token.props.cardId;
  return typeof cardId === 'string' && cardId.length > 0 ? cardId : String(token.id);
}

function resolveEventCard(
  cardId: string | null,
  cardsById: ReadonlyMap<string, EventCardProjection>,
): RunnerEventCard | null {
  if (cardId === null) {
    return null;
  }
  const projection = cardsById.get(cardId);
  if (projection === undefined) {
    return null;
  }
  return {
    id: cardId,
    title: projection.title,
    orderNumber: projection.orderNumber,
    eligibility: projection.eligibility,
    sideMode: projection.sideMode,
    unshadedText: projection.unshadedText,
    shadedText: projection.shadedText,
  };
}

interface ZoneDerivationResult {
  readonly zones: readonly RunnerZone[];
  readonly visibleTokenIDsByZone: ReadonlyMap<string, readonly string[]>;
}

function deriveZones(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  selectableZoneIDs: ReadonlySet<string>,
): ZoneDerivationResult {
  const zones: RunnerZone[] = [];
  const visibleTokenIDsByZone = new Map<string, readonly string[]>();

  for (const zoneDef of def.zones) {
    if (zoneDef.isInternal === true) {
      continue;
    }
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
  zones: readonly RunnerZone[],
  visibleTokenIDsByZone: ReadonlyMap<string, readonly string[]>,
  selectableTokenIDs: ReadonlySet<string>,
  tokenTypeFactionById: ReadonlyMap<string, string>,
  viewingPlayerID: PlayerId,
): readonly RunnerToken[] {
  const tokens: RunnerToken[] = [];

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
        faceUp: deriveTokenFaceUp(zone.visibility, zone.ownerID, viewingPlayerID, token),
        properties: token.props,
        isSelectable: selectableTokenIDs.has(String(token.id)),
        isSelected: false,
      });
    }
  }

  return tokens;
}

function deriveTokenFaceUp(
  zoneVisibility: RunnerZone['visibility'],
  zoneOwnerID: PlayerId | null,
  viewingPlayerID: PlayerId,
  token: Token,
): boolean {
  if (zoneVisibility === 'public') {
    return true;
  }
  if (zoneVisibility === 'owner' && zoneOwnerID === viewingPlayerID) {
    return true;
  }
  if (typeof token.props['faceUp'] === 'boolean') {
    return token.props['faceUp'];
  }
  return true;
}

function buildTokenTypeFactionById(def: GameDef): ReadonlyMap<string, string> {
  const factionByTokenType = new Map<string, string>();
  for (const tokenType of def.tokenTypes) {
    if (typeof tokenType.seat === 'string' && tokenType.seat.length > 0) {
      factionByTokenType.set(tokenType.id, tokenType.seat);
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
  visibility: RunnerZone['visibility'],
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
  visibility: RunnerZone['visibility'],
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
  if (grant.filter === undefined) {
    return true;
  }

  return matchesTokenFilterExpr(token, grant.filter);
}

function deriveAdjacencies(
  def: GameDef,
  zones: readonly RunnerZone[],
  highlightedAdjacencyKeys: ReadonlySet<string>,
): readonly RunnerAdjacency[] {
  const renderedZoneById = new Map(zones.map((zone) => [zone.id, zone] as const));
  const zoneDefById = new Map(
    def.zones
      .filter((zone) => zone.isInternal !== true)
      .map((zone) => [String(zone.id), zone] as const),
  );
  const renderedZoneIDs = new Set(renderedZoneById.keys());
  const deduped = new Set<string>();
  const adjacencies: RunnerAdjacency[] = [];

  for (const zoneDef of def.zones) {
    if (zoneDef.isInternal === true) {
      continue;
    }
    const from = String(zoneDef.id);
    if (!renderedZoneIDs.has(from)) {
      continue;
    }

    for (const adjacentTo of zoneDef.adjacentTo ?? []) {
      const to = String(adjacentTo.to);
      if (!renderedZoneIDs.has(to)) {
        continue;
      }

      const fromCategory = adjacentTo.category ?? renderedZoneById.get(from)?.category ?? null;
      const toCategory = zoneDefById.get(to)?.adjacentTo
        ?.find((candidate) => String(candidate.to) === from)
        ?.category
        ?? renderedZoneById.get(to)?.category
        ?? null;
      pushAdjacency(adjacencies, deduped, from, to, fromCategory, highlightedAdjacencyKeys.has(toAdjacencyKey(from, to)));
      pushAdjacency(adjacencies, deduped, to, from, toCategory, highlightedAdjacencyKeys.has(toAdjacencyKey(to, from)));
    }
  }

  return adjacencies;
}

function pushAdjacency(
  output: RunnerAdjacency[],
  deduped: Set<string>,
  from: string,
  to: string,
  category: string | null,
  isHighlighted: boolean,
): void {
  const key = toAdjacencyKey(from, to);
  if (deduped.has(key)) {
    return;
  }

  deduped.add(key);
  output.push({ from, to, category, isHighlighted });
}

function toAdjacencyKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function deriveRuntimeEligible(state: GameState): readonly RunnerRuntimeEligibleFaction[] {
  if (state.turnOrderState.type !== 'cardDriven') {
    return [];
  }

  const { seatOrder, eligibility } = state.turnOrderState.runtime;
  const eligible: RunnerRuntimeEligibleFaction[] = [];
  for (let i = 0; i < seatOrder.length; i++) {
    const seat = seatOrder[i];
    if (seat === undefined) {
      continue;
    }
    if (eligibility[seat] === true) {
      eligible.push({
        seatId: seat,
        factionId: seat,
        seatIndex: i,
      });
    }
  }
  return eligible;
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
  zones: readonly RunnerZone[],
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
  zones: readonly RunnerZone[],
  selectableZoneIDs: ReadonlySet<string>,
  selectedZoneIDs: ReadonlySet<string>,
): ReadonlySet<string> {
  if (selectableZoneIDs.size === 0 || selectedZoneIDs.size === 0 || zones.length === 0) {
    return new Set<string>();
  }

  const renderedZoneIDs = new Set(zones.map((zone) => zone.id));
  const highlighted = new Set<string>();

  for (const zoneDef of def.zones) {
    if (zoneDef.isInternal === true) {
      continue;
    }
    const from = String(zoneDef.id);
    if (!renderedZoneIDs.has(from) || !selectedZoneIDs.has(from)) {
      continue;
    }

    for (const adjacentTo of zoneDef.adjacentTo ?? []) {
      const to = String(adjacentTo.to);
      if (!renderedZoneIDs.has(to) || !selectableZoneIDs.has(to)) {
        continue;
      }

      highlighted.add(toAdjacencyKey(from, to));
      highlighted.add(toAdjacencyKey(to, from));
    }
  }

  return highlighted;
}

function deriveFactionByPlayer(state: GameState, seatResolution: SeatResolutionIndex): ReadonlyMap<PlayerId, string> {
  const factionByPlayer = new Map<PlayerId, string>();

  for (let index = 0; index < state.playerCount; index += 1) {
    const seatId = seatResolution.seatIdByPlayerIndex[index];
    if (typeof seatId !== 'string' || seatId.length === 0) {
      continue;
    }
    factionByPlayer.set(asPlayerId(index), seatId);
  }

  if (factionByPlayer.size > 0 || state.turnOrderState.type !== 'cardDriven') {
    return factionByPlayer;
  }

  state.turnOrderState.runtime.seatOrder.forEach((faction, index) => {
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
): readonly RunnerPlayer[] {
  return Array.from({ length: state.playerCount }, (_unused, index) => {
    const playerId = asPlayerId(index);
    const faction = factionByPlayer.get(playerId) ?? null;
    return {
      id: playerId,
      isHuman: isHumanSeatController(context.playerSeats.get(playerId)),
      isActive: playerId === state.activePlayer,
      isEliminated: state.perPlayerVars[index]?.eliminated === true,
      factionId: faction,
    };
  });
}

function deriveTurnOrder(
  state: GameState,
  seatResolution: SeatResolutionIndex,
): readonly PlayerId[] {
  const allPlayers = Array.from({ length: state.playerCount }, (_unused, index) => asPlayerId(index));
  if (state.turnOrderState.type === 'fixedOrder') {
    const normalizedIndex = normalizeIndex(state.turnOrderState.currentIndex, state.playerCount);
    return [...allPlayers.slice(normalizedIndex), ...allPlayers.slice(0, normalizedIndex)];
  }

  if (state.turnOrderState.type === 'cardDriven') {
    const bySeatOrder = state.turnOrderState.runtime.seatOrder
      .map((seat) => {
        const playerIndex = resolvePlayerIndexForSeatValue(seat, seatResolution);
        return playerIndex === null ? null : asPlayerId(playerIndex);
      })
      .filter((playerId): playerId is PlayerId => playerId !== null);
    const seen = new Set(bySeatOrder);
    const remaining = allPlayers.filter((playerId) => !seen.has(playerId));
    return [...bySeatOrder, ...remaining];
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

function deriveActionGroups(
  moves: readonly Move[],
): readonly RunnerActionGroup[] {
  const groupsByClass = new Map<string, Map<string, RunnerAction>>();

  const ensureGroup = (key: string): Map<string, RunnerAction> => {
    if (!groupsByClass.has(key)) {
      groupsByClass.set(key, new Map());
    }
    return groupsByClass.get(key)!;
  };

  for (const move of moves) {
    const ac =
      typeof move.actionClass === 'string' && move.actionClass.length > 0
        ? move.actionClass
        : null;
    const actionId = String(move.actionId);

    const groupKey = ac ?? 'Actions';
    const group = ensureGroup(groupKey);
    if (!group.has(actionId)) {
      group.set(actionId, { actionId, isAvailable: true, ...(ac !== null ? { actionClass: ac } : {}) });
    }
  }

  return Array.from(groupsByClass.entries()).map(([groupKey, actionsById]) => ({
    groupKey,
    actions: Array.from(actionsById.values()),
  }));
}

function deriveChoiceContext(
  context: RenderContext,
  zonesById: ReadonlyMap<string, RunnerZone>,
): RunnerChoiceContext | null {
  if (context.selectedAction === null || context.choicePending === null) {
    return null;
  }

  const { selectedAction, choicePending } = context;

  const min = choicePending.type === 'chooseN' ? choicePending.min : undefined;
  const max = choicePending.type === 'chooseN' ? choicePending.max : undefined;
  let iterationEntityId: string | null = null;
  let iterationIndex: number | null = null;
  let iterationTotal: number | null = null;
  const iterCtx = parseIterationContext(choicePending.decisionKey, context.choiceStack, zonesById);
  if (iterCtx !== null) {
    iterationEntityId = iterCtx.currentEntityId;
    iterationIndex = iterCtx.iterationIndex;
    iterationTotal = iterCtx.iterationTotal;
  }

  // When the decision key has template resolution but no iteration path,
  // derive the entity from the resolved bind — only if it's a known zone.
  // Non-zone resolved binds (e.g., param names) add noise to the display.
  if (iterationEntityId === null) {
    const parsedKey = parseDecisionKey(choicePending.decisionKey);
    if (parsedKey !== null && parsedKey.baseId !== parsedKey.resolvedBind && isKnownZone(parsedKey.resolvedBind, zonesById)) {
      iterationEntityId = parsedKey.resolvedBind;
    }
  }

  return {
    selectedActionId: selectedAction,
    decisionParamName: choicePending.name,
    minSelections: normalizeChoiceBound(min),
    maxSelections: normalizeChoiceBound(max),
    iterationEntityId,
    iterationIndex,
    iterationTotal,
  };
}

function isKnownZone(entityId: string, zonesById: ReadonlyMap<string, RunnerZone>): boolean {
  if (zonesById.has(entityId)) {
    return true;
  }
  // Engine iteration entities may use base zone IDs without the :owner suffix.
  const prefix = entityId + ':';
  for (const zoneId of zonesById.keys()) {
    if (zoneId.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function extractIterationGroupId(decisionKey: DecisionKey): string | null {
  const parsedDecisionKey = parseDecisionKey(decisionKey);
  if (parsedDecisionKey === null) {
    return null;
  }
  return parsedDecisionKey.baseId === parsedDecisionKey.resolvedBind && parsedDecisionKey.iterationPath === ''
    ? null
    : parsedDecisionKey.baseId;
}

function deriveChoiceBreadcrumb(
  context: RenderContext,
  zonesById: ReadonlyMap<string, RunnerZone>,
): RunnerFrame['choiceBreadcrumb'] {
  const result: RunnerChoiceStep[] = [];
  for (let index = 0; index < context.choiceStack.length; index += 1) {
    const step = context.choiceStack[index]!;
    const choiceStackUpToHere = context.choiceStack.slice(0, index + 1);
    const iterCtx = parseIterationContext(step.decisionKey, choiceStackUpToHere, zonesById);
    const iterationGroupId = extractIterationGroupId(step.decisionKey);

    // When the decision key has template resolution (baseId !== resolvedBind)
    // but no iteration path, derive the entity from the resolved bind —
    // but only if the resolved bind is a known zone. Non-zone resolved binds
    // (e.g., param names) should fall through to the array-index lookup below.
    let iterationEntityId = iterCtx?.currentEntityId ?? null;
    if (iterationEntityId === null && iterationGroupId !== null) {
      const parsedKey = parseDecisionKey(step.decisionKey);
      if (parsedKey !== null && parsedKey.baseId !== parsedKey.resolvedBind && isKnownZone(parsedKey.resolvedBind, zonesById)) {
        iterationEntityId = parsedKey.resolvedBind;
      }
    }

    // Second fallback: for forEach group members without an entity, infer the
    // iteration entity from the most recent array-valued choice in the stack.
    // The step's position within its group indexes into that array.
    if (iterationEntityId === null && iterationGroupId !== null) {
      let groupIndex = 0;
      for (const prior of result) {
        if (prior.iterationGroupId === iterationGroupId) {
          groupIndex += 1;
        }
      }
      for (let j = index - 1; j >= 0; j -= 1) {
        const priorChoice = context.choiceStack[j];
        if (priorChoice !== undefined && Array.isArray(priorChoice.value)) {
          const arr = priorChoice.value as readonly MoveParamValue[];
          if (groupIndex < arr.length) {
            const candidate = String(arr[groupIndex]);
            if (zonesById.has(candidate)) {
              iterationEntityId = candidate;
            }
          }
          break;
        }
      }
    }

    result.push({
      decisionKey: step.decisionKey,
      name: step.name,
      chosenValueId: serializeChoiceValueIdentity(step.value),
      chosenValue: step.value,
      iterationGroupId,
      iterationEntityId,
    });
  }
  return result;
}

function resolveChoiceTarget(
  value: MoveParamValue,
  targetKinds: readonly ('zone' | 'token')[],
  zonesById: ReadonlyMap<string, RunnerZone>,
  tokens: readonly RunnerToken[],
): RunnerChoiceTarget {
  if (typeof value !== 'string') {
    return { kind: 'scalar', entityId: null };
  }

  for (const targetKind of targetKinds) {
    if (targetKind === 'zone' && zonesById.has(value)) {
      return { kind: 'zone', entityId: value };
    }
    if (targetKind === 'token' && tokens.some((token) => token.id === value)) {
      return { kind: 'token', entityId: value };
    }
  }

  return { kind: 'scalar', entityId: null };
}

function normalizeChoiceBound(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toInvalidChoiceUi(reason: RunnerChoiceUiInvalidReason): RunnerChoiceUi {
  return {
    kind: 'invalid',
    reason,
  };
}

function deriveChoiceUi(
  context: RenderContext,
  zonesById: ReadonlyMap<string, RunnerZone>,
  tokens: readonly RunnerToken[],
  _players: readonly RunnerPlayer[],
): RunnerChoiceUi {
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

    const allOptions = pending.options.map((option) => {
      const target = resolveChoiceTarget(option.value, pending.targetKinds, zonesById, tokens);
      return {
        choiceValueId: serializeChoiceValueIdentity(option.value),
        value: option.value,
        target,
        legality: option.legality,
        illegalReason: option.illegalReason,
        ...(option.resolution !== undefined ? { resolution: option.resolution } : {}),
      };
    });

    // Filter out options that failed action preconditions — these are categorically
    // unpresentable (the player cannot execute that action at all).
    const options = allOptions.filter(
      (opt) => !(opt.legality === 'illegal' && opt.illegalReason === 'actionPreconditionFailed'),
    );

    if (pending.type === 'chooseN') {
      const min = normalizeChoiceBound(pending.min);
      const rawMax = normalizeChoiceBound(pending.max);
      const max = min !== null && rawMax !== null && rawMax < min ? min : rawMax;
      return {
        kind: 'discreteMany',
        decisionKey: pending.decisionKey,
        options,
        min,
        max,
        selectedChoiceValueIds: pending.selected.map((value) => serializeChoiceValueIdentity(value)),
        canConfirm: pending.canConfirm,
      };
    }

    return {
      kind: 'discreteOne',
      decisionKey: pending.decisionKey,
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

function deriveTerminal(terminal: TerminalResult | null): RunnerFrame['terminal'] {
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
          winnerFaction: terminal.victory.winnerSeat,
          ...(terminal.victory.ranking === undefined
            ? {}
            : {
                ranking: terminal.victory.ranking.map((entry) => ({
                  faction: entry.seat,
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
