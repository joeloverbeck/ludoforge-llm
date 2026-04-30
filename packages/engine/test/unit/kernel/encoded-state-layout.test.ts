// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEncodedStateLayout,
  initialState,
  type EncodedVariableId,
  type GameDef,
} from '../../../src/kernel/index.js';
import {
  getFitlProductionFixture,
  getTexasProductionFixture,
} from '../../helpers/production-spec-helpers.js';

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const sortedStrings = (values: readonly unknown[]): readonly string[] =>
  values.map(String).sort(compareStrings);

const expectedPlayerIds = (def: GameDef): readonly number[] =>
  Array.from({ length: def.metadata.players.max }, (_unused, index) => index);

const initialTokenIds = (def: GameDef): readonly string[] => {
  const state = initialState(def, 1, def.metadata.players.max).state;
  return Object.values(state.zones)
    .flatMap((tokens) => tokens.map((token) => String(token.id)))
    .sort(compareStrings);
};

const markerIds = (def: GameDef): readonly string[] =>
  [
    ...new Set([
      ...(def.markerLattices ?? []).map((marker) => marker.id),
      ...(def.globalMarkerLattices ?? []).map((marker) => marker.id),
    ]),
  ].sort(compareStrings);

const variableIds = (def: GameDef): readonly EncodedVariableId[] => [
  ...def.globalVars
    .map((variable): EncodedVariableId => ({ scope: 'global', name: variable.name }))
    .sort((left, right) => compareStrings(left.name, right.name)),
  ...def.perPlayerVars
    .map((variable): EncodedVariableId => ({ scope: 'perPlayer', name: variable.name }))
    .sort((left, right) => compareStrings(left.name, right.name)),
  ...(def.zoneVars ?? [])
    .map((variable): EncodedVariableId => ({ scope: 'zone', name: variable.name }))
    .sort((left, right) => compareStrings(left.name, right.name)),
];

const scalarTokenPropIds = (def: GameDef): readonly string[] =>
  [...new Set(def.tokenTypes.flatMap((tokenType) => Object.keys(tokenType.props)))].sort(compareStrings);

const assertLayoutMatchesGameDef = (def: GameDef): void => {
  const layout = buildEncodedStateLayout(def);

  assert.deepEqual(layout.zoneIds.map(String), sortedStrings(def.zones.map((zone) => zone.id)));
  assert.deepEqual(layout.tokenIds.map(String), initialTokenIds(def));
  assert.deepEqual(layout.playerIds.map(Number), expectedPlayerIds(def));
  assert.deepEqual(layout.markerIds, markerIds(def));
  assert.deepEqual(layout.variableIds, variableIds(def));

  assert.deepEqual(layout.tokenLayout.tokenTypeIds, sortedStrings(def.tokenTypes.map((tokenType) => tokenType.id)));
  assert.deepEqual(layout.tokenLayout.scalarPropIds, scalarTokenPropIds(def));
  assert.equal(layout.tokenLayout.tokenCount, layout.tokenIds.length);
  for (const [index, tokenId] of layout.tokenIds.entries()) {
    assert.equal(layout.tokenLayout.tokenIndexById[String(tokenId)], index);
  }
  for (const [index, tokenTypeId] of layout.tokenLayout.tokenTypeIds.entries()) {
    assert.equal(layout.tokenLayout.tokenTypeIndexById[tokenTypeId], index);
  }
  for (const [index, propId] of layout.tokenLayout.scalarPropIds.entries()) {
    assert.equal(layout.tokenLayout.scalarPropIndexById[propId], index);
  }

  assert.equal(layout.markerLayout.markerCount, layout.markerIds.length);
  assert.deepEqual(layout.markerLayout.zoneMarkerIds, sortedStrings((def.markerLattices ?? []).map((marker) => marker.id)));
  assert.deepEqual(
    layout.markerLayout.globalMarkerIds,
    sortedStrings((def.globalMarkerLattices ?? []).map((marker) => marker.id)),
  );

  assert.equal(layout.varLayout.variableCount, layout.variableIds.length);
  assert.deepEqual(layout.varLayout.globalVariableIds, sortedStrings(def.globalVars.map((variable) => variable.name)));
  assert.deepEqual(layout.varLayout.perPlayerVariableIds, sortedStrings(def.perPlayerVars.map((variable) => variable.name)));
  assert.deepEqual(layout.varLayout.zoneVariableIds, sortedStrings((def.zoneVars ?? []).map((variable) => variable.name)));
};

describe('encoded-state layout builder', () => {
  it('derives FITL layout tables from the compiled GameDef', () => {
    assertLayoutMatchesGameDef(getFitlProductionFixture().gameDef);
  });

  it('derives Texas Holdem layout tables from the compiled GameDef', () => {
    assertLayoutMatchesGameDef(getTexasProductionFixture().gameDef);
  });

  it('is byte-identical for repeated builder invocations', () => {
    const def = getFitlProductionFixture().gameDef;
    const first = buildEncodedStateLayout(def);
    const second = buildEncodedStateLayout(def);

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it('rejects malformed player-count metadata', () => {
    const def = getTexasProductionFixture().gameDef;
    const malformed: GameDef = {
      ...def,
      metadata: {
        ...def.metadata,
        players: { ...def.metadata.players, max: -1 },
      },
    };

    assert.throws(
      () => buildEncodedStateLayout(malformed),
      /non-negative safe integer player max/,
    );
  });
});
