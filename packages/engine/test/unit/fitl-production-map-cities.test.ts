import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

type CitySpace = {
  readonly id: string;
  readonly category: string;
  readonly attributes: {
    readonly population: number;
    readonly econ: number;
    readonly terrainTags: readonly string[];
    readonly country: string;
    readonly coastal: boolean;
  };
  readonly adjacentTo: readonly string[];
};

const readCitySpaces = (): CitySpace[] => {
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in production FITL GameSpec source');
  }

  const payload = mapAsset.payload as { readonly spaces?: readonly CitySpace[] };
  assert.ok(Array.isArray(payload.spaces));

  return payload.spaces.filter((space) => space.category === 'city');
};

describe('FITL production map cities', () => {
  it('encodes all 8 cities with expected IDs and base attributes', () => {
    const cities = readCitySpaces();

    assert.equal(cities.length, 8);
    assert.deepEqual(
      cities.map((city) => city.id).sort(),
      ['an-loc:none', 'cam-ranh:none', 'can-tho:none', 'da-nang:none', 'hue:none', 'kontum:none', 'qui-nhon:none', 'saigon:none'],
    );
    assert.equal(cities.every((city) => /^[a-z0-9]+(?:-[a-z0-9]+)*:none$/.test(city.id)), true);
    assert.equal(cities.every((city) => city.attributes.terrainTags.length === 0), true);
    assert.equal(cities.every((city) => city.adjacentTo.every((adjacentId) => adjacentId.endsWith(':none'))), true);
  });

  it('encodes population, econ, coastal split, and country values per ticket', () => {
    const cities = readCitySpaces();
    const byId = new Map(cities.map((city) => [city.id, city]));

    assert.equal(byId.get('saigon:none')?.attributes.population, 6);
    assert.equal(byId.get('hue:none')?.attributes.population, 2);
    assert.equal(
      ['da-nang:none', 'kontum:none', 'qui-nhon:none', 'cam-ranh:none', 'an-loc:none', 'can-tho:none'].every(
        (id) => byId.get(id)?.attributes.population === 1,
      ),
      true,
    );
    assert.equal(cities.every((city) => city.attributes.econ === 0), true);
    assert.deepEqual(
      cities.filter((city) => city.attributes.coastal).map((city) => city.id).sort(),
      ['cam-ranh:none', 'da-nang:none', 'hue:none', 'qui-nhon:none', 'saigon:none'],
    );
    assert.deepEqual(
      cities.filter((city) => !city.attributes.coastal).map((city) => city.id).sort(),
      ['an-loc:none', 'can-tho:none', 'kontum:none'],
    );
    assert.equal(cities.every((city) => city.attributes.country === 'southVietnam'), true);
  });
});
