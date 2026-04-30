import * as assert from 'node:assert/strict';

import type {
  EncodedState,
  EncodedStateLayout,
  GameState,
  Token,
} from '../../src/kernel/index.js';

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const encodeValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return 0;
};

const hasBit = (array: BigUint64Array, bitIndex: number): boolean => {
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  return ((array[word] ?? 0n) & (1n << offset)) !== 0n;
};

const hasStrideBit = (
  array: BigUint64Array,
  row: number,
  wordCount: number,
  bitIndex: number,
): boolean => {
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  return ((array[row * wordCount + word] ?? 0n) & (1n << offset)) !== 0n;
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

const collectOccurrences = (
  state: GameState,
): ReadonlyMap<string, readonly { readonly zoneId: string; readonly slot: number; readonly token: Token }[]> => {
  const occurrences = new Map<string, { readonly zoneId: string; readonly slot: number; readonly token: Token }[]>();
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    for (let slot = 0; slot < tokens.length; slot += 1) {
      const token = tokens[slot];
      if (token === undefined) {
        continue;
      }
      const tokenId = String(token.id);
      const bucket = occurrences.get(tokenId) ?? [];
      bucket.push({ zoneId, slot, token });
      occurrences.set(tokenId, bucket);
    }
  }
  return occurrences;
};

