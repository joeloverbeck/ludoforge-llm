import { asPlayerId, type GameDef, type GameState, type PlayerId } from '@ludoforge/engine';

import type { RenderAdjacency, RenderMapSpace, RenderModel, RenderToken, RenderZone } from './render-model.js';
import type { RenderContext } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

const OWNER_ZONE_ID_PATTERN = /^.+:(\d+)$/;

export function deriveRenderModel(
  state: GameState,
  def: GameDef,
  _context: RenderContext,
): RenderModel {
  const zones = deriveZones(state, def);
  const tokens = deriveTokens(state, zones);
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

function deriveZones(state: GameState, def: GameDef): readonly RenderZone[] {
  const zones: RenderZone[] = [];

  for (const zoneDef of def.zones) {
    const zoneID = String(zoneDef.id);
    const ownerID = zoneDef.owner === 'player' ? parseOwnerPlayerId(zoneID, state.playerCount) : null;
    if (zoneDef.owner === 'player' && ownerID === null) {
      continue;
    }

    zones.push({
      id: zoneID,
      displayName: formatIdAsDisplayName(zoneID),
      ordering: zoneDef.ordering,
      tokenIDs: (state.zones[zoneID] ?? []).map((token) => String(token.id)),
      hiddenTokenCount: 0,
      markers: [],
      visibility: zoneDef.visibility,
      isSelectable: false,
      isHighlighted: false,
      ownerID,
      metadata: {},
    });
  }

  return zones;
}

function deriveTokens(state: GameState, zones: readonly RenderZone[]): readonly RenderToken[] {
  const tokens: RenderToken[] = [];

  for (const zone of zones) {
    for (const token of state.zones[zone.id] ?? []) {
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
