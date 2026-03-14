import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { parseProductionSpec } from '../helpers/production-spec-helpers.js';

type MarkerConstraintDef = {
  readonly when: Readonly<Record<string, unknown>>;
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
  const parsed = parseProductionSpec();
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
  it('encodes the canonical supportOpposition lattice with declarative neutral-only legality constraints', () => {
    const { markerLattices, spaceMarkers } = readMapLattices();
    assert.equal(markerLattices.length, 6);

    const supportOpposition = markerLattices.find((lattice) => lattice.id === 'supportOpposition');
    assert.ok(supportOpposition, 'Expected supportOpposition lattice');
    assert.deepEqual(
      supportOpposition.states,
      ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
    );
    assert.equal(supportOpposition.defaultState, 'neutral');

    assert.ok(Array.isArray(supportOpposition.constraints));
    assert.equal(supportOpposition.constraints.length, 2);

    const locConstraint = supportOpposition.constraints.find((constraint) => constraint.when.op === '==');
    assert.notEqual(locConstraint, undefined);
    assert.deepEqual(locConstraint?.when, {
      op: '==',
      left: { ref: 'zoneProp', zone: '$space', prop: 'category' },
      right: 'loc',
    });
    assert.deepEqual(locConstraint?.allowedStates, ['neutral']);

    const popZeroConstraint = supportOpposition.constraints.find(
      (constraint) => constraint.when.op === '==' && JSON.stringify(constraint.when).includes('"population"'),
    );
    assert.notEqual(popZeroConstraint, undefined);
    assert.deepEqual(popZeroConstraint?.when, {
      op: '==',
      left: { ref: 'zoneProp', zone: '$space', prop: 'population' },
      right: 0,
    });
    assert.deepEqual(popZeroConstraint?.allowedStates, ['neutral']);

    const sabotageLattice = markerLattices.find((lattice) => lattice.id === 'sabotage');
    assert.ok(sabotageLattice, 'Expected sabotage lattice');
    assert.deepEqual(sabotageLattice.states, ['none', 'sabotage']);
    assert.equal(sabotageLattice.defaultState, 'none');
    assert.ok(Array.isArray(sabotageLattice.constraints));
    const sabotageConstraint = sabotageLattice.constraints.find((constraint) => constraint.when.op === 'in');
    assert.deepEqual(sabotageConstraint?.when, {
      op: 'in',
      item: { ref: 'zoneProp', zone: '$space', prop: 'category' },
      set: { scalarArray: ['city', 'province'] },
    });
    assert.deepEqual(sabotageConstraint?.allowedStates, ['none']);

    const coupPacifyUsage = markerLattices.find((lattice) => lattice.id === 'coupPacifySpaceUsage');
    assert.ok(coupPacifyUsage, 'Expected coupPacifySpaceUsage lattice');
    assert.deepEqual(coupPacifyUsage.states, ['open', 'used']);
    assert.equal(coupPacifyUsage.defaultState, 'open');

    const coupPacifyArvnUsage = markerLattices.find((lattice) => lattice.id === 'coupPacifyArvnSpaceUsage');
    assert.ok(coupPacifyArvnUsage, 'Expected coupPacifyArvnSpaceUsage lattice');
    assert.deepEqual(coupPacifyArvnUsage.states, ['open', 'used']);
    assert.equal(coupPacifyArvnUsage.defaultState, 'open');

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
