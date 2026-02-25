import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

type MarkerConstraintDef = {
  readonly category?: readonly string[];
  readonly attributeEquals?: Readonly<Record<string, unknown>>;
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
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);

  const mapAsset = parsed.doc.dataAssets?.find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
  if (mapAsset === undefined) {
    throw new Error('Expected fitl-map-production map asset to exist in production FITL GameSpec source');
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
    assert.equal(markerLattices.length, 5);

    const supportOpposition = markerLattices.find((lattice) => lattice.id === 'supportOpposition');
    assert.ok(supportOpposition, 'Expected supportOpposition lattice');
    assert.deepEqual(
      supportOpposition.states,
      ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
    );
    assert.equal(supportOpposition.defaultState, 'neutral');

    assert.ok(Array.isArray(supportOpposition.constraints));
    assert.equal(supportOpposition.constraints.length, 2);

    const locConstraint = supportOpposition.constraints.find((constraint) => constraint.category !== undefined);
    assert.notEqual(locConstraint, undefined);
    assert.deepEqual(locConstraint?.category, ['loc']);
    assert.deepEqual(locConstraint?.allowedStates, ['neutral']);

    const popZeroConstraint = supportOpposition.constraints.find((constraint) => constraint.attributeEquals !== undefined);
    assert.notEqual(popZeroConstraint, undefined);
    assert.equal((popZeroConstraint?.attributeEquals as Record<string, unknown> | undefined)?.population, 0);
    assert.deepEqual(popZeroConstraint?.allowedStates, ['neutral']);

    const sabotageLattice = markerLattices.find((lattice) => lattice.id === 'sabotage');
    assert.ok(sabotageLattice, 'Expected sabotage lattice');
    assert.deepEqual(sabotageLattice.states, ['none', 'sabotage']);
    assert.equal(sabotageLattice.defaultState, 'none');
    assert.ok(Array.isArray(sabotageLattice.constraints));
    const sabotageConstraint = sabotageLattice.constraints.find((constraint) => constraint.category !== undefined);
    assert.deepEqual(sabotageConstraint?.category, ['city', 'province']);
    assert.deepEqual(sabotageConstraint?.allowedStates, ['none']);

    const coupPacifyUsage = markerLattices.find((lattice) => lattice.id === 'coupPacifySpaceUsage');
    assert.ok(coupPacifyUsage, 'Expected coupPacifySpaceUsage lattice');
    assert.deepEqual(coupPacifyUsage.states, ['open', 'used']);
    assert.equal(coupPacifyUsage.defaultState, 'open');

    const coupAgitateUsage = markerLattices.find((lattice) => lattice.id === 'coupAgitateSpaceUsage');
    assert.ok(coupAgitateUsage, 'Expected coupAgitateSpaceUsage lattice');
    assert.deepEqual(coupAgitateUsage.states, ['open', 'used']);
    assert.equal(coupAgitateUsage.defaultState, 'open');

    const coupShiftCount = markerLattices.find((lattice) => lattice.id === 'coupSupportShiftCount');
    assert.ok(coupShiftCount, 'Expected coupSupportShiftCount lattice');
    assert.deepEqual(coupShiftCount.states, ['zero', 'one', 'two']);
    assert.equal(coupShiftCount.defaultState, 'zero');

    assert.equal(spaceMarkers === undefined || spaceMarkers.length === 0, true);
  });
});
