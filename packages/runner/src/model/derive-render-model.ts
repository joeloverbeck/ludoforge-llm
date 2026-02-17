import { asPlayerId, matchesAllTokenFilterPredicates, type GameDef, type GameState, type PlayerId, type RevealGrant, type Token } from '@ludoforge/engine';

import type { RenderAdjacency, RenderMapSpace, RenderModel, RenderToken, RenderZone } from './render-model.js';
import type { RenderContext } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

const OWNER_ZONE_ID_PATTERN = /^.+:(\d+)$/;

export function deriveRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
): RenderModel {
  const zoneDerivation = deriveZones(state, def, context);
  const zones = zoneDerivation.zones;
  const tokens = deriveTokens(state, zones, zoneDerivation.visibleTokenIDsByZone);
  const adjacencies = deriveAdjacencies(def, zones);
  const mapSpaces = deriveMapSpaces(def);

  return {
    zones,
    adjacencies,
    mapSpaces,
    tokens,
    globalVars: [],
    playerVars: new Map(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [],
    activePlayerID: state.activePlayer,
    turnOrder: [],
    turnOrderType: state.turnOrderState.type,
    simultaneousSubmitted: deriveSimultaneousSubmitted(state),
    interruptStack: [],
    isInInterrupt: false,
    phaseName: String(state.currentPhase),
    phaseDisplayName: formatIdAsDisplayName(String(state.currentPhase)),
    eventDecks: [],
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
