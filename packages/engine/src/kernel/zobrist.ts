import type { GameDef, GameState, ZobristFeature, ZobristSortedKeys, ZobristTable } from './types.js';
import type { MutableGameState } from './state-draft.js';
import { canonicalTokenFilterKey } from './hidden-info-grants.js';

const MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
type TokenPlacementFeature = Extract<ZobristFeature, { readonly kind: 'tokenPlacement' }>;
type PerPlayerVarFeature = Extract<ZobristFeature, { readonly kind: 'perPlayerVar' }>;
type ActionUsageFeature = Extract<ZobristFeature, { readonly kind: 'actionUsage' }>;

const fnv1a64 = (input: string): bigint => {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash;
};

const encodeVariableDef = (def: GameDef['globalVars'][number]): string =>
  def.type === 'int'
    ? `name=${def.name}|type=${def.type}|init=${def.init}|min=${def.min}|max=${def.max}|material=${def.material ?? true}`
    : `name=${def.name}|type=${def.type}|init=${def.init}|material=${def.material ?? true}`;

const canonicalizeGameDefFingerprint = (def: GameDef): string => {
  const zones = [...def.zones]
    .map((zone) => {
      const adjacency = [...(zone.adjacentTo ?? [])]
        .map((entry) => {
          const attributes = entry.attributes === undefined
            ? ''
            : Object.entries(entry.attributes)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
              .join(',');
          return [
            `to=${String(entry.to)}`,
            `direction=${entry.direction ?? 'bidirectional'}`,
            `category=${entry.category ?? ''}`,
            `attributes=${attributes}`,
          ].join('|');
        })
        .sort();
      return [
        `id=${String(zone.id)}`,
        `owner=${zone.owner}`,
        `visibility=${zone.visibility}`,
        `ordering=${zone.ordering}`,
        `adjacentTo=${adjacency.join(',')}`,
      ].join('|');
    })
    .sort();

  const tokenTypes = [...def.tokenTypes]
    .map((tokenType) => {
      const props = Object.entries(tokenType.props)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, type]) => `${name}:${type}`)
        .join(',');
      return `id=${tokenType.id}|props=${props}`;
    })
    .sort();

  const globalVars = [...def.globalVars].map(encodeVariableDef).sort();
  const perPlayerVars = [...def.perPlayerVars].map(encodeVariableDef).sort();
  const zoneVars = [...(def.zoneVars ?? [])].map(encodeVariableDef).sort();
  const phases = [
    ...def.turnStructure.phases.map((phase) => `turn:${String(phase.id)}`),
    ...(def.turnStructure.interrupts ?? []).map((phase) => `interrupt:${String(phase.id)}`),
  ].sort();
  const actions = [...def.actions].map((action) => `id=${String(action.id)}`).sort();

  return [
    'zobrist-fingerprint-v1',
    `zones=[${zones.join(';')}]`,
    `tokenTypes=[${tokenTypes.join(';')}]`,
    `globalVars=[${globalVars.join(';')}]`,
    `perPlayerVars=[${perPlayerVars.join(';')}]`,
    `zoneVars=[${zoneVars.join(';')}]`,
    `phases=[${phases.join(';')}]`,
    `actions=[${actions.join(';')}]`,
  ].join('\n');
};

