import type { PlayerId, TokenId, ZoneId } from '../branded.js';
import { asPlayerId, asTokenId } from '../branded.js';
import type { EffectAST, GameDef } from '../types.js';

export type EncodedVariableScope = 'global' | 'perPlayer' | 'zone';

export interface EncodedVariableId {
  readonly scope: EncodedVariableScope;
  readonly name: string;
}

export interface TokenLayout {
  readonly tokenCount: number;
  readonly tokenTypeIds: readonly string[];
  readonly tokenIndexById: Readonly<Record<string, number>>;
  readonly tokenTypeIndexById: Readonly<Record<string, number>>;
  readonly propIdsByTokenType: Readonly<Record<string, readonly string[]>>;
}

export interface MarkerLayout {
  readonly markerCount: number;
  readonly zoneMarkerIds: readonly string[];
  readonly globalMarkerIds: readonly string[];
  readonly markerIndexById: Readonly<Record<string, number>>;
  readonly markerStateIdsByMarkerId: Readonly<Record<string, readonly string[]>>;
}

export interface VarLayout {
  readonly variableCount: number;
  readonly globalVariableIds: readonly string[];
  readonly perPlayerVariableIds: readonly string[];
  readonly zoneVariableIds: readonly string[];
  readonly variableIndexById: Readonly<Record<string, number>>;
}

export interface BitsetLayout {
  readonly tokenFlagCount: number;
  readonly tokenFlagWordCount: number;
  readonly zoneMarkerBitCount: number;
  readonly zoneMarkerWordCount: number;
  readonly globalMarkerBitCount: number;
  readonly globalMarkerWordCount: number;
}

export interface EncodedStateLayout {
  readonly zoneIds: readonly ZoneId[];
  readonly tokenIds: readonly TokenId[];
  readonly playerIds: readonly PlayerId[];
  readonly markerIds: readonly string[];
  readonly variableIds: readonly EncodedVariableId[];
  readonly tokenLayout: TokenLayout;
  readonly markerLayout: MarkerLayout;
  readonly varLayout: VarLayout;
  readonly bitsetLayout: BitsetLayout;
}

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const indexByString = (ids: readonly string[]): Readonly<Record<string, number>> =>
  Object.freeze(Object.fromEntries(ids.map((id, index) => [id, index])));

const wordCount64 = (bitCount: number): number => Math.ceil(bitCount / 64);

const stateBitCount = (
  markerIds: readonly string[],
  markerStateIdsByMarkerId: Readonly<Record<string, readonly string[]>>,
): number =>
  markerIds.reduce((count, markerId) => count + (markerStateIdsByMarkerId[markerId]?.length ?? 0), 0);

const variableKey = (variable: EncodedVariableId): string => `${variable.scope}:${variable.name}`;

const collectSetupTokenIds = (effects: readonly EffectAST[]): readonly TokenId[] => {
  const tokenIds: TokenId[] = [];
  let ordinal = 0;

  const visit = (effect: EffectAST): void => {
    if ('createToken' in effect) {
      tokenIds.push(asTokenId(`tok_${effect.createToken.type}_${ordinal}`));
      ordinal += 1;
      return;
    }
    if ('if' in effect) {
      for (const nested of effect.if.then ?? []) visit(nested);
      for (const nested of effect.if.else ?? []) visit(nested);
      return;
    }
    if ('forEach' in effect) {
      for (const nested of effect.forEach.effects) visit(nested);
      for (const nested of effect.forEach.in ?? []) visit(nested);
      return;
    }
    if ('reduce' in effect) {
      for (const nested of effect.reduce.in) visit(nested);
      return;
    }
    if ('removeByPriority' in effect) {
      for (const nested of effect.removeByPriority.in ?? []) visit(nested);
      return;
    }
    if ('let' in effect) {
      for (const nested of effect.let.in) visit(nested);
      return;
    }
    if ('evaluateSubset' in effect) {
      for (const nested of effect.evaluateSubset.compute) visit(nested);
      for (const nested of effect.evaluateSubset.in) visit(nested);
      return;
    }
    if ('rollRandom' in effect) {
      for (const nested of effect.rollRandom.in) visit(nested);
    }
  };

  for (const effect of effects) visit(effect);
  return tokenIds.sort((left, right) => compareStrings(String(left), String(right)));
};

