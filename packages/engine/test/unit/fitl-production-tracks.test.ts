import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

type NumericTrackDef = {
  readonly id: string;
  readonly scope: 'global' | 'seat';
  readonly seat?: string;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
};

const readMapTracks = (): NumericTrackDef[] => {
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in production FITL GameSpec source');
  }

  const payload = mapAsset.payload as { readonly tracks?: readonly NumericTrackDef[] };
  assert.ok(Array.isArray(payload.tracks));
  return [...payload.tracks];
};

describe('FITL production numeric tracks', () => {
  it('encodes all 7 numeric tracks with expected scope and bounds', () => {
    const tracks = readMapTracks();
    assert.equal(tracks.length, 8);

    const byId = new Map(tracks.map((track) => [track.id, track]));
    assert.equal(byId.size, 8, 'Track IDs must be unique');

    const factionTracks = tracks.filter((track) => track.scope === 'seat');
    const globalTracks = tracks.filter((track) => track.scope === 'global');
    assert.equal(factionTracks.length, 3);
    assert.equal(globalTracks.length, 5);

    assert.deepEqual(
      factionTracks
        .map((track): readonly [string, string | undefined] => [track.id, track.seat])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        ['arvnResources', 'arvn'],
        ['nvaResources', 'nva'],
        ['vcResources', 'vc'],
      ],
    );
    assert.deepEqual(
      globalTracks.map((track) => track.id).sort(),
      ['aid', 'patronage', 'terrorSabotageMarkersPlaced', 'totalEcon', 'trail'],
    );

    assert.equal(
      tracks.every((track) => track.initial === 0),
      true,
      'All track defaults should remain neutral until scenarios set initial values',
    );

    const resourceTrackIds = ['aid', 'arvnResources', 'nvaResources', 'patronage', 'totalEcon', 'vcResources'];
    assert.equal(
      resourceTrackIds.every((trackId) => byId.get(trackId)?.min === 0 && byId.get(trackId)?.max === 75),
      true,
    );
    assert.equal(byId.get('trail')?.min, 0);
    assert.equal(byId.get('trail')?.max, 4);
    assert.equal(byId.get('terrorSabotageMarkersPlaced')?.min, 0);
    assert.equal(byId.get('terrorSabotageMarkersPlaced')?.max, 15);

    assert.equal(
      factionTracks.every((track) => typeof track.seat === 'string' && track.seat.length > 0),
      true,
      'Faction-scoped tracks must declare a faction',
    );
    assert.equal(
      globalTracks.every((track) => !Object.prototype.hasOwnProperty.call(track, 'faction')),
      true,
      'Global tracks should omit faction',
    );
  });
});
