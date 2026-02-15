import type { GameDef, GameState, ZobristFeature, ZobristTable } from './types.js';

const MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const encoder = new TextEncoder();
type TokenPlacementFeature = Extract<ZobristFeature, { readonly kind: 'tokenPlacement' }>;
type PerPlayerVarFeature = Extract<ZobristFeature, { readonly kind: 'perPlayerVar' }>;
type ActionUsageFeature = Extract<ZobristFeature, { readonly kind: 'actionUsage' }>;

const fnv1a64 = (input: string): bigint => {
  const bytes = encoder.encode(input);
  let hash = FNV_OFFSET_BASIS_64;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }

  return hash;
};

const encodeVariableDef = (def: GameDef['globalVars'][number]): string =>
  def.type === 'int'
    ? `name=${def.name}|type=${def.type}|init=${def.init}|min=${def.min}|max=${def.max}`
    : `name=${def.name}|type=${def.type}|init=${def.init}`;

const canonicalizeGameDefFingerprint = (def: GameDef): string => {
  const zones = [...def.zones]
    .map((zone) => {
      const adjacency = [...(zone.adjacentTo ?? [])].map((id) => String(id)).sort();
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
  const phases = [...def.turnStructure.phases].map((phase) => `id=${String(phase.id)}`).sort();
  const actions = [...def.actions].map((action) => `id=${String(action.id)}`).sort();

  return [
    'zobrist-fingerprint-v1',
    `zones=[${zones.join(';')}]`,
    `tokenTypes=[${tokenTypes.join(';')}]`,
    `globalVars=[${globalVars.join(';')}]`,
    `perPlayerVars=[${perPlayerVars.join(';')}]`,
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
  }
};

export const createZobristTable = (def: GameDef): ZobristTable => {
  const fingerprint = canonicalizeGameDefFingerprint(def);
  const seed = fnv1a64(`table-seed|fingerprint=${fingerprint}`);
  return { seed, fingerprint };
};

export const zobristKey = (table: ZobristTable, feature: ZobristFeature): bigint =>
  fnv1a64(`zobrist-key-v1|seed=${table.seed.toString(16)}|${encodeFeature(feature)}`);

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

const compareStrings = (left: string, right: string): number => left.localeCompare(right);
const compareNumbers = (left: number, right: number): number => left - right;

export const computeFullHash = (table: ZobristTable, state: GameState): bigint => {
  let hash = 0n;

  const sortedZoneIds = Object.keys(state.zones).sort(compareStrings);
  for (const zoneId of sortedZoneIds) {
    const zoneTokens = state.zones[zoneId] ?? [];
    zoneTokens.forEach((token, slot) => {
      hash ^= zobristKey(table, {
        kind: 'tokenPlacement',
        tokenId: token.id,
        zoneId: zoneId as TokenPlacementFeature['zoneId'],
        slot,
      });
    });
  }

  const sortedGlobalVarNames = Object.keys(state.globalVars).sort(compareStrings);
  for (const varName of sortedGlobalVarNames) {
    hash ^= zobristKey(table, {
      kind: 'globalVar',
      varName,
      value: state.globalVars[varName] ?? 0,
    });
  }

  const sortedPerPlayerIds = Object.keys(state.perPlayerVars)
    .map((value) => Number(value))
    .sort(compareNumbers);
  for (const playerId of sortedPerPlayerIds) {
    const playerVars = state.perPlayerVars[String(playerId)] ?? {};
    const sortedPerPlayerVarNames = Object.keys(playerVars).sort(compareStrings);
    for (const varName of sortedPerPlayerVarNames) {
      hash ^= zobristKey(table, {
        kind: 'perPlayerVar',
        playerId: playerId as PerPlayerVarFeature['playerId'],
        varName,
        value: playerVars[varName] ?? 0,
      });
    }
  }

  hash ^= zobristKey(table, { kind: 'activePlayer', playerId: state.activePlayer });
  hash ^= zobristKey(table, { kind: 'currentPhase', phaseId: state.currentPhase });
  hash ^= zobristKey(table, { kind: 'turnCount', value: state.turnCount });

  const sortedActionIds = Object.keys(state.actionUsage).sort(compareStrings);
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
