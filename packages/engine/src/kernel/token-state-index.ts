import type { GameState, Token } from './types.js';

export interface TokenStateIndexEntry {
  readonly zoneId: string;
  readonly index: number;
  readonly token: Token;
  readonly occurrenceCount: number;
  readonly occurrenceZoneIds: readonly string[];
}

export interface MutableTokenStateIndex {
  read(): ReadonlyMap<string, TokenStateIndexEntry>;
  applyZoneDelta(prevZones: GameState['zones'], nextZones: GameState['zones']): void;
  attachPreviewState(state: GameState): void;
  attachAsCanonical(state: GameState): void;
}

interface TokenOccurrence {
  readonly zoneId: string;
  readonly index: number;
  readonly token: Token;
}

const NO_DUPLICATE_OCCURRENCE_ZONE_IDS: readonly string[] = Object.freeze([]);

const tokenStateIndexByZones = new WeakMap<GameState['zones'], ReadonlyMap<string, TokenStateIndexEntry>>();
let buildTokenStateIndexCount = 0;
let draftTokenStateIndexAttachCount = 0;
let draftTokenStateIndexSnapshotCount = 0;
let draftTokenStateIndexCowCopyCount = 0;
let draftTokenStateIndexDeltaCount = 0;

function buildTokenStateIndex(state: GameState): ReadonlyMap<string, TokenStateIndexEntry> {
  buildTokenStateIndexCount += 1;
  const index = new Map<string, TokenStateIndexEntry>();
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      if (token === undefined) {
        continue;
      }
      const tokenId = String(token.id);
      const existing = index.get(tokenId);
      if (existing === undefined) {
        index.set(tokenId, {
          zoneId,
          index: tokenIndex,
          token,
          occurrenceCount: 1,
          occurrenceZoneIds: NO_DUPLICATE_OCCURRENCE_ZONE_IDS,
        });
        continue;
      }
      index.set(tokenId, {
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        occurrenceZoneIds: existing.occurrenceCount === 1
          ? [existing.zoneId, zoneId]
          : [...existing.occurrenceZoneIds, zoneId],
      });
    }
  }
  return index;
}

function toIndexEntry(occurrences: readonly TokenOccurrence[]): TokenStateIndexEntry | undefined {
  const first = occurrences[0];
  if (first === undefined) {
    return undefined;
  }
  return {
    zoneId: first.zoneId,
    index: first.index,
    token: first.token,
    occurrenceCount: occurrences.length,
    occurrenceZoneIds: occurrences.length <= 1
      ? NO_DUPLICATE_OCCURRENCE_ZONE_IDS
      : occurrences.map((occurrence) => occurrence.zoneId),
  };
}

