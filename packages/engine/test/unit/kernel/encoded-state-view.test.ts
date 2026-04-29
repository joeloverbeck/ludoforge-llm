// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asTokenId,
  buildEncodedState,
  buildEncodedStateLayout,
  initialState,
  SENTINEL_NONE,
  type GameState,
  type Token,
} from '../../../src/kernel/index.js';
import { assertEncodedSurfaceParity } from '../../helpers/encoded-state-assertions.js';
import {
  getFitlProductionFixture,
  getTexasProductionFixture,
} from '../../helpers/production-spec-helpers.js';

const firstOccupiedZone = (state: GameState): readonly [string, readonly Token[]] => {
  const entry = Object.entries(state.zones).find(([, tokens]) => tokens.length > 0);
  assert.notEqual(entry, undefined, 'expected fixture state to contain at least one token');
  return entry!;
};

const laterZone = (state: GameState, afterZone: string): string => {
  const zoneIds = Object.keys(state.zones);
  const start = zoneIds.indexOf(afterZone);
  const zoneId = zoneIds.slice(start + 1).find((candidate) => candidate !== afterZone) ?? zoneIds.find((candidate) => candidate !== afterZone);
  assert.notEqual(zoneId, undefined, 'expected a second zone');
  return zoneId!;
};

const tokenTypeWithBooleanProp = (state: GameState): string | undefined => {
  for (const tokens of Object.values(state.zones)) {
    for (const token of tokens) {
      if (Object.values(token.props).some((value) => typeof value === 'boolean')) {
        return token.type;
      }
    }
  }
  return undefined;
};

describe('encoded-state view builder', () => {
  it('encodes token locations, occupancy, flags, variables, and markers for FITL', () => {
    const def = getFitlProductionFixture().gameDef;
    const state = initialState(def, 149005, def.metadata.players.max).state;
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);

    assertEncodedSurfaceParity(state, layout, encoded);
    assert.equal(encoded.tokenZone.length, encoded.tokenIds.length);
    assert.equal(encoded.zoneOccupancy.length, layout.zoneIds.length * layout.tokenLayout.tokenTypeIds.length);
  });

  it('encodes Texas Holdem without game-specific branches', () => {
    const def = getTexasProductionFixture().gameDef;
    const state = initialState(def, 149006, def.metadata.players.max).state;
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);

    assertEncodedSurfaceParity(state, layout, encoded);
  });

  it('records duplicate token occurrences using canonical zone order plus an occurrence pointer', () => {
    const def = getFitlProductionFixture().gameDef;
    const base = initialState(def, 149007, def.metadata.players.max).state;
    const [sourceZone, sourceTokens] = firstOccupiedZone(base);
    const duplicateToken = sourceTokens[0]!;
    const duplicateZone = laterZone(base, sourceZone);
    const state: GameState = {
      ...base,
      zones: {
        ...base.zones,
        [duplicateZone]: [duplicateToken, ...(base.zones[duplicateZone] ?? [])],
      },
    };
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);
    const tokenIndex = encoded.tokenIndexById[String(duplicateToken.id)];

    assert.notEqual(tokenIndex, undefined);
    assert.equal(encoded.tokenOccurrenceCount[tokenIndex!], 2);
    assert.notEqual(encoded.tokenOccurrenceOffset[tokenIndex!], SENTINEL_NONE);
    assert.equal(encoded.tokenZone[tokenIndex!], layout.zoneIds.map(String).indexOf(sourceZone));
    assertEncodedSurfaceParity(state, layout, encoded);
  });

  it('extends the token table deterministically for runtime-created token ids absent from the layout', () => {
    const def = getFitlProductionFixture().gameDef;
    const base = initialState(def, 149008, def.metadata.players.max).state;
    const [zoneId] = firstOccupiedZone(base);
    const booleanTokenType = tokenTypeWithBooleanProp(base) ?? def.tokenTypes[0]!.id;
    const runtimeToken: Token = {
      id: asTokenId(`tok_${booleanTokenType}_${base.nextTokenOrdinal + 1000}`),
      type: booleanTokenType,
      props: { runtimeFlag: true },
    };
    const state: GameState = {
      ...base,
      zones: {
        ...base.zones,
        [zoneId]: [runtimeToken, ...(base.zones[zoneId] ?? [])],
      },
    };
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);

    assert.equal(layout.tokenLayout.tokenIndexById[String(runtimeToken.id)], undefined);
    const runtimeTokenIndex = encoded.tokenIndexById[String(runtimeToken.id)];
    assert.notEqual(runtimeTokenIndex, undefined);
    assert.ok(runtimeTokenIndex! >= layout.tokenIds.length);
    assertEncodedSurfaceParity(state, layout, encoded);
  });
});
