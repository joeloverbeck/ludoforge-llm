import { resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import type {
  CompiledAgentPolicyRef,
  CompiledObserverProfile,
  CompiledSurfaceCatalog,
  CompiledSurfaceVisibility,
  CompiledZoneVisibilityEntry,
  GameDef,
  GameState,
  LookupRefStatus,
  SurfaceVisibilityClass,
  Token,
  ZoneDef,
  ZoneObserverVisibilityClass,
} from '../kernel/types.js';
import type { PolicyValue } from './policy-surface.js';
import { isSurfaceVisibilityAccessible } from './policy-surface.js';

type LookupRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>;

export interface PolicyLookupResolutionContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly actingSeatId: string;
  readonly actingPlayerIndex: number;
  readonly seatResolutionIndex: SeatResolutionIndex;
  readonly surfaceVisibility: CompiledSurfaceCatalog;
  readonly observerProfile?: CompiledObserverProfile;
}

interface TokenLocation {
  readonly token: Token;
  readonly zoneId: string;
}

type ProjectedLookupObject =
  | Readonly<Record<string, unknown>>
  | number
  | string
  | boolean
  | undefined;

const zoneBaseId = (zoneId: string): string => {
  const colon = zoneId.indexOf(':');
  return colon === -1 ? zoneId : zoneId.slice(0, colon);
};

const isPolicyScalar = (value: unknown): value is number | string | boolean =>
  typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

export function resolveLookupViaSeatResolution(
  context: PolicyLookupResolutionContext,
  ref: LookupRef,
  keyValue: PolicyValue,
  seatContext?: string,
): LookupRefStatus {
  const observerSeatId = seatContext ?? context.actingSeatId;
  const observerPlayerIndex = resolvePlayerIndexForSeatValue(observerSeatId, context.seatResolutionIndex)
    ?? context.actingPlayerIndex;
  const key = validateLookupKey(context, ref, keyValue);
  if (key.kind === 'unavailable') {
    return key.status;
  }

  const projected = projectLookupObject(context, ref, key.value, observerSeatId, observerPlayerIndex);
  if (projected.kind === 'unavailable') {
    return projected.status;
  }
  const value = walkLookupPath(projected.value, ref.path);
  if (!isPolicyScalar(value)) {
    return { kind: 'unavailable', reason: 'unresolved' };
  }
  return { kind: 'ready', value };
}

function validateLookupKey(
  context: PolicyLookupResolutionContext,
  ref: LookupRef,
  keyValue: PolicyValue,
): { readonly kind: 'ready'; readonly value: string | number } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  if (!isLookupKeyTypeCompatible(ref)) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  if (ref.collection === 'globals') {
    return typeof keyValue === 'string'
      ? { kind: 'ready', value: keyValue }
      : { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  if (ref.collection === 'players') {
    return typeof keyValue === 'number' && Number.isSafeInteger(keyValue) && keyValue >= 0
      ? { kind: 'ready', value: keyValue }
      : { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  if (typeof keyValue !== 'string') {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  if (ref.collection === 'zones') {
    if (findZoneDef(context.def, keyValue) !== undefined) {
      return ref.keyType === 'ZoneId'
        ? { kind: 'ready', value: keyValue }
        : { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
    }
    if (findToken(context.state, keyValue) !== undefined) {
      return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
    }
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
  }
  if (findToken(context.state, keyValue) !== undefined) {
    return ref.keyType === 'TokenId'
      ? { kind: 'ready', value: keyValue }
      : { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  if (findZoneDef(context.def, keyValue) !== undefined) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'typeMismatch' } };
  }
  return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
}

function isLookupKeyTypeCompatible(ref: LookupRef): boolean {
  switch (ref.collection) {
    case 'zones':
      return ref.keyType === 'ZoneId';
    case 'tokens':
      return ref.keyType === 'TokenId';
    case 'players':
      return ref.keyType === 'PlayerId';
    case 'globals':
      return ref.keyType === 'string';
  }
}

function projectLookupObject(
  context: PolicyLookupResolutionContext,
  ref: LookupRef,
  key: string | number,
  observerSeatId: string,
  observerPlayerIndex: number,
): { readonly kind: 'ready'; readonly value: ProjectedLookupObject } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  switch (ref.collection) {
    case 'zones':
      return projectZone(context, String(key), observerPlayerIndex);
    case 'tokens':
      return projectToken(context, String(key), observerPlayerIndex);
    case 'players':
      return projectPlayer(context, ref, Number(key), observerSeatId, observerPlayerIndex);
    case 'globals':
      return projectGlobal(context, String(key), observerSeatId, observerPlayerIndex);
  }
}

function projectZone(
  context: PolicyLookupResolutionContext,
  zoneId: string,
  observerPlayerIndex: number,
): { readonly kind: 'ready'; readonly value: ProjectedLookupObject } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  const zone = findZoneDef(context.def, zoneId);
  if (zone === undefined) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
  }
  if (!isZoneVisible(zone, context.observerProfile, observerPlayerIndex)) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'hidden' } };
  }
  return {
    kind: 'ready',
    value: {
      id: String(zone.id),
      category: zone.category,
      owner: zone.owner,
      ownerPlayerIndex: zone.ownerPlayerIndex,
      properties: zone.attributes ?? {},
      variables: context.state.zoneVars[String(zone.id)] ?? {},
    },
  };
}