export const assertEncodedSurfaceParity = (
  state: GameState,
  layout: EncodedStateLayout,
  encoded: EncodedState,
): void => {
  const zoneIndexById = new Map(layout.zoneIds.map((zoneId, index) => [String(zoneId), index]));
  const tokenFlagPositions = tokenFlagBitPositions(layout);
  const zoneMarkerPositions = markerStateBitPositions(layout.markerLayout.zoneMarkerIds, layout.markerLayout.markerStateIdsByMarkerId);
  const globalMarkerPositions = markerStateBitPositions(layout.markerLayout.globalMarkerIds, layout.markerLayout.markerStateIdsByMarkerId);
  const occurrences = collectOccurrences(state);

  const expectedTokenIds = [
    ...layout.tokenIds.map(String),
    ...[...occurrences.keys()]
      .filter((tokenId) => layout.tokenLayout.tokenIndexById[tokenId] === undefined)
      .sort(compareStrings),
  ];
  assert.deepEqual(encoded.tokenIds.map(String), expectedTokenIds);

  for (const [tokenId, tokenOccurrences] of occurrences.entries()) {
    const tokenIndex = encoded.tokenIndexById[tokenId];
    assert.notEqual(tokenIndex, undefined, `encoded token table should contain ${tokenId}`);
    const resolvedTokenIndex = tokenIndex!;
    const firstOccurrence = tokenOccurrences[0]!;
    assert.equal(encoded.tokenZone[resolvedTokenIndex], zoneIndexById.get(firstOccurrence.zoneId));
    assert.equal(encoded.tokenOccurrenceCount[resolvedTokenIndex], tokenOccurrences.length);
    if (tokenOccurrences.length > 1) {
      const offset = encoded.tokenOccurrenceOffset[resolvedTokenIndex];
      assert.notEqual(offset, -1, `duplicate token ${tokenId} should have occurrence offset`);
      const resolvedOffset = offset!;
      assert.deepEqual(
        Array.from(encoded.tokenOccurrenceZones.slice(resolvedOffset, resolvedOffset + tokenOccurrences.length)),
        tokenOccurrences.map((occurrence) => zoneIndexById.get(occurrence.zoneId)),
      );
    }

    for (const occurrence of tokenOccurrences) {
      const zoneIndex = zoneIndexById.get(occurrence.zoneId);
      assert.notEqual(zoneIndex, undefined, `layout should contain zone ${occurrence.zoneId}`);
      const typeIndex = layout.tokenLayout.tokenTypeIndexById[occurrence.token.type];
      assert.notEqual(typeIndex, undefined, `layout should contain token type ${occurrence.token.type}`);
      const occupancyIndex = zoneIndex! * layout.tokenLayout.tokenTypeIds.length + typeIndex!;
      assert.ok(
        (encoded.zoneOccupancy[occupancyIndex] ?? 0) > 0,
        `encoded occupancy should include ${occurrence.token.type} in ${occurrence.zoneId}`,
      );
      for (const [propId, propValue] of Object.entries(occurrence.token.props)) {
        const scalarPropIndex = layout.tokenLayout.scalarPropIndexById[propId];
        if (scalarPropIndex !== undefined) {
          const encodedPropOffset = resolvedTokenIndex * layout.tokenLayout.scalarPropIds.length + scalarPropIndex;
          assert.equal(
            encoded.tokenScalarPropPresent[encodedPropOffset],
            1,
            `encoded tokenScalarPropPresent should set ${occurrence.token.type}.${propId}`,
          );
          const expectedValue = typeof propValue === 'string'
            ? encoded.tokenScalarStringValuesByProp[propId]?.indexOf(propValue)
            : encodeValue(propValue);
          assert.equal(
            encoded.tokenScalarPropValues[encodedPropOffset],
            expectedValue,
            `encoded tokenScalarPropValues should preserve ${occurrence.token.type}.${propId}`,
          );
        }
        const bitIndex = tokenFlagPositions.get(`${occurrence.token.type}:${propId}`);
        if (bitIndex !== undefined && propValue === true) {
          assert.equal(
            hasStrideBit(encoded.tokenFlags, resolvedTokenIndex, layout.bitsetLayout.tokenFlagWordCount, bitIndex),
            true,
            `encoded tokenFlags should set ${occurrence.token.type}.${propId}`,
          );
        }
      }
    }
  }

  for (const [playerKey, vars] of Object.entries(state.perPlayerVars)) {
    const playerIndex = Number(playerKey);
    for (const [varOffset, varName] of layout.varLayout.perPlayerVariableIds.entries()) {
      assert.equal(
        encoded.playerInts[playerIndex * layout.varLayout.perPlayerVariableIds.length + varOffset],
        encodeValue(vars[varName]),
        `encoded playerInts should preserve player ${playerIndex} ${varName}`,
      );
    }
  }

  for (const [zoneId, vars] of Object.entries(state.zoneVars)) {
    const zoneIndex = zoneIndexById.get(zoneId);
    assert.notEqual(zoneIndex, undefined, `layout should contain zone var zone ${zoneId}`);
    for (const [varOffset, varName] of layout.varLayout.zoneVariableIds.entries()) {
      assert.equal(
        encoded.zoneInts[zoneIndex! * layout.varLayout.zoneVariableIds.length + varOffset],
        encodeValue(vars[varName]),
        `encoded zoneInts should preserve ${zoneId} ${varName}`,
      );
    }
  }

  for (const [varOffset, varName] of layout.varLayout.globalVariableIds.entries()) {
    assert.equal(encoded.globals[varOffset], encodeValue(state.globalVars[varName]));
  }

  for (const [zoneId, markers] of Object.entries(state.markers)) {
    const zoneIndex = zoneIndexById.get(zoneId);
    assert.notEqual(zoneIndex, undefined, `layout should contain marker zone ${zoneId}`);
    for (const [markerId, stateId] of Object.entries(markers)) {
      const bitIndex = zoneMarkerPositions.get(`${markerId}:${stateId}`);
      if (bitIndex !== undefined) {
        assert.equal(
          hasStrideBit(encoded.zoneMarkers, zoneIndex!, layout.bitsetLayout.zoneMarkerWordCount, bitIndex),
          true,
          `encoded zoneMarkers should set ${markerId}:${stateId} at ${zoneId}`,
        );
      }
    }
  }

  for (const [markerId, stateId] of Object.entries(state.globalMarkers ?? {})) {
    const bitIndex = globalMarkerPositions.get(`${markerId}:${stateId}`);
    if (bitIndex !== undefined) {
      assert.equal(
        hasBit(encoded.globalMarkers, bitIndex),
        true,
        `encoded globalMarkers should set ${markerId}:${stateId}`,
      );
    }
  }
};
