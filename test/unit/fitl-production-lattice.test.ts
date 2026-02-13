import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';

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
  assertNoErrors(parsed);

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
    assert.equal(markerLattices.length, 3);

    const supportOpposition = markerLattices.find((lattice) => lattice.id === 'supportOpposition');
    assert.ok(supportOpposition, 'Expected supportOpposition lattice');
    assert.deepEqual(
      supportOpposition.states,
      ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
    );
    assert.equal(supportOpposition.defaultState, 'neutral');

    assert.ok(Array.isArray(supportOpposition.constraints));
    assert.equal(supportOpposition.constraints.length, 2);

    const locConstraint = supportOpposition.constraints.find((constraint) => constraint.spaceTypes !== undefined);
    assert.notEqual(locConstraint, undefined);
    assert.deepEqual(locConstraint?.spaceTypes, ['loc']);
    assert.deepEqual(locConstraint?.allowedStates, ['neutral']);

    const popZeroConstraint = supportOpposition.constraints.find((constraint) => constraint.populationEquals !== undefined);
    assert.notEqual(popZeroConstraint, undefined);
    assert.equal(popZeroConstraint?.populationEquals, 0);
    assert.deepEqual(popZeroConstraint?.allowedStates, ['neutral']);

    const terrorLattice = markerLattices.find((lattice) => lattice.id === 'terror');
    assert.ok(terrorLattice, 'Expected terror lattice');
    assert.deepEqual(terrorLattice.states, ['none', 'terror']);
    assert.equal(terrorLattice.defaultState, 'none');
    assert.ok(Array.isArray(terrorLattice.constraints));
    const terrorLocConstraint = terrorLattice.constraints.find((constraint) => constraint.spaceTypes !== undefined);
    assert.deepEqual(terrorLocConstraint?.spaceTypes, ['loc']);
    assert.deepEqual(terrorLocConstraint?.allowedStates, ['none']);

    const sabotageLattice = markerLattices.find((lattice) => lattice.id === 'sabotage');
    assert.ok(sabotageLattice, 'Expected sabotage lattice');
    assert.deepEqual(sabotageLattice.states, ['none', 'sabotage']);
    assert.equal(sabotageLattice.defaultState, 'none');
    assert.ok(Array.isArray(sabotageLattice.constraints));
    const sabotageConstraint = sabotageLattice.constraints.find((constraint) => constraint.spaceTypes !== undefined);
    assert.deepEqual(sabotageConstraint?.spaceTypes, ['city', 'province']);
    assert.deepEqual(sabotageConstraint?.allowedStates, ['none']);

    assert.equal(spaceMarkers === undefined || spaceMarkers.length === 0, true);
  });
});