const encodeFeature = (feature: ZobristFeature): string => {
  switch (feature.kind) {
    case 'tokenPlacement':
      return `kind=tokenPlacement|tokenId=${String(feature.tokenId)}|zoneId=${String(feature.zoneId)}|slot=${feature.slot}`;
    case 'globalVar':
      return `kind=globalVar|varName=${feature.varName}|value=${feature.value}`;
    case 'perPlayerVar':
      return `kind=perPlayerVar|playerId=${feature.playerId}|varName=${feature.varName}|value=${feature.value}`;
    case 'activePlayer':
      return `kind=activePlayer|playerId=${feature.playerId}`;
    case 'currentPhase':
      return `kind=currentPhase|phaseId=${String(feature.phaseId)}`;
    case 'turnCount':
      return `kind=turnCount|value=${feature.value}`;
    case 'actionUsage':
      return `kind=actionUsage|actionId=${String(feature.actionId)}|scope=${feature.scope}|count=${feature.count}`;
    case 'markerState':
      return `kind=markerState|spaceId=${feature.spaceId}|markerId=${feature.markerId}|state=${feature.state}`;
    case 'globalMarkerState':
      return `kind=globalMarkerState|markerId=${feature.markerId}|state=${feature.state}`;
    case 'lastingEffect':
      return [
        'kind=lastingEffect',
        `slot=${feature.slot}`,
        `id=${feature.id}`,
        `sourceCardId=${feature.sourceCardId}`,
        `side=${feature.side}`,
        `branchId=${feature.branchId}`,
        `duration=${feature.duration}`,
        `remainingTurnBoundaries=${feature.remainingTurnBoundaries}`,
        `remainingRoundBoundaries=${feature.remainingRoundBoundaries}`,
        `remainingCycleBoundaries=${feature.remainingCycleBoundaries}`,
      ].join('|');
    case 'interruptPhaseFrame':
      return [
        'kind=interruptPhaseFrame',
        `slot=${feature.slot}`,
        `phase=${feature.phase}`,
        `resumePhase=${feature.resumePhase}`,
      ].join('|');
    case 'revealGrant':
      return [
        'kind=revealGrant',
        `zoneId=${feature.zoneId}`,
        `slot=${feature.slot}`,
        `observers=${feature.observers === 'all' ? 'all' : feature.observers.join(',')}`,
        `filter=${feature.filterKey}`,
      ].join('|');
    case 'zoneVar':
      return `kind=zoneVar|zoneId=${feature.zoneId}|varName=${feature.varName}|value=${feature.value}`;
  }
};

const buildSortedKeys = (def: GameDef): ZobristSortedKeys => {
  const cmp = (a: string, b: string): number => a.localeCompare(b);
  const zoneIds = def.zones.map((z) => String(z.id)).sort(cmp);
  const globalVarNames = def.globalVars.map((v) => v.name).sort(cmp);
  const perPlayerIds = Array.from({ length: def.metadata.players.max }, (_, i) => i).sort((a, b) => a - b);
  const perPlayerVarNames = new Map<number, readonly string[]>();
  const ppNames = def.perPlayerVars.map((v) => v.name).sort(cmp);
  for (const pid of perPlayerIds) {
    perPlayerVarNames.set(pid, ppNames);
  }
  const zoneVarDefs = def.zoneVars ?? [];
  const zvNames = zoneVarDefs.map((v) => v.name).sort(cmp);
  const zoneVarZoneIds = [...zoneIds]; // zones with zoneVars — in practice all zones can have zone vars
  const zoneVarNames = new Map<string, readonly string[]>();
  for (const zid of zoneVarZoneIds) {
    zoneVarNames.set(zid, zvNames);
  }
  const actionIds = def.actions.map((a) => String(a.id)).sort(cmp);
  // Markers and reveals depend on runtime state and can't be pre-sorted from def alone.
  // We use empty arrays as defaults — computeFullHash falls back to Object.keys().sort() for these.
  return {
    zoneIds,
    globalVarNames,
    perPlayerIds,
    perPlayerVarNames,
    zoneVarZoneIds,
    zoneVarNames,
    actionIds,
    markerSpaceIds: [],
    markerIds: new Map(),
    globalMarkerIds: [],
    revealZoneIds: [],
  };
};

export const createZobristTable = (def: GameDef): ZobristTable => {
  const fingerprint = canonicalizeGameDefFingerprint(def);
  const seed = fnv1a64(`table-seed|fingerprint=${fingerprint}`);
  return { seed, fingerprint, seedHex: seed.toString(16), keyCache: new Map(), sortedKeys: buildSortedKeys(def) };
};

export const zobristKey = (table: ZobristTable, feature: ZobristFeature): bigint => {
  const encoded = encodeFeature(feature);
  const cached = table.keyCache.get(encoded);
  if (cached !== undefined) {
    return cached;
  }
  const key = fnv1a64(`zobrist-key-v1|seed=${table.seedHex}|${encoded}`);
  table.keyCache.set(encoded, key);
  return key;
};

