import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  collectScenarioProjectionEntries,
  evaluateScenarioProjectionInvariants,
  mapScenarioProjectionInvariantIssuesToDiagnostics,
  type ScenarioProjectionInvariantDiagnosticDialect,
} from './scenario-projection-invariants.js';
import {
  ZONE_KEYS,
  isFiniteNumber,
  isRecord,
  uniqueSorted,
  validateEnumField,
  validateIdentifierField,
  validateUnknownKeys,
} from './validate-spec-shared.js';

interface TrackDef {
  readonly id: string;
  readonly min: number;
  readonly max: number;
}

interface MarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
}

interface PieceTypeInfo {
  readonly id: string;
  readonly seat: string;
  readonly statusDimensions: readonly string[];
}

const VALID_US_POLICIES: readonly string[] = ['jfk', 'lbj', 'nixon'];
const VALIDATOR_SCENARIO_PROJECTION_DIAGNOSTIC_DIALECT: ScenarioProjectionInvariantDiagnosticDialect = {
  unknownPieceType: {
    initialPlacementsCode: 'CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID',
    outOfPlayCode: 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_INVALID',
    initialPlacementsMessage: (pieceTypeId) => `Unknown piece type "${pieceTypeId}" in scenario placement.`,
    outOfPlayMessage: (pieceTypeId) => `Unknown piece type "${pieceTypeId}" in scenario outOfPlay.`,
    suggestion: 'Use a piece type id declared in the referenced piece catalog asset.',
  },
  seatMismatch: {
    initialPlacementsCode: 'CNL_VALIDATOR_SCENARIO_PLACEMENT_SEAT_MISMATCH',
    outOfPlayCode: 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_SEAT_MISMATCH',
    message: (actualSeat, pieceTypeId, expectedSeat) =>
      `Seat "${actualSeat}" does not match piece type "${pieceTypeId}" (expected "${expectedSeat}").`,
    suggestion: (expectedSeat) => `Set seat to "${expectedSeat}" or use a different piece type.`,
  },
  conservationViolation: {
    code: 'CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED',
    message: (pieceTypeId, usedCount, totalInventory) =>
      `Piece type "${pieceTypeId}" uses ${usedCount} but inventory has only ${totalInventory}.`,
    suggestion: (pieceTypeId, totalInventory) =>
      `Reduce placed + out-of-play count for "${pieceTypeId}" to at most ${totalInventory}.`,
  },
};

export function validateZones(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
  const collectedZoneIds: string[] = [];
  if (doc.zones === null) {
    return collectedZoneIds;
  }

  for (const [index, zone] of doc.zones.entries()) {
    const basePath = `doc.zones.${index}`;
    if (!isRecord(zone)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ZONE_SHAPE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Zone definition must be an object.',
        suggestion: 'Provide zone fields id, owner, visibility, and ordering.',
      });
      continue;
    }

    validateUnknownKeys(zone, ZONE_KEYS, basePath, diagnostics, 'zone');
    if (zone.zoneKind !== undefined) {
      validateEnumField(zone, 'zoneKind', ['board', 'aux'], basePath, diagnostics, 'zone');
    }
    if ('layoutRole' in zone) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ZONE_LAYOUT_ROLE_REMOVED',
        path: `${basePath}.layoutRole`,
        severity: 'error',
        message: 'zone.layoutRole is no longer supported in GameSpecDoc.',
        suggestion: 'Move layout role to runner visual-config.yaml.',
      });
    }
    if ('visual' in zone) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ZONE_VISUAL_REMOVED',
        path: `${basePath}.visual`,
        severity: 'error',
        message: 'zone.visual is no longer supported in GameSpecDoc.',
        suggestion: 'Move zone visuals to runner visual-config.yaml.',
      });
    }
    validateEnumField(zone, 'owner', ['none', 'player'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'visibility', ['public', 'owner', 'hidden'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'ordering', ['stack', 'queue', 'set'], basePath, diagnostics, 'zone');

    const zoneId = validateIdentifierField(zone, 'id', `${basePath}.id`, diagnostics, 'zone id');
    if (zoneId !== undefined) {
      collectedZoneIds.push(zoneId);
    }
  }

  return uniqueSorted(collectedZoneIds);
}

