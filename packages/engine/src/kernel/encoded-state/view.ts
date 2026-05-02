import type { TokenId } from '../branded.js';
import { asTokenId } from '../branded.js';
import type { GameState, Token } from '../types.js';
import type { EncodedStateLayout } from './layout.js';

export const SENTINEL_NONE = -1;

export interface EncodedState {
  readonly tokenIds: readonly TokenId[];
  readonly tokenIndexById: Readonly<Record<string, number>>;
  readonly tokenTypeByIndex: readonly string[];
  readonly tokenZone: Int16Array;
  readonly tokenOccurrenceOffset: Int32Array;
  readonly tokenOccurrenceCount: Int16Array;
  readonly tokenOccurrenceZones: Int16Array;
  readonly tokenFlags: BigUint64Array;
  readonly tokenScalarPropValues: Int32Array;
  readonly tokenScalarPropPresent: Uint8Array;
  readonly tokenScalarStringValuesByProp: Readonly<Record<string, readonly string[]>>;
  readonly zoneOccupancy: Int16Array;
  readonly playerInts: Int32Array;
  readonly zoneInts: Int32Array;
  readonly zoneMarkers: BigUint64Array;
  readonly globalMarkers: BigUint64Array;
  readonly globals: Int32Array;
}

interface TokenOccurrence {
  readonly zoneId: string;
  readonly zoneIndex: number;
  readonly zoneRank: number;
  readonly slot: number;
  readonly token: Token;
}

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const indexByString = (ids: readonly string[]): Readonly<Record<string, number>> =>
  Object.freeze(Object.fromEntries(ids.map((id, index) => [id, index])));

const encodeValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return 0;
};

const setBit = (array: BigUint64Array, bitIndex: number): void => {
  if (bitIndex < 0) {
    return;
  }
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  array[word] = (array[word] ?? 0n) | (1n << offset);
};

const setBitInStride = (
  array: BigUint64Array,
  row: number,
  wordCount: number,
  bitIndex: number,
): void => {
  if (wordCount === 0) {
    return;
  }
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  const arrayIndex = row * wordCount + word;
  array[arrayIndex] = (array[arrayIndex] ?? 0n) | (1n << offset);
};

const markerStateBitPositions = (
  markerIds: readonly string[],
  markerStateIdsByMarkerId: Readonly<Record<string, readonly string[]>>,
): ReadonlyMap<string, number> => {
  const positions = new Map<string, number>();
  let bit = 0;
  for (const markerId of markerIds) {
    for (const stateId of markerStateIdsByMarkerId[markerId] ?? []) {
      positions.set(`${markerId}:${stateId}`, bit);
      bit += 1;
    }
  }
  return positions;
};

const tokenFlagBitPositions = (
  layout: EncodedStateLayout,
): ReadonlyMap<string, number> => {
  const positions = new Map<string, number>();
  let bit = 0;
  for (const tokenTypeId of layout.tokenLayout.tokenTypeIds) {
    for (const propId of layout.tokenLayout.propIdsByTokenType[tokenTypeId] ?? []) {
      positions.set(`${tokenTypeId}:${propId}`, bit);
      bit += 1;
    }
  }
  return positions;
};

const collectTokenScalarStringValues = (
  state: GameState,
  layout: EncodedStateLayout,
): Readonly<Record<string, readonly string[]>> => {
  const valuesByProp = new Map<string, Set<string>>();
  for (const propId of layout.tokenLayout.scalarPropIds) {
    if (layout.tokenLayout.scalarPropTypesById[propId] === 'int' || layout.tokenLayout.scalarPropTypesById[propId] === 'boolean') {
      continue;
    }
    valuesByProp.set(propId, new Set());
  }
  for (const tokens of Object.values(state.zones)) {
    for (const token of tokens) {
      for (const [propId, propValue] of Object.entries(token.props)) {
        if (typeof propValue !== 'string') {
          continue;
        }
        valuesByProp.get(propId)?.add(propValue);
      }
    }
  }
  return Object.freeze(Object.fromEntries(
    [...valuesByProp.entries()].map(([propId, values]) => [
      propId,
      Object.freeze([...values].sort(compareStrings)),
    ]),
  ));
};

const collectEffectiveTokenIds = (
  state: GameState,
  layout: EncodedStateLayout,
): readonly TokenId[] => {
  const known = new Set(layout.tokenIds.map(String));
  const extras = new Set<string>();
  for (const tokens of Object.values(state.zones)) {
    for (const token of tokens) {
      const tokenId = String(token.id);
      if (!known.has(tokenId)) {
        extras.add(tokenId);
      }
    }
  }
  return Object.freeze([
    ...layout.tokenIds,
    ...[...extras].sort(compareStrings).map(asTokenId),
  ]);
};

