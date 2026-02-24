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

interface GlobalVarDef {
  readonly name: string;
  readonly type: 'int' | 'boolean';
  readonly min?: number;
  readonly max?: number;
}

interface PieceTypeInfo {
  readonly id: string;
  readonly seat: string;
  readonly statusDimensions: readonly string[];
}

interface TrackInitializationEntry {
  readonly path: string;
  readonly trackId: string;
  readonly value: number;
}

interface GlobalVarInitializationEntry {
  readonly path: string;
  readonly var: string;
  readonly value: number | boolean;
}

interface GlobalMarkerInitializationEntry {
  readonly path: string;
  readonly markerId: string;
  readonly state: string;
}

interface MarkerInitializationEntry {
  readonly path: string;
  readonly spaceId: string;
  readonly markerId: string;
  readonly state: string;
}

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
    if (zone.isInternal !== undefined && typeof zone.isInternal !== 'boolean') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ZONE_INTERNAL_FLAG_INVALID',
        path: `${basePath}.isInternal`,
        severity: 'error',
        message: 'zone.isInternal must be a boolean when provided.',
        suggestion: 'Set isInternal to true or false.',
      });
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
  globalVars: readonly unknown[] | null,
  globalMarkerLattices: readonly unknown[] | null,
  diagnostics: Diagnostic[],
): void {
  const spaceIds = extractMapSpaceIds(mapPayload);
  const trackDefs = extractMapTrackDefs(mapPayload);
  const markerLattices = extractMapMarkerLattices(mapPayload);
  const globalVarDefs = extractGlobalVarDefs(globalVars, trackDefs);
  const globalMarkerDefs = extractGlobalMarkerLattices(globalMarkerLattices);
  const trackInitializations = extractTrackInitializations(payload, basePath);
  const globalVarInitializations = extractGlobalVarInitializations(payload, basePath);
  const globalMarkerInitializations = extractGlobalMarkerInitializations(payload, basePath);
  const markerInitializations = extractMarkerInitializations(payload, basePath);
  const pieceTypeIndex = extractPieceTypeIndex(pieceCatalogPayload);
  const inventoryIndex = extractInventoryIndex(pieceCatalogPayload);

  validateInitialPlacements(payload, basePath, spaceIds, diagnostics);
  validateInitialTrackValues(trackInitializations, trackDefs, diagnostics);
  validateInitialGlobalVarValues(globalVarInitializations, globalVarDefs, diagnostics);
  validateInitialGlobalMarkerValues(globalMarkerInitializations, globalMarkerDefs, diagnostics);
  validateInitialMarkers(markerInitializations, spaceIds, markerLattices, diagnostics);
  emitScenarioProjectionInvariantDiagnostics(payload, basePath, pieceTypeIndex, inventoryIndex, diagnostics);
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

function extractGlobalVarDefs(
  globalVars: readonly unknown[] | null,
  trackDefs: ReadonlyMap<string, TrackDef>,
): ReadonlyMap<string, GlobalVarDef> {
  const result = new Map<string, GlobalVarDef>();
  for (const track of trackDefs.values()) {
    result.set(track.id, {
      name: track.id,
      type: 'int',
      min: track.min,
      max: track.max,
    });
  }

  if (globalVars === null) {
    return result;
  }

  for (const variable of globalVars) {
    if (!isRecord(variable) || typeof variable.name !== 'string') {
      continue;
    }
    if (variable.type !== 'int' && variable.type !== 'boolean') {
      continue;
    }

    result.set(variable.name, {
      name: variable.name,
      type: variable.type,
      ...(isFiniteNumber(variable.min) ? { min: variable.min } : {}),
      ...(isFiniteNumber(variable.max) ? { max: variable.max } : {}),
    });
  }
  return result;
}

function extractGlobalMarkerLattices(
  globalMarkerLattices: readonly unknown[] | null,
): ReadonlyMap<string, MarkerLatticeDef> {
  const result = new Map<string, MarkerLatticeDef>();
  if (globalMarkerLattices === null) {
    return result;
  }

  for (const lattice of globalMarkerLattices) {
    if (!isRecord(lattice) || typeof lattice.id !== 'string' || !Array.isArray(lattice.states)) {
      continue;
    }
    const states = lattice.states.filter((s: unknown): s is string => typeof s === 'string');
    result.set(lattice.id, { id: lattice.id, states });
  }
  return result;
}

function extractTrackInitializations(
  payload: Record<string, unknown>,
  basePath: string,
): readonly TrackInitializationEntry[] {
  if (!Array.isArray(payload.initializations)) {
    return [];
  }

  const result: TrackInitializationEntry[] = [];
  for (const [index, entry] of payload.initializations.entries()) {
    if (!isRecord(entry) || typeof entry.trackId !== 'string' || !isFiniteNumber(entry.value)) {
      continue;
    }
    result.push({
      path: `${basePath}.initializations.${index}`,
      trackId: entry.trackId,
      value: entry.value,
    });
  }
  return result;
}

function extractGlobalVarInitializations(
  payload: Record<string, unknown>,
  basePath: string,
): readonly GlobalVarInitializationEntry[] {
  if (!Array.isArray(payload.initializations)) {
    return [];
  }

  const result: GlobalVarInitializationEntry[] = [];
  for (const [index, entry] of payload.initializations.entries()) {
    if (!isRecord(entry) || typeof entry.var !== 'string') {
      continue;
    }
    if (!isFiniteNumber(entry.value) && typeof entry.value !== 'boolean') {
      continue;
    }
    result.push({
      path: `${basePath}.initializations.${index}`,
      var: entry.var,
      value: entry.value,
    });
  }
  return result;
}

function extractGlobalMarkerInitializations(
  payload: Record<string, unknown>,
  basePath: string,
): readonly GlobalMarkerInitializationEntry[] {
  if (!Array.isArray(payload.initializations)) {
    return [];
  }

  const result: GlobalMarkerInitializationEntry[] = [];
  for (const [index, entry] of payload.initializations.entries()) {
    if (!isRecord(entry) || typeof entry.markerId !== 'string' || typeof entry.state !== 'string' || 'spaceId' in entry) {
      continue;
    }
    result.push({
      path: `${basePath}.initializations.${index}`,
      markerId: entry.markerId,
      state: entry.state,
    });
  }
  return result;
}

function extractMarkerInitializations(
  payload: Record<string, unknown>,
  basePath: string,
): readonly MarkerInitializationEntry[] {
  if (!Array.isArray(payload.initializations)) {
    return [];
  }

  const result: MarkerInitializationEntry[] = [];
  for (const [index, entry] of payload.initializations.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.spaceId !== 'string' ||
      typeof entry.markerId !== 'string' ||
      typeof entry.state !== 'string'
    ) {
      continue;
    }
    result.push({
      path: `${basePath}.initializations.${index}`,
      spaceId: entry.spaceId,
      markerId: entry.markerId,
      state: entry.state,
    });
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
  initializations: readonly TrackInitializationEntry[],
  trackDefs: ReadonlyMap<string, TrackDef>,
  diagnostics: Diagnostic[],
): void {
  for (const entry of initializations) {
    if (trackDefs.size > 0) {
      const trackDef = trackDefs.get(entry.trackId);
      if (trackDef === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID',
          path: `${entry.path}.trackId`,
          severity: 'error',
          message: `Unknown track "${entry.trackId}" in scenario initializations.`,
          suggestion: 'Use a track id declared in the referenced map asset.',
        });
      } else if (entry.value < trackDef.min || entry.value > trackDef.max) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS',
          path: `${entry.path}.value`,
          severity: 'error',
          message: `Track "${entry.trackId}" value ${entry.value} is out of bounds [${trackDef.min}, ${trackDef.max}].`,
          suggestion: `Set value between ${trackDef.min} and ${trackDef.max}.`,
        });
      }
    }
  }
}