export function validateScenarioCrossReferences(
  payload: Record<string, unknown>,
  basePath: string,
  mapPayload: Record<string, unknown> | undefined,
  pieceCatalogPayload: Record<string, unknown> | undefined,
  diagnostics: Diagnostic[],
): void {
  const spaceIds = extractMapSpaceIds(mapPayload);
  const trackDefs = extractMapTrackDefs(mapPayload);
  const markerLattices = extractMapMarkerLattices(mapPayload);
  const pieceTypeIndex = extractPieceTypeIndex(pieceCatalogPayload);
  const inventoryIndex = extractInventoryIndex(pieceCatalogPayload);

  validateInitialPlacements(payload, basePath, spaceIds, diagnostics);
  validateInitialTrackValues(payload, basePath, trackDefs, diagnostics);
  validateInitialMarkers(payload, basePath, spaceIds, markerLattices, diagnostics);
  emitScenarioProjectionInvariantDiagnostics(payload, basePath, pieceTypeIndex, inventoryIndex, diagnostics);
  validateUsPolicy(payload, basePath, diagnostics);
}

function extractMapSpaceIds(mapPayload: Record<string, unknown> | undefined): ReadonlySet<string> {
  const result = new Set<string>();
  if (mapPayload === undefined || !Array.isArray(mapPayload.spaces)) {
    return result;
  }
  for (const space of mapPayload.spaces) {
    if (isRecord(space) && typeof space.id === 'string' && space.id.trim() !== '') {
      result.add(space.id);
    }
  }
  return result;
}

function extractMapTrackDefs(mapPayload: Record<string, unknown> | undefined): ReadonlyMap<string, TrackDef> {
  const result = new Map<string, TrackDef>();
  if (mapPayload === undefined || !Array.isArray(mapPayload.tracks)) {
    return result;
  }
  for (const track of mapPayload.tracks) {
    if (isRecord(track) && typeof track.id === 'string' && isFiniteNumber(track.min) && isFiniteNumber(track.max)) {
      result.set(track.id, { id: track.id, min: track.min, max: track.max });
    }
  }
  return result;
}

function extractMapMarkerLattices(
  mapPayload: Record<string, unknown> | undefined,
): ReadonlyMap<string, MarkerLatticeDef> {
  const result = new Map<string, MarkerLatticeDef>();
  if (mapPayload === undefined || !Array.isArray(mapPayload.markerLattices)) {
    return result;
  }
  for (const lattice of mapPayload.markerLattices) {
    if (isRecord(lattice) && typeof lattice.id === 'string' && Array.isArray(lattice.states)) {
      const states = lattice.states.filter((s: unknown): s is string => typeof s === 'string');
      result.set(lattice.id, { id: lattice.id, states });
    }
  }
  return result;
}

function extractPieceTypeIndex(
  pieceCatalogPayload: Record<string, unknown> | undefined,
): ReadonlyMap<string, PieceTypeInfo> {
  const result = new Map<string, PieceTypeInfo>();
  if (pieceCatalogPayload === undefined || !Array.isArray(pieceCatalogPayload.pieceTypes)) {
    return result;
  }
  for (const pt of pieceCatalogPayload.pieceTypes) {
    if (isRecord(pt) && typeof pt.id === 'string' && typeof pt.seat === 'string') {
      const statusDimensions = Array.isArray(pt.statusDimensions)
        ? pt.statusDimensions.filter((s: unknown): s is string => typeof s === 'string')
        : [];
      result.set(pt.id, { id: pt.id, seat: pt.seat, statusDimensions });
    }
  }
  return result;
}

function extractInventoryIndex(
  pieceCatalogPayload: Record<string, unknown> | undefined,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  if (pieceCatalogPayload === undefined || !Array.isArray(pieceCatalogPayload.inventory)) {
    return result;
  }
  for (const entry of pieceCatalogPayload.inventory) {
    if (isRecord(entry) && typeof entry.pieceTypeId === 'string' && isFiniteNumber(entry.total)) {
      result.set(entry.pieceTypeId, (result.get(entry.pieceTypeId) ?? 0) + entry.total);
    }
  }
  return result;
}

function validateInitialPlacements(
  payload: Record<string, unknown>,
  basePath: string,
  spaceIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(payload.initialPlacements)) {
    return;
  }

  for (const [index, placement] of payload.initialPlacements.entries()) {
    if (!isRecord(placement)) {
      continue;
    }
    const placementPath = `${basePath}.initialPlacements.${index}`;

    if (typeof placement.spaceId === 'string' && spaceIds.size > 0 && !spaceIds.has(placement.spaceId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID',
        path: `${placementPath}.spaceId`,
        severity: 'error',
        message: `Unknown space "${placement.spaceId}" in scenario placement.`,
        suggestion: 'Use a space id declared in the referenced map asset.',
      });
    }
  }
}

