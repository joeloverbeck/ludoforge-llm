import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';

type MapSpace = {
  readonly id: string;
  readonly spaceType: string;
  readonly population: number;
  readonly econ: number;
  readonly terrainTags: readonly string[];
  readonly country: string;
  readonly coastal: boolean;
  readonly adjacentTo: readonly string[];
};

const readMapSpaces = (): MapSpace[] => {
  const markdown = readFileSync(join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md'), 'utf8');
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in data/games/fire-in-the-lake.md');
  }

  const payload = mapAsset.payload as { readonly spaces?: readonly MapSpace[] };
  assert.ok(Array.isArray(payload.spaces));
  return [...payload.spaces];
};

describe('FITL production map provinces and LoCs', () => {
  it('encodes 22 provinces, 17 LoCs, and 47 total spaces with canonical IDs', () => {
    const spaces = readMapSpaces();
    const provinces = spaces.filter((space) => space.spaceType === 'province');
    const locs = spaces.filter((space) => space.spaceType === 'loc');

    assert.equal(provinces.length, 22);
    assert.equal(locs.length, 17);
    assert.equal(spaces.length, 47);
    assert.equal(spaces.every((space) => /^[a-z0-9]+(?:-[a-z0-9]+)*:none$/.test(space.id)), true);
  });

  it('encodes province country/terrain/population/econ/coastal values and LoC type/econ/coastal values', () => {
    const spaces = readMapSpaces();
    const provinces = spaces.filter((space) => space.spaceType === 'province');
    const locs = spaces.filter((space) => space.spaceType === 'loc');

    const foreignByCountry = new Map<string, readonly string[]>([
      ['laos', ['central-laos:none', 'southern-laos:none']],
      ['cambodia', ['northeast-cambodia:none', 'sihanoukville:none', 'the-fishhook:none', 'the-parrots-beak:none']],
      ['northVietnam', ['north-vietnam:none']],
    ]);

    for (const [country, ids] of foreignByCountry.entries()) {
      assert.deepEqual(
        provinces
          .filter((province) => ids.includes(province.id))
          .map((province) => province.country)
          .sort(),
        ids.map(() => country),
      );
    }
    assert.equal(
      provinces
        .filter((province) => ![...foreignByCountry.values()].flat().includes(province.id))
        .every((province) => province.country === 'southVietnam'),
      true,
    );

    const allowedProvinceTerrain = new Set(['highland', 'lowland', 'jungle']);
    assert.equal(
      provinces.every(
        (province) =>
          province.terrainTags.length === 1 && province.terrainTags.every((tag) => allowedProvinceTerrain.has(tag)),
      ),
      true,
    );
    assert.equal(provinces.every((province) => province.population >= 0 && province.population <= 2), true);
    assert.equal(provinces.every((province) => province.econ === 0), true);

    const expectedCoastalProvinces = new Set([
      'binh-dinh:none',
      'binh-tuy-binh-thuan:none',
      'ba-xuyen:none',
      'khanh-hoa:none',
      'kien-giang-an-xuyen:none',
      'kien-hoa-vinh-binh:none',
      'north-vietnam:none',
      'phu-bon-phu-yen:none',
      'quang-nam:none',
      'quang-tin-quang-ngai:none',
      'quang-tri-thua-thien:none',
      'sihanoukville:none',
    ]);
    assert.deepEqual(
      provinces
        .filter((province) => province.coastal)
        .map((province) => province.id)
        .sort(),
      [...expectedCoastalProvinces].sort(),
    );

    const mekongLocs = new Set([
      'loc-can-tho-bac-lieu:none',
      'loc-can-tho-chau-doc:none',
      'loc-can-tho-long-phu:none',
      'loc-saigon-can-tho:none',
    ]);
    assert.equal(
      locs.every((loc) => loc.terrainTags.includes('highway') || loc.terrainTags.includes('mekong')),
      true,
    );
    assert.equal(locs.filter((loc) => loc.terrainTags.includes('mekong')).every((loc) => mekongLocs.has(loc.id)), true);
    assert.equal(
      locs.filter((loc) => !mekongLocs.has(loc.id)).every((loc) => loc.terrainTags.length === 1 && loc.terrainTags[0] === 'highway'),
      true,
    );
    assert.equal(locs.every((loc) => loc.population === 0), true);

    const expectedLocEcon = new Map<string, number>([
      ['loc-hue-khe-sanh:none', 1],
      ['loc-hue-da-nang:none', 1],
      ['loc-da-nang-dak-to:none', 0],
      ['loc-da-nang-qui-nhon:none', 1],
      ['loc-kontum-dak-to:none', 1],
      ['loc-kontum-qui-nhon:none', 1],
      ['loc-kontum-ban-me-thuot:none', 1],
      ['loc-qui-nhon-cam-ranh:none', 1],
      ['loc-cam-ranh-da-lat:none', 1],
      ['loc-ban-me-thuot-da-lat:none', 0],
      ['loc-saigon-cam-ranh:none', 1],
      ['loc-saigon-da-lat:none', 1],
      ['loc-saigon-an-loc-ban-me-thuot:none', 1],
      ['loc-saigon-can-tho:none', 2],
      ['loc-can-tho-chau-doc:none', 1],
      ['loc-can-tho-bac-lieu:none', 0],
      ['loc-can-tho-long-phu:none', 1],
    ]);
    const actualLocEcon = locs
      .map((loc): [string, number] => [loc.id, loc.econ])
      .sort((left, right) => left[0].localeCompare(right[0]));
    const expectedSortedLocEcon = [...expectedLocEcon.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    assert.deepEqual(
      actualLocEcon,
      expectedSortedLocEcon,
    );
    assert.deepEqual(
      locs.filter((loc) => loc.coastal).map((loc) => loc.id).sort(),
      [
        'loc-can-tho-bac-lieu:none',
        'loc-can-tho-long-phu:none',
        'loc-da-nang-qui-nhon:none',
        'loc-hue-da-nang:none',
        'loc-hue-khe-sanh:none',
        'loc-qui-nhon-cam-ranh:none',
        'loc-saigon-cam-ranh:none',
      ],
    );
    assert.equal(locs.every((loc) => loc.country === 'southVietnam'), true);
  });
});