export function buildEncodedStateLayout(def: GameDef): EncodedStateLayout {
  if (!Number.isSafeInteger(def.metadata.players.max) || def.metadata.players.max < 0) {
    throw new Error(`EncodedStateLayout requires a non-negative safe integer player max; received ${def.metadata.players.max}`);
  }

  const zoneIds = [...def.zones]
    .map((zone) => zone.id)
    .sort((left, right) => compareStrings(String(left), String(right)));
  const tokenIds = collectSetupTokenIds(def.setup);
  const playerIds = Array.from({ length: def.metadata.players.max }, (_unused, index) => asPlayerId(index));

  const tokenTypeIds = [...def.tokenTypes].map((tokenType) => tokenType.id).sort(compareStrings);
  const propIdsByTokenType = Object.freeze(Object.fromEntries(
    [...def.tokenTypes]
      .sort((left, right) => compareStrings(left.id, right.id))
      .map((tokenType) => [tokenType.id, Object.freeze(Object.keys(tokenType.props).sort(compareStrings))]),
  ));

  const zoneMarkerIds = [...(def.markerLattices ?? [])].map((marker) => marker.id).sort(compareStrings);
  const globalMarkerIds = [...(def.globalMarkerLattices ?? [])].map((marker) => marker.id).sort(compareStrings);
  const markerIds = [...new Set([...zoneMarkerIds, ...globalMarkerIds])].sort(compareStrings);
  const markerStateIdsByMarkerId = Object.freeze(Object.fromEntries(
    [...(def.markerLattices ?? []), ...(def.globalMarkerLattices ?? [])]
      .sort((left, right) => compareStrings(left.id, right.id))
      .map((marker) => [marker.id, Object.freeze([...marker.states].sort(compareStrings))]),
  ));

  const globalVariableIds = [...def.globalVars].map((variable) => variable.name).sort(compareStrings);
  const perPlayerVariableIds = [...def.perPlayerVars].map((variable) => variable.name).sort(compareStrings);
  const zoneVariableIds = [...(def.zoneVars ?? [])].map((variable) => variable.name).sort(compareStrings);
  const variableIds = [
    ...globalVariableIds.map((name): EncodedVariableId => ({ scope: 'global', name })),
    ...perPlayerVariableIds.map((name): EncodedVariableId => ({ scope: 'perPlayer', name })),
    ...zoneVariableIds.map((name): EncodedVariableId => ({ scope: 'zone', name })),
  ];

  const tokenFlagCount = tokenTypeIds.reduce(
    (count, tokenTypeId) => count + (propIdsByTokenType[tokenTypeId]?.length ?? 0),
    0,
  );
  const zoneMarkerBitCount = stateBitCount(zoneMarkerIds, markerStateIdsByMarkerId);
  const globalMarkerBitCount = stateBitCount(globalMarkerIds, markerStateIdsByMarkerId);

  return Object.freeze({
    zoneIds: Object.freeze(zoneIds),
    tokenIds: Object.freeze(tokenIds),
    playerIds: Object.freeze(playerIds),
    markerIds: Object.freeze(markerIds),
    variableIds: Object.freeze(variableIds),
    tokenLayout: Object.freeze({
      tokenCount: tokenIds.length,
      tokenTypeIds: Object.freeze(tokenTypeIds),
      tokenIndexById: indexByString(tokenIds.map(String)),
      tokenTypeIndexById: indexByString(tokenTypeIds),
      propIdsByTokenType,
    }),
    markerLayout: Object.freeze({
      markerCount: markerIds.length,
      zoneMarkerIds: Object.freeze(zoneMarkerIds),
      globalMarkerIds: Object.freeze(globalMarkerIds),
      markerIndexById: indexByString(markerIds),
      markerStateIdsByMarkerId,
    }),
    varLayout: Object.freeze({
      variableCount: variableIds.length,
      globalVariableIds: Object.freeze(globalVariableIds),
      perPlayerVariableIds: Object.freeze(perPlayerVariableIds),
      zoneVariableIds: Object.freeze(zoneVariableIds),
      variableIndexById: indexByString(variableIds.map(variableKey)),
    }),
    bitsetLayout: Object.freeze({
      tokenFlagCount,
      tokenFlagWordCount: wordCount64(tokenFlagCount),
      zoneMarkerBitCount,
      zoneMarkerWordCount: wordCount64(zoneMarkerBitCount),
      globalMarkerBitCount,
      globalMarkerWordCount: wordCount64(globalMarkerBitCount),
    }),
  });
}