export const updateHashFeatureChange = (
  hash: bigint,
  table: ZobristTable,
  previous: ZobristFeature,
  next: ZobristFeature,
): bigint => hash ^ zobristKey(table, previous) ^ zobristKey(table, next);

export const updateHashTokenPlacement = (
  hash: bigint,
  table: ZobristTable,
  tokenId: TokenPlacementFeature['tokenId'],
  fromZone: TokenPlacementFeature['zoneId'],
  fromSlot: number,
  toZone: TokenPlacementFeature['zoneId'],
  toSlot: number,
): bigint =>
  updateHashFeatureChange(
    hash,
    table,
    { kind: 'tokenPlacement', tokenId, zoneId: fromZone, slot: fromSlot },
    { kind: 'tokenPlacement', tokenId, zoneId: toZone, slot: toSlot },
  );

/** XOR out the old feature and XOR in the new one on the mutable state's running hash. */
export const updateRunningHash = (
  state: MutableGameState,
  table: ZobristTable,
  oldFeature: ZobristFeature,
  newFeature: ZobristFeature,
): void => {
  state._runningHash ^= zobristKey(table, oldFeature);
  state._runningHash ^= zobristKey(table, newFeature);
};

/** XOR in a new feature (e.g., token created) on the mutable state's running hash. */
export const addToRunningHash = (
  state: MutableGameState,
  table: ZobristTable,
  feature: ZobristFeature,
): void => {
  state._runningHash ^= zobristKey(table, feature);
};

/** XOR out a removed feature (e.g., token destroyed) on the mutable state's running hash. */
export const removeFromRunningHash = (
  state: MutableGameState,
  table: ZobristTable,
  feature: ZobristFeature,
): void => {
  state._runningHash ^= zobristKey(table, feature);
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);
const compareNumbers = (left: number, right: number): number => left - right;