const collectTokenOccurrences = (
  state: GameState,
  layout: EncodedStateLayout,
): ReadonlyMap<string, readonly TokenOccurrence[]> => {
  const zoneIndexById = layout.zoneIds.reduce((acc, zoneId, index) => {
    acc.set(String(zoneId), index);
    return acc;
  }, new Map<string, number>());
  const occurrences = new Map<string, TokenOccurrence[]>();
  const zoneOrder = Object.keys(state.zones);

  for (const [zoneRank, zoneId] of zoneOrder.entries()) {
    const zoneIndex = zoneIndexById.get(zoneId);
    if (zoneIndex === undefined) {
      throw new Error(`EncodedState cannot encode unknown zone id: ${zoneId}`);
    }
    const tokens = state.zones[zoneId] ?? [];
    for (let slot = 0; slot < tokens.length; slot += 1) {
      const token = tokens[slot];
      if (token === undefined) {
        continue;
      }
      const tokenId = String(token.id);
      const bucket = occurrences.get(tokenId) ?? [];
      bucket.push({ zoneId, zoneIndex, zoneRank, slot, token });
      occurrences.set(tokenId, bucket);
    }
  }

  for (const bucket of occurrences.values()) {
    bucket.sort((left, right) => left.zoneRank - right.zoneRank || left.slot - right.slot);
  }
  return occurrences;
};

const assertKnownTokenType = (
  token: Token,
  layout: EncodedStateLayout,
): number => {
  const typeIndex = layout.tokenLayout.tokenTypeIndexById[token.type];
  if (typeIndex === undefined) {
    throw new Error(`EncodedState cannot encode unknown token type: ${token.type}`);
  }
  return typeIndex;
};

const encodeScalarTokenProp = (
  propId: string,
  propValue: number | string | boolean,
  stringValuesByProp: Readonly<Record<string, readonly string[]>>,
): number | undefined => {
  if (typeof propValue === 'number') {
    return propValue;
  }
  if (typeof propValue === 'boolean') {
    return propValue ? 1 : 0;
  }
  const stringIndex = stringValuesByProp[propId]?.indexOf(propValue);
  return stringIndex === undefined || stringIndex < 0 ? undefined : stringIndex;
};