function validateInitialGlobalVarValues(
  initializations: readonly GlobalVarInitializationEntry[],
  globalVarDefs: ReadonlyMap<string, GlobalVarDef>,
  diagnostics: Diagnostic[],
): void {
  for (const entry of initializations) {
    if (globalVarDefs.size === 0) {
      continue;
    }

    const globalVar = globalVarDefs.get(entry.var);
    if (globalVar === undefined) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_VAR_INVALID',
        path: `${entry.path}.var`,
        severity: 'error',
        message: `Unknown global var "${entry.var}" in scenario initializations.`,
        suggestion: 'Use a global var declared in doc.globalVars or a track id declared in map payload.tracks.',
      });
      continue;
    }

    if (globalVar.type === 'boolean') {
      if (typeof entry.value !== 'boolean') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_VAR_TYPE_INVALID',
          path: `${entry.path}.value`,
          severity: 'error',
          message: `Scenario value for boolean global var "${entry.var}" must be true/false.`,
          suggestion: 'Set value to true or false.',
        });
      }
      continue;
    }

    if (!isFiniteNumber(entry.value)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_VAR_TYPE_INVALID',
        path: `${entry.path}.value`,
        severity: 'error',
        message: `Scenario value for int global var "${entry.var}" must be numeric.`,
        suggestion: 'Set value to an integer within bounds.',
      });
      continue;
    }

    if (globalVar.min !== undefined && entry.value < globalVar.min) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_VAR_OUT_OF_BOUNDS',
        path: `${entry.path}.value`,
        severity: 'error',
        message: `Scenario value ${entry.value} for global var "${entry.var}" is below min ${globalVar.min}.`,
        suggestion: `Set value >= ${globalVar.min}.`,
      });
      continue;
    }
    if (globalVar.max !== undefined && entry.value > globalVar.max) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_VAR_OUT_OF_BOUNDS',
        path: `${entry.path}.value`,
        severity: 'error',
        message: `Scenario value ${entry.value} for global var "${entry.var}" is above max ${globalVar.max}.`,
        suggestion: `Set value <= ${globalVar.max}.`,
      });
    }
  }
}