function buildMutableTokenStateIndex(initialState: GameState): MutableTokenStateIndex {
  let index = new Map<string, TokenStateIndexEntry>();
  const occurrencesByToken = new Map<string, TokenOccurrence[]>();
  const zoneOrder = Object.keys(initialState.zones);
  const zoneRank = new Map<string, number>(zoneOrder.map((zoneId, rank) => [zoneId, rank]));
  let currentZones = initialState.zones;
  let indexSharedWithPreviewState = false;

  const ensureWritableIndex = (): void => {
    if (!indexSharedWithPreviewState) {
      return;
    }
    index = new Map(index);
    draftTokenStateIndexCowCopyCount += 1;
    indexSharedWithPreviewState = false;
  };

  const ensureZoneRank = (zones: GameState['zones']): void => {
    for (const zoneId of Object.keys(zones)) {
      if (zoneRank.has(zoneId)) {
        continue;
      }
      zoneRank.set(zoneId, zoneOrder.length);
      zoneOrder.push(zoneId);
    }
  };

  const sortOccurrences = (occurrences: TokenOccurrence[]): void => {
    occurrences.sort((left, right) => {
      const leftRank = zoneRank.get(left.zoneId) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = zoneRank.get(right.zoneId) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.index - right.index;
    });
  };

  const refreshIndexEntry = (tokenId: string): void => {
    const occurrences = occurrencesByToken.get(tokenId);
    if (occurrences === undefined || occurrences.length === 0) {
      occurrencesByToken.delete(tokenId);
      index.delete(tokenId);
      return;
    }
    sortOccurrences(occurrences);
    const entry = toIndexEntry(occurrences);
    if (entry === undefined) {
      index.delete(tokenId);
      return;
    }
    index.set(tokenId, entry);
  };

  const addZoneOccurrences = (
    zoneId: string,
    tokens: readonly Token[] | undefined,
    affectedTokenIds?: Set<string>,
  ): void => {
    if (tokens === undefined) {
      return;
    }
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      if (token === undefined) {
        continue;
      }
      const tokenId = String(token.id);
      let occurrences = occurrencesByToken.get(tokenId);
      if (occurrences === undefined) {
        occurrences = [];
        occurrencesByToken.set(tokenId, occurrences);
      }
      occurrences.push({ zoneId, index: tokenIndex, token });
      affectedTokenIds?.add(tokenId);
    }
  };

  const removeZoneOccurrences = (
    zoneId: string,
    tokens: readonly Token[] | undefined,
    affectedTokenIds: Set<string>,
  ): void => {
    if (tokens === undefined) {
      return;
    }
    for (const token of tokens) {
      if (token === undefined) {
        continue;
      }
      affectedTokenIds.add(String(token.id));
    }
    for (const tokenId of affectedTokenIds) {
      const occurrences = occurrencesByToken.get(tokenId);
      if (occurrences === undefined) {
        continue;
      }
      const retained = occurrences.filter((occurrence) => occurrence.zoneId !== zoneId);
      if (retained.length === 0) {
        occurrencesByToken.delete(tokenId);
      } else {
        occurrencesByToken.set(tokenId, retained);
      }
    }
  };

  for (const [zoneId, tokens] of Object.entries(initialState.zones)) {
    addZoneOccurrences(zoneId, tokens);
  }
  for (const tokenId of occurrencesByToken.keys()) {
    refreshIndexEntry(tokenId);
  }

  return {
    read() {
      return index;
    },
    applyZoneDelta(prevZones, nextZones) {
      if (currentZones === nextZones) {
        return;
      }
      ensureWritableIndex();
      const baseZones = currentZones === prevZones ? prevZones : currentZones;
      draftTokenStateIndexDeltaCount += 1;
      ensureZoneRank(nextZones);
      const changedZoneIds = new Set<string>();
      for (const zoneId of Object.keys(baseZones)) {
        if (baseZones[zoneId] !== nextZones[zoneId]) {
          changedZoneIds.add(zoneId);
        }
      }
      for (const zoneId of Object.keys(nextZones)) {
        if (baseZones[zoneId] !== nextZones[zoneId]) {
          changedZoneIds.add(zoneId);
        }
      }

      const affectedTokenIds = new Set<string>();
      for (const zoneId of changedZoneIds) {
        removeZoneOccurrences(zoneId, baseZones[zoneId], affectedTokenIds);
        addZoneOccurrences(zoneId, nextZones[zoneId], affectedTokenIds);
      }
      for (const tokenId of affectedTokenIds) {
        refreshIndexEntry(tokenId);
      }
      currentZones = nextZones;
    },
    attachPreviewState(state) {
      draftTokenStateIndexAttachCount += 1;
      tokenStateIndexByZones.set(state.zones, index);
      indexSharedWithPreviewState = true;
    },
    attachAsCanonical(state) {
      draftTokenStateIndexAttachCount += 1;
      draftTokenStateIndexSnapshotCount += 1;
      tokenStateIndexByZones.set(state.zones, new Map(index));
    },
  };
}

export function createDraftTokenStateIndex(initialState: GameState): MutableTokenStateIndex {
  return buildMutableTokenStateIndex(initialState);
}

export function copyCachedTokenStateIndex(fromState: GameState, toState: GameState): void {
  const cached = tokenStateIndexByZones.get(fromState.zones);
  if (cached !== undefined) {
    tokenStateIndexByZones.set(toState.zones, new Map(cached));
  }
}