export const computeFullHash = (table: ZobristTable, state: GameState): bigint => {
  let hash = 0n;
  const sk = table.sortedKeys;

  const sortedZoneIds = sk !== null ? sk.zoneIds : Object.keys(state.zones).sort(compareStrings);
  for (const zoneId of sortedZoneIds) {
    const zoneTokens = state.zones[zoneId] ?? [];
    for (let slot = 0; slot < zoneTokens.length; slot++) {
      hash ^= zobristKey(table, {
        kind: 'tokenPlacement',
        tokenId: zoneTokens[slot]!.id,
        zoneId: zoneId as TokenPlacementFeature['zoneId'],
        slot,
      });
    }
  }

  const sortedGlobalVarNames = sk !== null ? sk.globalVarNames : Object.keys(state.globalVars).sort(compareStrings);
  for (const varName of sortedGlobalVarNames) {
    const val = state.globalVars[varName];
    if (val !== undefined) {
      hash ^= zobristKey(table, {
        kind: 'globalVar',
        varName,
        value: val,
      });
    }
  }

  const sortedPerPlayerIds = sk !== null
    ? sk.perPlayerIds
    : Object.keys(state.perPlayerVars).map((value) => Number(value)).sort(compareNumbers);
  for (const playerId of sortedPerPlayerIds) {
    const playerVars = state.perPlayerVars[playerId] ?? {};
    const sortedPerPlayerVarNames = sk !== null
      ? (sk.perPlayerVarNames.get(playerId) ?? Object.keys(playerVars).sort(compareStrings))
      : Object.keys(playerVars).sort(compareStrings);
    for (const varName of sortedPerPlayerVarNames) {
      const val = playerVars[varName];
      if (val !== undefined) {
        hash ^= zobristKey(table, {
          kind: 'perPlayerVar',
          playerId: playerId as PerPlayerVarFeature['playerId'],
          varName,
          value: val,
        });
      }
    }
  }

  const sortedZoneVarZoneIds = sk !== null ? sk.zoneVarZoneIds : Object.keys(state.zoneVars).sort(compareStrings);
  for (const zoneId of sortedZoneVarZoneIds) {
    const zoneVarMap = state.zoneVars[zoneId] ?? {};
    const sortedZoneVarNames = sk !== null
      ? (sk.zoneVarNames.get(zoneId) ?? Object.keys(zoneVarMap).sort(compareStrings))
      : Object.keys(zoneVarMap).sort(compareStrings);
    for (const varName of sortedZoneVarNames) {
      const value = zoneVarMap[varName];
      if (value !== undefined) {
        hash ^= zobristKey(table, {
          kind: 'zoneVar',
          zoneId,
          varName,
          value,
        });
      }
    }
  }

  hash ^= zobristKey(table, { kind: 'activePlayer', playerId: state.activePlayer });
  hash ^= zobristKey(table, { kind: 'currentPhase', phaseId: state.currentPhase });
  hash ^= zobristKey(table, { kind: 'turnCount', value: state.turnCount });

  const sortedActionIds = sk !== null ? sk.actionIds : Object.keys(state.actionUsage).sort(compareStrings);
  for (const actionId of sortedActionIds) {
    const usage = state.actionUsage[actionId];
    if (!usage) {
      continue;
    }

    hash ^= zobristKey(table, {
      kind: 'actionUsage',
      actionId: actionId as ActionUsageFeature['actionId'],
      scope: 'turn',
      count: usage.turnCount,
    });
    hash ^= zobristKey(table, {
      kind: 'actionUsage',
      actionId: actionId as ActionUsageFeature['actionId'],
      scope: 'phase',
      count: usage.phaseCount,
    });
    hash ^= zobristKey(table, {
      kind: 'actionUsage',
      actionId: actionId as ActionUsageFeature['actionId'],
      scope: 'game',
      count: usage.gameCount,
    });
  }

  const sortedMarkerSpaceIds = Object.keys(state.markers).sort(compareStrings);
  for (const spaceId of sortedMarkerSpaceIds) {
    const spaceMarkers = state.markers[spaceId] ?? {};
    const sortedMarkerIds = Object.keys(spaceMarkers).sort(compareStrings);
    for (const markerId of sortedMarkerIds) {
      const markerState = spaceMarkers[markerId];
      if (markerState !== undefined) {
        hash ^= zobristKey(table, {
          kind: 'markerState',
          spaceId,
          markerId,
          state: markerState,
        });
      }
    }
  }

  const sortedGlobalMarkerIds = Object.keys(state.globalMarkers ?? {}).sort(compareStrings);
  for (const markerId of sortedGlobalMarkerIds) {
    const markerState = state.globalMarkers?.[markerId];
    if (markerState !== undefined) {
      hash ^= zobristKey(table, {
        kind: 'globalMarkerState',
        markerId,
        state: markerState,
      });
    }
  }

  const sortedRevealZoneIds = Object.keys(state.reveals ?? {}).sort(compareStrings);
  for (const zoneId of sortedRevealZoneIds) {
    const zoneGrants = state.reveals?.[zoneId] ?? [];
    zoneGrants.forEach((grant, slot) => {
      hash ^= zobristKey(table, {
        kind: 'revealGrant',
        zoneId,
        slot,
        observers: grant.observers,
        filterKey: canonicalTokenFilterKey(grant.filter),
      });
    });
  }

  const activeLastingEffects = state.activeLastingEffects ?? [];
  activeLastingEffects.forEach((effect, slot) => {
    hash ^= zobristKey(table, {
      kind: 'lastingEffect',
      slot,
      id: effect.id,
      sourceCardId: effect.sourceCardId,
      side: effect.side,
      branchId: effect.branchId ?? '',
      duration: effect.duration,
      remainingTurnBoundaries: effect.remainingTurnBoundaries ?? -1,
      remainingRoundBoundaries: effect.remainingRoundBoundaries ?? -1,
      remainingCycleBoundaries: effect.remainingCycleBoundaries ?? -1,
    });
  });

  const interruptPhaseStack = state.interruptPhaseStack ?? [];
  interruptPhaseStack.forEach((frame, slot) => {
    hash ^= zobristKey(table, {
      kind: 'interruptPhaseFrame',
      slot,
      phase: frame.phase,
      resumePhase: frame.resumePhase,
    });
  });

  return hash;
};