function projectToken(
  context: PolicyLookupResolutionContext,
  tokenId: string,
  observerPlayerIndex: number,
): { readonly kind: 'ready'; readonly value: ProjectedLookupObject } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  const located = findToken(context.state, tokenId);
  if (located === undefined) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
  }
  const zone = findZoneDef(context.def, located.zoneId);
  if (zone === undefined) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
  }
  if (!isZoneVisible(zone, context.observerProfile, observerPlayerIndex)) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'hidden' } };
  }
  return {
    kind: 'ready',
    value: {
      id: String(located.token.id),
      type: located.token.type,
      zoneId: located.zoneId,
      properties: located.token.props,
    },
  };
}

function projectPlayer(
  context: PolicyLookupResolutionContext,
  ref: LookupRef,
  playerIndex: number,
  observerSeatId: string,
  observerPlayerIndex: number,
): { readonly kind: 'ready'; readonly value: ProjectedLookupObject } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  if (!Number.isSafeInteger(playerIndex) || playerIndex < 0 || playerIndex >= context.state.playerCount) {
    return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
  }
  const variables = context.state.perPlayerVars[playerIndex] ?? {};
  const requestedVariableId = ref.path[0] === 'variables' && typeof ref.path[1] === 'string'
    ? ref.path[1]
    : undefined;
  if (requestedVariableId !== undefined) {
    const visibility = context.surfaceVisibility.perPlayerVars[requestedVariableId];
    if (
      visibility !== undefined
      && !isCurrentSurfaceAccessible(visibility, context.actingSeatId, observerSeatId, context.actingPlayerIndex, observerPlayerIndex)
    ) {
      return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'hidden' } };
    }
  }
  const projectedVariables: Record<string, number | boolean> = {};
  for (const [id, value] of Object.entries(variables)) {
    const visibility = context.surfaceVisibility.perPlayerVars[id];
    if (
      visibility !== undefined
      && isCurrentSurfaceAccessible(visibility, context.actingSeatId, observerSeatId, context.actingPlayerIndex, observerPlayerIndex)
    ) {
      projectedVariables[id] = value;
    }
  }
  return {
    kind: 'ready',
    value: {
      id: playerIndex,
      seatId: context.seatResolutionIndex.seatIdByPlayerIndex[playerIndex] ?? undefined,
      variables: projectedVariables,
    },
  };
}

function projectGlobal(
  context: PolicyLookupResolutionContext,
  id: string,
  observerSeatId: string,
  observerPlayerIndex: number,
): { readonly kind: 'ready'; readonly value: ProjectedLookupObject } | { readonly kind: 'unavailable'; readonly status: LookupRefStatus } {
  const variableVisibility = context.surfaceVisibility.globalVars[id];
  if (variableVisibility !== undefined) {
    if (!isCurrentSurfaceAccessible(variableVisibility, context.actingSeatId, observerSeatId, context.actingPlayerIndex, observerPlayerIndex)) {
      return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'hidden' } };
    }
    const value = context.state.globalVars[id];
    return value === undefined
      ? { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } }
      : { kind: 'ready', value: { id, value, properties: { value } } };
  }
  const markerVisibility = context.surfaceVisibility.globalMarkers[id];
  if (markerVisibility !== undefined) {
    if (!isCurrentSurfaceAccessible(markerVisibility, context.actingSeatId, observerSeatId, context.actingPlayerIndex, observerPlayerIndex)) {
      return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'hidden' } };
    }
    const value = context.state.globalMarkers?.[id]
      ?? context.def.globalMarkerLattices?.find((entry) => entry.id === id)?.defaultState;
    return value === undefined
      ? { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } }
      : { kind: 'ready', value: { id, value, properties: { value } } };
  }
  return { kind: 'unavailable', status: { kind: 'unavailable', reason: 'missing' } };
}

function isCurrentSurfaceAccessible(
  visibility: CompiledSurfaceVisibility,
  actingSeatId: string,
  resolvedSeatId: string,
  actingPlayerIndex: number,
  resolvedPlayerIndex: number,
): boolean {
  return isSurfaceVisibilityAccessible(
    visibility.current,
    actingSeatId,
    resolvedSeatId,
    actingPlayerIndex,
    resolvedPlayerIndex,
  );
}

function isZoneVisible(
  zone: ZoneDef,
  observerProfile: CompiledObserverProfile | undefined,
  observerPlayerIndex: number,
): boolean {
  const visibility = effectiveZoneVisibility(zone, observerProfile).tokens;
  return isZoneVisibilityAccessible(visibility, zone, observerPlayerIndex);
}

function effectiveZoneVisibility(
  zone: ZoneDef,
  observerProfile: CompiledObserverProfile | undefined,
): CompiledZoneVisibilityEntry {
  const entry = observerProfile?.zones?.entries[zoneBaseId(String(zone.id))]
    ?? observerProfile?.zones?.defaultEntry;
  return entry ?? { tokens: zone.visibility, order: zone.visibility };
}

function isZoneVisibilityAccessible(
  visibility: ZoneObserverVisibilityClass | SurfaceVisibilityClass,
  zone: ZoneDef,
  observerPlayerIndex: number,
): boolean {
  if (visibility === 'public') {
    return true;
  }
  if (visibility === 'owner') {
    return zone.ownerPlayerIndex === observerPlayerIndex;
  }
  return false;
}

function findZoneDef(def: GameDef, zoneId: string): ZoneDef | undefined {
  return def.zones.find((entry) => String(entry.id) === zoneId);
}

function findToken(state: GameState, tokenId: string): TokenLocation | undefined {
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    const token = tokens.find((entry) => String(entry.id) === tokenId);
    if (token !== undefined) {
      return { token, zoneId };
    }
  }
  return undefined;
}

function walkLookupPath(root: ProjectedLookupObject, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[segment];
  }
  return current;
}