export function refreshCachedTokenStateIndexEntries(
  state: GameState,
  affectedTokenIds: ReadonlySet<string>,
  mutatedZoneIds: ReadonlySet<string>,
): boolean {
  const cached = tokenStateIndexByZones.get(state.zones);
  if (cached === undefined) {
    return false;
  }
  const updated = cached instanceof Map ? cached : new Map(cached);

  // Zone rank reproduces buildTokenStateIndex's iteration-order primacy
  // (the first zone encountered in `Object.keys(state.zones)` becomes the
  // primary occurrence). Computed lazily — only allocated when we have a
  // multi-occurrence token whose occurrences need a deterministic order.
  let zoneRank: Map<string, number> | null = null;
  const ensureZoneRank = (): Map<string, number> => {
    if (zoneRank !== null) {
      return zoneRank;
    }
    const ranks = new Map<string, number>();
    let rank = 0;
    for (const zoneId in state.zones) {
      ranks.set(zoneId, rank);
      rank += 1;
    }
    zoneRank = ranks;
    return ranks;
  };

  for (const tokenId of affectedTokenIds) {
    const prior = updated.get(tokenId);
    const zonesToScan = new Set<string>(mutatedZoneIds);
    if (prior !== undefined) {
      if (prior.occurrenceCount <= 1) {
        zonesToScan.add(prior.zoneId);
      } else {
        for (const zoneId of prior.occurrenceZoneIds) {
          zonesToScan.add(zoneId);
        }
      }
    }

    const occurrences: TokenOccurrence[] = [];
    for (const zoneId of zonesToScan) {
      const tokens = state.zones[zoneId];
      if (tokens === undefined) {
        continue;
      }
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
        const token = tokens[tokenIndex];
        if (token !== undefined && String(token.id) === tokenId) {
          occurrences.push({ zoneId, index: tokenIndex, token });
        }
      }
    }

    if (occurrences.length > 1) {
      const ranks = ensureZoneRank();
      occurrences.sort((left, right) => {
        const leftRank = ranks.get(left.zoneId) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = ranks.get(right.zoneId) ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || left.index - right.index;
      });
    }

    const entry = toIndexEntry(occurrences);
    if (entry === undefined) {
      updated.delete(tokenId);
    } else {
      updated.set(tokenId, entry);
    }
  }
  if (!(cached instanceof Map)) {
    tokenStateIndexByZones.set(state.zones, updated);
  }
  return true;
}

export function getTokenStateIndex(state: GameState): ReadonlyMap<string, TokenStateIndexEntry> {
  const cached = tokenStateIndexByZones.get(state.zones);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildTokenStateIndex(state);
  tokenStateIndexByZones.set(state.zones, built);
  return built;
}

export function getTokenStateIndexEntry(state: GameState, tokenId: string): TokenStateIndexEntry | undefined {
  return getTokenStateIndex(state).get(tokenId);
}

/**
 * Invalidate the cached token-state index for a GameState.
 * Must be called after mutable zone mutations so that subsequent
 * lookups rebuild the index from the (now-mutated) zone arrays.
 */
export function invalidateTokenStateIndex(state: GameState): void {
  tokenStateIndexByZones.delete(state.zones);
}

export const __internal_for_tests = {
  buildTokenStateIndex,
  getBuildTokenStateIndexCount: () => buildTokenStateIndexCount,
  getDraftTokenStateIndexAttachCount: () => draftTokenStateIndexAttachCount,
  getDraftTokenStateIndexSnapshotCount: () => draftTokenStateIndexSnapshotCount,
  getDraftTokenStateIndexCowCopyCount: () => draftTokenStateIndexCowCopyCount,
  getDraftTokenStateIndexDeltaCount: () => draftTokenStateIndexDeltaCount,
  resetBuildTokenStateIndexCount: () => {
    buildTokenStateIndexCount = 0;
    draftTokenStateIndexAttachCount = 0;
    draftTokenStateIndexSnapshotCount = 0;
    draftTokenStateIndexCowCopyCount = 0;
    draftTokenStateIndexDeltaCount = 0;
  },
};
