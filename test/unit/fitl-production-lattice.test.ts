import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';

type MarkerConstraintDef = {
  readonly spaceTypes?: readonly string[];
  readonly populationEquals?: number;
  readonly allowedStates: readonly string[];
};

type MarkerLatticeDef = {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
  readonly constraints?: readonly MarkerConstraintDef[];
};

const readMapLattices = (): {
  readonly markerLattices: readonly MarkerLatticeDef[];
  readonly spaceMarkers: readonly unknown[] | undefined;
} => {
  const markdown = readFileSync(join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md'), 'utf8');
  const parsed = parseGameSpec(markdown);
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in data/games/fire-in-the-lake.md');
  }

  const payload = mapAsset.payload as {
    readonly markerLattices?: readonly MarkerLatticeDef[];
    readonly spaceMarkers?: readonly unknown[];
  };
  assert.ok(Array.isArray(payload.markerLattices));

  return {
    markerLattices: payload.markerLattices,
    spaceMarkers: payload.spaceMarkers,
  };
};

describe('FITL production support/opposition marker lattice', () => {
  it('encodes the canonical supportOpposition lattice with LoC and pop-0 neutral constraints', () => {
    const { markerLattices, spaceMarkers } = readMapLattices();
    assert.equal(markerLattices.length, 1);

    const lattice = markerLattices[0];
    if (lattice === undefined) {
      throw new Error('Expected exactly one marker lattice definition');
    }
    assert.equal(lattice.id, 'supportOpposition');
    assert.deepEqual(
      lattice.states,
      ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
    );
    assert.equal(lattice.defaultState, 'neutral');

    assert.ok(Array.isArray(lattice.constraints));
    assert.equal(lattice.constraints.length, 2);

    const locConstraint = lattice.constraints.find((constraint) => constraint.spaceTypes !== undefined);
    assert.notEqual(locConstraint, undefined);
    assert.deepEqual(locConstraint?.spaceTypes, ['loc']);
    assert.deepEqual(locConstraint?.allowedStates, ['neutral']);

    const popZeroConstraint = lattice.constraints.find((constraint) => constraint.populationEquals !== undefined);
    assert.notEqual(popZeroConstraint, undefined);
    assert.equal(popZeroConstraint?.populationEquals, 0);
    assert.deepEqual(popZeroConstraint?.allowedStates, ['neutral']);

    assert.equal(spaceMarkers === undefined || spaceMarkers.length === 0, true);
  });
});
