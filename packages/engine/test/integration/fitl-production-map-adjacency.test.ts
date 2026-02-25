import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

type MapSpace = {
  readonly id: string;
  readonly adjacentTo: ReadonlyArray<{ readonly to: string }>;
};

const readMapSpaces = (): MapSpace[] => {
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in production FITL GameSpec source');
  }

  const payload = mapAsset.payload as { readonly spaces?: readonly MapSpace[] };
  assert.ok(Array.isArray(payload.spaces));
  return [...payload.spaces];
};

describe('FITL production map adjacency graph', () => {
  it('contains only valid, non-self, non-duplicate adjacency IDs and no isolated spaces', () => {
    const spaces = readMapSpaces();
    const byId = new Map(spaces.map((space) => [space.id, space]));

    for (const space of spaces) {
      assert.ok(space.adjacentTo.length >= 1, `${space.id} should not be isolated`);
      assert.equal(space.adjacentTo.some((adjacent) => adjacent.to === space.id), false, `${space.id} should not include itself`);
      assert.equal(new Set(space.adjacentTo.map((adjacent) => adjacent.to)).size, space.adjacentTo.length, `${space.id} has duplicate adjacency`);
      assert.equal(
        space.adjacentTo.every((adjacent) => byId.has(adjacent.to)),
        true,
        `${space.id} has adjacency to unknown space`,
      );
    }
  });

  it('is symmetric for every listed edge', () => {
    const spaces = readMapSpaces();
    const byId = new Map(spaces.map((space) => [space.id, space]));

    for (const space of spaces) {
      for (const adjacentEntry of space.adjacentTo) {
        const adjacentId = adjacentEntry.to;
        const adjacent = byId.get(adjacentId);
        assert.ok(adjacent !== undefined, `Expected adjacent space ${adjacentId} for ${space.id}`);
        assert.equal(adjacent.adjacentTo.some((entry) => entry.to === space.id), true, `${space.id} -> ${adjacentId} is not symmetric`);
      }
    }
  });

  it('matches key city adjacency counts', () => {
    const spaces = readMapSpaces();
    const byId = new Map(spaces.map((space) => [space.id, space]));

    assert.equal(byId.get('hue:none')?.adjacentTo.length, 3);
    assert.equal(byId.get('saigon:none')?.adjacentTo.length, 9);
    assert.equal(byId.get('can-tho:none')?.adjacentTo.length, 8);
  });

  it('includes required LoC-to-LoC adjacency links', () => {
    const spaces = readMapSpaces();
    const byId = new Map(spaces.map((space) => [space.id, space]));
    const requiredPairs: ReadonlyArray<readonly [string, string]> = [
      ['loc-da-nang-dak-to:none', 'loc-kontum-dak-to:none'],
      ['loc-kontum-ban-me-thuot:none', 'loc-ban-me-thuot-da-lat:none'],
      ['loc-kontum-ban-me-thuot:none', 'loc-saigon-an-loc-ban-me-thuot:none'],
      ['loc-cam-ranh-da-lat:none', 'loc-ban-me-thuot-da-lat:none'],
      ['loc-cam-ranh-da-lat:none', 'loc-saigon-da-lat:none'],
      ['loc-ban-me-thuot-da-lat:none', 'loc-saigon-da-lat:none'],
      ['loc-ban-me-thuot-da-lat:none', 'loc-saigon-an-loc-ban-me-thuot:none'],
    ];

    for (const [left, right] of requiredPairs) {
      assert.equal(byId.get(left)?.adjacentTo.some((entry) => entry.to === right), true, `Missing ${left} -> ${right}`);
      assert.equal(byId.get(right)?.adjacentTo.some((entry) => entry.to === left), true, `Missing ${right} -> ${left}`);
    }
  });
});
