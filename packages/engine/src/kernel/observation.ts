import type { PlayerId } from './branded.js';
import type { GameDef, GameState, RevealGrant, Token, ZoneDef } from './types.js';
import { matchesTokenFilterExpr } from './token-filter.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlayerObservation {
  readonly observer: PlayerId;
  readonly visibleTokenIdsByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleTokenOrderByZone: Readonly<Record<string, readonly string[]>>;
  readonly visibleRevealsByZone: Readonly<Record<string, readonly RevealGrant[]>>;
  readonly requiresHiddenSampling: boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const isObserverGranted = (grant: RevealGrant, observer: PlayerId): boolean =>
  grant.observers === 'all' || grant.observers.includes(observer);

const computeVisibleTokens = (
  tokens: readonly Token[],
  zoneDef: ZoneDef,
  observer: PlayerId,
  grants: readonly RevealGrant[],
): readonly Token[] => {
  if (zoneDef.visibility === 'public') {
    return tokens;
  }

  if (zoneDef.visibility === 'owner' && zoneDef.ownerPlayerIndex === (observer as number)) {
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
): PlayerObservation => {
  const visibleTokenIdsByZone: Record<string, readonly string[]> = {};
  const visibleTokenOrderByZone: Record<string, readonly string[]> = {};
  const visibleRevealsByZone: Record<string, readonly RevealGrant[]> = {};
  let requiresHiddenSampling = false;

  for (const zoneDef of def.zones) {
    const zoneId = zoneDef.id as string;
    const tokens = state.zones[zoneId] ?? [];
    const grants = state.reveals?.[zoneId] ?? [];

    // Record observer-applicable grants for this zone.
    const observerGrants = grants.filter((g) => isObserverGranted(g, observer));
    if (observerGrants.length > 0) {
      visibleRevealsByZone[zoneId] = observerGrants;
    }

    const visibleTokens = computeVisibleTokens(tokens, zoneDef, observer, grants);
    const visibleIds = visibleTokens.map((t) => t.id as string);

    visibleTokenIdsByZone[zoneId] = visibleIds;

    // Ordering info is only meaningful for stack/queue zones.
    if (zoneDef.ordering === 'stack' || zoneDef.ordering === 'queue') {
      visibleTokenOrderByZone[zoneId] = visibleIds;
    }

    if (visibleTokens.length < tokens.length) {
      requiresHiddenSampling = true;
    }
  }

  return {
    observer,
    visibleTokenIdsByZone,
    visibleTokenOrderByZone,
    visibleRevealsByZone,
    requiresHiddenSampling,
  };
};
