import type { GameDef, ZobristFeature, ZobristTable } from './types.js';

const MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const encoder = new TextEncoder();

const fnv1a64 = (input: string): bigint => {
  const bytes = encoder.encode(input);
  let hash = FNV_OFFSET_BASIS_64;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }

  return hash;
};

const encodeVariableDef = (def: {
  readonly name: string;
  readonly type: 'int';
  readonly init: number;
  readonly min: number;
  readonly max: number;
}): string => `name=${def.name}|type=${def.type}|init=${def.init}|min=${def.min}|max=${def.max}`;

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
  }
};

export const createZobristTable = (def: GameDef): ZobristTable => {
  const fingerprint = canonicalizeGameDefFingerprint(def);
  const seed = fnv1a64(`table-seed|fingerprint=${fingerprint}`);
  return { seed, fingerprint };
};

export const zobristKey = (table: ZobristTable, feature: ZobristFeature): bigint =>
  fnv1a64(`zobrist-key-v1|seed=${table.seed.toString(16)}|${encodeFeature(feature)}`);