function validateInitialTrackValues(
  payload: Record<string, unknown>,
  basePath: string,
  trackDefs: ReadonlyMap<string, TrackDef>,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(payload.initialTrackValues)) {
    return;
  }

  for (const [index, entry] of payload.initialTrackValues.entries()) {
    if (!isRecord(entry)) {
      continue;
    }
    const entryPath = `${basePath}.initialTrackValues.${index}`;

    if (typeof entry.trackId === 'string' && trackDefs.size > 0) {
      const trackDef = trackDefs.get(entry.trackId);
      if (trackDef === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID',
          path: `${entryPath}.trackId`,
          severity: 'error',
          message: `Unknown track "${entry.trackId}" in scenario initialTrackValues.`,
          suggestion: 'Use a track id declared in the referenced map asset.',
        });
      } else if (isFiniteNumber(entry.value) && (entry.value < trackDef.min || entry.value > trackDef.max)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS',
          path: `${entryPath}.value`,
          severity: 'error',
          message: `Track "${entry.trackId}" value ${entry.value} is out of bounds [${trackDef.min}, ${trackDef.max}].`,
          suggestion: `Set value between ${trackDef.min} and ${trackDef.max}.`,
        });
      }
    }
  }
}

function validateInitialMarkers(
  payload: Record<string, unknown>,
  basePath: string,
  spaceIds: ReadonlySet<string>,
  markerLattices: ReadonlyMap<string, MarkerLatticeDef>,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(payload.initialMarkers)) {
    return;
  }

  for (const [index, marker] of payload.initialMarkers.entries()) {
    if (!isRecord(marker)) {
      continue;
    }
    const markerPath = `${basePath}.initialMarkers.${index}`;

    if (typeof marker.spaceId === 'string' && spaceIds.size > 0 && !spaceIds.has(marker.spaceId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID',
        path: `${markerPath}.spaceId`,
        severity: 'error',
        message: `Unknown space "${marker.spaceId}" in scenario initialMarkers.`,
        suggestion: 'Use a space id declared in the referenced map asset.',
      });
    }

    if (typeof marker.markerId === 'string' && markerLattices.size > 0) {
      const lattice = markerLattices.get(marker.markerId);
      if (lattice === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID',
          path: `${markerPath}.markerId`,
          severity: 'error',
          message: `Unknown marker lattice "${marker.markerId}" in scenario initialMarkers.`,
          suggestion: 'Use a marker lattice id declared in the referenced map asset.',
        });
      } else if (typeof marker.state === 'string' && !lattice.states.includes(marker.state)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID',
          path: `${markerPath}.state`,
          severity: 'error',
          message: `Invalid marker state "${marker.state}" for lattice "${marker.markerId}".`,
          suggestion: `Use one of: ${lattice.states.join(', ')}.`,
        });
      }
    }
  }
}

function emitScenarioProjectionInvariantDiagnostics(
  payload: Record<string, unknown>,
  basePath: string,
  pieceTypeIndex: ReadonlyMap<string, PieceTypeInfo>,
  inventoryIndex: ReadonlyMap<string, number>,
  diagnostics: Diagnostic[],
): void {
  const pieceTypeSeatById = new Map<string, string>();
  for (const [pieceTypeId, pieceType] of pieceTypeIndex.entries()) {
    pieceTypeSeatById.set(pieceTypeId, pieceType.seat);
  }
  const entries = collectScenarioProjectionEntries(payload, basePath);
  const issues = evaluateScenarioProjectionInvariants(entries, pieceTypeSeatById, inventoryIndex);
  diagnostics.push(
    ...mapScenarioProjectionInvariantIssuesToDiagnostics(issues, VALIDATOR_SCENARIO_PROJECTION_DIAGNOSTIC_DIALECT, {
      conservationPath: basePath,
    }),
  );
}

function validateUsPolicy(
  payload: Record<string, unknown>,
  basePath: string,
  diagnostics: Diagnostic[],
): void {
  if (!('usPolicy' in payload) || payload.usPolicy === undefined || payload.usPolicy === null) {
    return;
  }

  if (typeof payload.usPolicy !== 'string' || !VALID_US_POLICIES.includes(payload.usPolicy)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID',
      path: `${basePath}.usPolicy`,
      severity: 'error',
      message: `Invalid usPolicy "${String(payload.usPolicy)}". Must be one of: ${VALID_US_POLICIES.join(', ')}.`,
      suggestion: `Set usPolicy to one of: ${VALID_US_POLICIES.join(', ')}.`,
    });
  }
}
