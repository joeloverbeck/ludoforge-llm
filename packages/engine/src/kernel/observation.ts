import type { PlayerId, ZoneId } from './branded.js';
import { buildZoneRuntimeIndex } from './runtime-zone-index.js';
import { getZoneTokensByCanonicalId } from './runtime-zone-state.js';
import type {
  CompiledObserverProfile,
  CompiledZoneVisibilityEntry,
  GameDef,
  GameState,
  RevealGrant,
  Token,
  ZoneDef,
  ZoneObserverVisibilityClass,
} from './types.js';
import { matchesTokenFilterExpr } from './token-filter.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlayerObservation {
  readonly observer: PlayerId;
  readonly visibleTokenIdsByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleTokenOrderByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleRevealsByZone: Readonly<Record<string, readonly RevealGrant[]>>;
  readonly hiddenSamplingZones: readonly ZoneId[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const extractZoneBaseId = (qualifiedId: string): string => {
  const colonIndex = qualifiedId.indexOf(':');
  return colonIndex === -1 ? qualifiedId : qualifiedId.slice(0, colonIndex);
};

const resolveEffectiveZoneVisibility = (
  zoneDef: ZoneDef,
  observerProfile: CompiledObserverProfile | undefined,
): { readonly tokens: ZoneObserverVisibilityClass; readonly order: ZoneObserverVisibilityClass } => {
  if (observerProfile?.zones === undefined) {
    return {
      tokens: zoneDef.visibility as ZoneObserverVisibilityClass,
      order: zoneDef.visibility as ZoneObserverVisibilityClass,
    };
  }

  const baseId = extractZoneBaseId(zoneDef.id as string);
  const entry: CompiledZoneVisibilityEntry | undefined =
    observerProfile.zones.entries[baseId] ?? observerProfile.zones.defaultEntry;

  if (entry === undefined) {
    return {
      tokens: zoneDef.visibility as ZoneObserverVisibilityClass,
      order: zoneDef.visibility as ZoneObserverVisibilityClass,
    };
  }

  return entry;
};

const isObserverGranted = (grant: RevealGrant, observer: PlayerId): boolean =>
  grant.observers === 'all' || grant.observers.includes(observer);

const computeVisibleTokens = (
  tokens: readonly Token[],
  zoneDef: ZoneDef,
  observer: PlayerId,
  grants: readonly RevealGrant[],
  effectiveTokensVisibility: ZoneObserverVisibilityClass,
): readonly Token[] => {
  if (effectiveTokensVisibility === 'public') {
    return tokens;
  }

  if (effectiveTokensVisibility === 'owner' && zoneDef.ownerPlayerIndex === (observer as number)) {
    return tokens;
  }

  // For hidden zones and owner zones where observer is not the owner,
  // visibility comes exclusively from reveal grants.
  const applicableGrants = grants.filter((g) => isObserverGranted(g, observer));
  if (applicableGrants.length === 0) {
    return [];
  }

  // If any applicable grant has no filter, all tokens are revealed.
  if (applicableGrants.some((g) => g.filter === undefined)) {
    return tokens;
  }

  // Union of all filtered grants: a token is visible if ANY filter matches.
  const visibleIds = new Set<string>();
  for (const grant of applicableGrants) {
    if (grant.filter !== undefined) {
      for (const token of tokens) {
        if (matchesTokenFilterExpr(token, grant.filter)) {
          visibleIds.add(token.id);
        }
      }
    }
  }

  return tokens.filter((t) => visibleIds.has(t.id));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const derivePlayerObservation = (
  def: GameDef,
  state: GameState,
  observer: PlayerId,
  observerProfile?: CompiledObserverProfile,
): PlayerObservation => {
  const visibleTokenIdsByZone: Record<string, readonly string[]> = {};
  const visibleTokenOrderByZone: Record<string, readonly string[]> = {};
  const visibleRevealsByZone: Record<string, readonly RevealGrant[]> = {};
  const hiddenSamplingZones = new Set<ZoneId>();
  const zoneRuntimeIndex = buildZoneRuntimeIndex(def);

  for (const zoneDef of def.zones) {
    const zoneId = zoneDef.id as string;
    const tokens = getZoneTokensByCanonicalId(state, zoneDef.id, zoneRuntimeIndex) ?? [];
    const grants = state.reveals?.[zoneId] ?? [];

    // Resolve effective zone visibility from observer profile or ZoneDef.visibility.
    const effective = resolveEffectiveZoneVisibility(zoneDef, observerProfile);

    // Record observer-applicable grants for this zone.
    const observerGrants = grants.filter((g) => isObserverGranted(g, observer));
    if (observerGrants.length > 0) {
      visibleRevealsByZone[zoneId] = observerGrants;
    }

    const visibleTokens = computeVisibleTokens(tokens, zoneDef, observer, grants, effective.tokens);
    const visibleIds = visibleTokens.map((t) => t.id as string);

    visibleTokenIdsByZone[zoneId] = visibleIds;

    // Ordering info: only for stack/queue zones, and only if order visibility permits.
    if (zoneDef.ordering === 'stack' || zoneDef.ordering === 'queue') {
      const orderVisible =
        effective.order === 'public' ||
        (effective.order === 'owner' && zoneDef.ownerPlayerIndex === (observer as number));
      if (orderVisible) {
        visibleTokenOrderByZone[zoneId] = visibleIds;
      }
    }

    if (visibleTokens.length < tokens.length) {
      hiddenSamplingZones.add(zoneDef.id);
    }
  }

  return {
    observer,
    visibleTokenIdsByZone,
    visibleTokenOrderByZone,
    visibleRevealsByZone,
    hiddenSamplingZones: [...hiddenSamplingZones].sort(),
  };
};