function validateInitialGlobalMarkerValues(
  initializations: readonly GlobalMarkerInitializationEntry[],
  globalMarkerDefs: ReadonlyMap<string, MarkerLatticeDef>,
  diagnostics: Diagnostic[],
): void {
  for (const entry of initializations) {
    if (globalMarkerDefs.size === 0) {
      continue;
    }
    const marker = globalMarkerDefs.get(entry.markerId);
    if (marker === undefined) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_MARKER_INVALID',
        path: `${entry.path}.markerId`,
        severity: 'error',
        message: `Unknown global marker lattice "${entry.markerId}" in scenario initializations.`,
        suggestion: 'Use a marker id declared in doc.globalMarkerLattices.',
      });
      continue;
    }

    if (typeof entry.state === 'string' && !marker.states.includes(entry.state)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_GLOBAL_MARKER_INVALID',
        path: `${entry.path}.state`,
        severity: 'error',
        message: `Invalid global marker state "${entry.state}" for marker "${entry.markerId}".`,
        suggestion: `Use one of: ${marker.states.join(', ')}.`,
      });
    }
  }
}

function validateInitialMarkers(
  initializations: readonly MarkerInitializationEntry[],
  spaceIds: ReadonlySet<string>,
  markerLattices: ReadonlyMap<string, MarkerLatticeDef>,
  diagnostics: Diagnostic[],
): void {
  for (const marker of initializations) {
    const markerPath = marker.path;
    if (spaceIds.size > 0 && !spaceIds.has(marker.spaceId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID',
        path: `${markerPath}.spaceId`,
        severity: 'error',
        message: `Unknown space "${marker.spaceId}" in scenario initializations.`,
        suggestion: 'Use a space id declared in the referenced map asset.',
      });
    }

    if (markerLattices.size > 0) {
      const lattice = markerLattices.get(marker.markerId);
      if (lattice === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID',
          path: `${markerPath}.markerId`,
          severity: 'error',
          message: `Unknown marker lattice "${marker.markerId}" in scenario initializations.`,
          suggestion: 'Use a marker lattice id declared in the referenced map asset.',
        });
      } else if (!lattice.states.includes(marker.state)) {
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