export function buildEncodedState(state: GameState, layout: EncodedStateLayout): EncodedState {
  const tokenIds = collectEffectiveTokenIds(state, layout);
  const tokenIndexById = indexByString(tokenIds.map(String));
  const tokenOccurrences = collectTokenOccurrences(state, layout);
  const tokenFlagPositions = tokenFlagBitPositions(layout);
  const tokenScalarStringValuesByProp = collectTokenScalarStringValues(state, layout);
  const zoneMarkerPositions = markerStateBitPositions(layout.markerLayout.zoneMarkerIds, layout.markerLayout.markerStateIdsByMarkerId);
  const globalMarkerPositions = markerStateBitPositions(layout.markerLayout.globalMarkerIds, layout.markerLayout.markerStateIdsByMarkerId);

  const tokenTypeByIndex = Array.from({ length: tokenIds.length }, () => '');
  const tokenZone = new Int16Array(tokenIds.length);
  tokenZone.fill(SENTINEL_NONE);
  const tokenOccurrenceOffset = new Int32Array(tokenIds.length);
  tokenOccurrenceOffset.fill(SENTINEL_NONE);
  const tokenOccurrenceCount = new Int16Array(tokenIds.length);
  const occurrenceZones: number[] = [];
  const tokenFlags = new BigUint64Array(tokenIds.length * layout.bitsetLayout.tokenFlagWordCount);
  const tokenScalarPropValues = new Int32Array(tokenIds.length * layout.tokenLayout.scalarPropIds.length);
  const tokenScalarPropPresent = new Uint8Array(tokenIds.length * layout.tokenLayout.scalarPropIds.length);
  const zoneOccupancy = new Int16Array(layout.zoneIds.length * layout.tokenLayout.tokenTypeIds.length);

  for (const [tokenId, occurrences] of tokenOccurrences.entries()) {
    const tokenIndex = tokenIndexById[tokenId];
    if (tokenIndex === undefined) {
      continue;
    }
    const canonical = occurrences[0];
    if (canonical === undefined) {
      continue;
    }
    tokenTypeByIndex[tokenIndex] = canonical.token.type;
    tokenZone[tokenIndex] = canonical.zoneIndex;
    tokenOccurrenceCount[tokenIndex] = occurrences.length;
    if (occurrences.length > 1) {
      tokenOccurrenceOffset[tokenIndex] = occurrenceZones.length;
      occurrenceZones.push(...occurrences.map((occurrence) => occurrence.zoneIndex));
    }

    for (const occurrence of occurrences) {
      const typeIndex = assertKnownTokenType(occurrence.token, layout);
      const occupancyIndex = occurrence.zoneIndex * layout.tokenLayout.tokenTypeIds.length + typeIndex;
      zoneOccupancy[occupancyIndex] = (zoneOccupancy[occupancyIndex] ?? 0) + 1;
      for (const [propId, propValue] of Object.entries(occurrence.token.props)) {
        if (propValue !== true) {
          continue;
        }
        const bitIndex = tokenFlagPositions.get(`${occurrence.token.type}:${propId}`);
        if (bitIndex !== undefined) {
          setBitInStride(tokenFlags, tokenIndex, layout.bitsetLayout.tokenFlagWordCount, bitIndex);
        }
      }
      for (const [propId, propValue] of Object.entries(occurrence.token.props)) {
        const propIndex = layout.tokenLayout.scalarPropIndexById[propId];
        if (propIndex === undefined) {
          continue;
        }
        const encodedValue = encodeScalarTokenProp(propId, propValue, tokenScalarStringValuesByProp);
        if (encodedValue === undefined) {
          continue;
        }
        const scalarIndex = tokenIndex * layout.tokenLayout.scalarPropIds.length + propIndex;
        tokenScalarPropValues[scalarIndex] = encodedValue;
        tokenScalarPropPresent[scalarIndex] = 1;
      }
    }
  }

  const playerInts = new Int32Array(layout.playerIds.length * layout.varLayout.perPlayerVariableIds.length);
  for (const [playerKey, vars] of Object.entries(state.perPlayerVars)) {
    const playerIndex = Number(playerKey);
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= layout.playerIds.length) {
      continue;
    }
    for (const [varOffset, varName] of layout.varLayout.perPlayerVariableIds.entries()) {
      playerInts[playerIndex * layout.varLayout.perPlayerVariableIds.length + varOffset] = encodeValue(vars[varName]);
    }
  }

  const zoneInts = new Int32Array(layout.zoneIds.length * layout.varLayout.zoneVariableIds.length);
  const zoneIndexById = indexByString(layout.zoneIds.map(String));
  for (const [zoneId, vars] of Object.entries(state.zoneVars)) {
    const zoneIndex = zoneIndexById[zoneId];
    if (zoneIndex === undefined) {
      continue;
    }
    for (const [varOffset, varName] of layout.varLayout.zoneVariableIds.entries()) {
      zoneInts[zoneIndex * layout.varLayout.zoneVariableIds.length + varOffset] = encodeValue(vars[varName]);
    }
  }

  const zoneMarkers = new BigUint64Array(layout.zoneIds.length * layout.bitsetLayout.zoneMarkerWordCount);
  for (const [zoneId, markers] of Object.entries(state.markers)) {
    const zoneIndex = zoneIndexById[zoneId];
    if (zoneIndex === undefined) {
      continue;
    }
    for (const [markerId, stateId] of Object.entries(markers)) {
      const bitIndex = zoneMarkerPositions.get(`${markerId}:${stateId}`);
      if (bitIndex !== undefined) {
        setBitInStride(zoneMarkers, zoneIndex, layout.bitsetLayout.zoneMarkerWordCount, bitIndex);
      }
    }
  }

  const globalMarkers = new BigUint64Array(layout.bitsetLayout.globalMarkerWordCount);
  for (const [markerId, stateId] of Object.entries(state.globalMarkers ?? {})) {
    const bitIndex = globalMarkerPositions.get(`${markerId}:${stateId}`);
    if (bitIndex !== undefined) {
      setBit(globalMarkers, bitIndex);
    }
  }

  const globals = new Int32Array(layout.varLayout.globalVariableIds.length);
  for (const [index, varName] of layout.varLayout.globalVariableIds.entries()) {
    globals[index] = encodeValue(state.globalVars[varName]);
  }

  return {
    tokenIds,
    tokenIndexById,
    tokenTypeByIndex: Object.freeze(tokenTypeByIndex),
    tokenZone,
    tokenOccurrenceOffset,
    tokenOccurrenceCount,
    tokenOccurrenceZones: Int16Array.from(occurrenceZones),
    tokenFlags,
    tokenScalarPropValues,
    tokenScalarPropPresent,
    tokenScalarStringValuesByProp,
    zoneOccupancy,
    playerInts,
    zoneInts,
    zoneMarkers,
    globalMarkers,
    globals,
  };
}
