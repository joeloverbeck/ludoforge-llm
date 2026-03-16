import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-95', order: 95, title: 'Westmoreland', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-98', order: 98, title: 'Long Tan', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-99', order: 99, title: 'Masher/White Wing', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-100', order: 100, title: 'Rach Ba Rai', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-102', order: 102, title: 'Cu Chi', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-104', order: 104, title: 'Main Force Bns', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-105', order: 105, title: 'Rural Pressure', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-106', order: 106, title: 'Binh Duong', sideMode: 'single', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-108', order: 108, title: 'Draft Dodgers', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-109', order: 109, title: 'Nguyen Huu Tho', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'NVA', 'ARVN', 'US'] },
  { id: 'card-114', order: 114, title: 'Tri Quang', sideMode: 'dual', period: '1965', seatOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-116', order: 116, title: 'Cadres', sideMode: 'dual', period: '1964', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
] as const;

const MASHER_TOKEN_INTERPRETATIONS = [
  {
    when: {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'ARVN' },
        { prop: 'type', op: 'in', value: ['troops', 'police'] },
      ],
    },
    assign: {
      faction: 'US',
      type: 'troops',
    },
  },
] as const;

type Grant = Record<string, any>;

const compileMasher = () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  const masher = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-99');
  assert.notEqual(masher, undefined, 'Expected card-99 to exist');
  return { parsed, compiled, masher: masher! };
};

const requireGrants = (grants: unknown, expectedCount: number): readonly Grant[] => {
  assert.notEqual(grants, undefined, 'Expected grants to exist');
  const arr = grants as readonly Grant[];
  assert.equal(arr.length, expectedCount, `Expected ${expectedCount} grants`);
  return arr;
};

describe('FITL VC-first event-card production spec batch', () => {
  it('compiles all 12 cards with correct metadata and side-shape invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, expected.period);
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes cards 104/116 as VC capability marker toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-104', marker: 'cap_mainForceBns' },
      { id: 'card-116', marker: 'cap_cadres' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('VC'), true, `${expected.id} must include VC tag`);
      assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]);
      assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]);
    }
  });

  it('encodes free-operation sequencing for card 95 (Westmoreland) without kernel-specific handlers', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const westmoreland = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-95');
    assert.notEqual(westmoreland, undefined);
    assert.deepEqual(westmoreland?.unshaded?.freeOperationGrants, [
      {
        seat: 'us',
        sequence: { batch: 'westmoreland-us', step: 0 },
        operationClass: 'operation',
        actionIds: ['airLift'],
      },
      {
        seat: 'us',
        sequence: { batch: 'westmoreland-us', step: 1 },
        operationClass: 'operation',
        actionIds: ['sweep', 'assault'],
        allowDuringMonsoon: true,
        executionContext: {
          allowTroopMovement: false,
          allowArvnFollowup: false,
          maxSpaces: 2,
        },
      },
      {
        seat: 'us',
        sequence: { batch: 'westmoreland-us', step: 2 },
        operationClass: 'operation',
        actionIds: ['airStrike'],
      },
    ]);
  });
});

describe('FITL card-99 Masher/White Wing — unshaded structural', () => {
  it('has exactly 4 unshaded freeOperationGrants with correct batch/step/actionIds', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);

    assert.equal(grants[0]!.seat, 'us');
    assert.deepEqual(grants[0]!.sequence, { batch: 'masher-white-wing-us', step: 0 });
    assert.deepEqual(grants[0]!.actionIds, ['sweep']);
    assert.equal(grants[0]!.operationClass, 'operation');

    assert.equal(grants[1]!.seat, 'us');
    assert.deepEqual(grants[1]!.sequence, { batch: 'masher-white-wing-us', step: 1 });
    assert.deepEqual(grants[1]!.actionIds, ['assault']);
    assert.equal(grants[1]!.operationClass, 'operation');

    assert.equal(grants[2]!.seat, 'arvn');
    assert.equal(grants[2]!.executeAsSeat, 'us');
    assert.deepEqual(grants[2]!.sequence, { batch: 'masher-white-wing-arvn-as-us', step: 0 });
    assert.deepEqual(grants[2]!.actionIds, ['sweep']);
    assert.equal(grants[2]!.operationClass, 'operation');

    assert.equal(grants[3]!.seat, 'arvn');
    assert.equal(grants[3]!.executeAsSeat, 'us');
    assert.deepEqual(grants[3]!.sequence, { batch: 'masher-white-wing-arvn-as-us', step: 1 });
    assert.deepEqual(grants[3]!.actionIds, ['assault']);
    assert.equal(grants[3]!.operationClass, 'operation');
  });

  it('all 4 unshaded grants carry tokenInterpretations remapping ARVN→US', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(
        grants[i]!.tokenInterpretations,
        MASHER_TOKEN_INTERPRETATIONS,
        `Grant ${i} must remap ARVN troops/police to US troops`,
      );
    }
  });

  it('all 4 unshaded grants have allowDuringMonsoon: true', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(grants[i]!.allowDuringMonsoon, true, `Grant ${i} must allow monsoon play`);
    }
  });

  it('sweep grants (steps 0) have executionContext maxSpaces: 1', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    for (const idx of [0, 2]) {
      const grant = grants[idx]!;
      assert.equal(
        grant.executionContext?.maxSpaces,
        1,
        `Sweep grant for ${grant.seat} must limit to 1 space`,
      );
    }
  });

  it('sweep grants have zoneFilter requiring non-Jungle terrain plus US and ARVN troops', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    for (const idx of [0, 2]) {
      const grant = grants[idx]!;
      assert.notEqual(grant.zoneFilter, undefined, `Sweep grant for ${grant.seat} must have a zoneFilter`);
      const filter = grant.zoneFilter as Record<string, unknown>;
      assert.equal(filter.op, 'and', 'zoneFilter root must be an AND');
      assert.equal(Array.isArray(filter.args), true, 'zoneFilter args must be an array');
      assert.equal((filter.args as unknown[]).length, 3, 'zoneFilter must have 3 clauses (non-jungle + US troops + ARVN troops)');
    }
  });

  it('assault grants (steps 1) have no zoneFilter', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    for (const idx of [1, 3]) {
      const grant = grants[idx]!;
      assert.equal(grant.zoneFilter, undefined, `Assault grant for ${grant.seat} must not have a zoneFilter`);
    }
  });

  it('ARVN grants have executeAsSeat: us', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.unshaded?.freeOperationGrants , 4);
    assert.equal(grants[2]!.executeAsSeat, 'us');
    assert.equal(grants[3]!.executeAsSeat, 'us');
    assert.equal(grants[0]!.executeAsSeat, undefined);
    assert.equal(grants[1]!.executeAsSeat, undefined);
  });
});

describe('FITL card-99 Masher/White Wing — shaded structural', () => {
  it('has exactly 4 shaded freeOperationGrants (VC march/ambush + NVA march/ambush)', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.shaded?.freeOperationGrants , 4);

    assert.equal(grants[0]!.seat, 'vc');
    assert.deepEqual(grants[0]!.sequence, { batch: 'masher-shaded-vc', step: 0 });
    assert.deepEqual(grants[0]!.actionIds, ['march']);
    assert.equal(grants[0]!.operationClass, 'operation');

    assert.equal(grants[1]!.seat, 'vc');
    assert.deepEqual(grants[1]!.sequence, { batch: 'masher-shaded-vc', step: 1 });
    assert.deepEqual(grants[1]!.actionIds, ['ambushVc']);
    assert.equal(grants[1]!.operationClass, 'specialActivity');

    assert.equal(grants[2]!.seat, 'nva');
    assert.deepEqual(grants[2]!.sequence, { batch: 'masher-shaded-nva', step: 0 });
    assert.deepEqual(grants[2]!.actionIds, ['march']);
    assert.equal(grants[2]!.operationClass, 'operation');

    assert.equal(grants[3]!.seat, 'nva');
    assert.deepEqual(grants[3]!.sequence, { batch: 'masher-shaded-nva', step: 1 });
    assert.deepEqual(grants[3]!.actionIds, ['ambushNva']);
    assert.equal(grants[3]!.operationClass, 'specialActivity');
  });

  it('all 4 shaded grants have allowDuringMonsoon: true', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.shaded?.freeOperationGrants , 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(grants[i]!.allowDuringMonsoon, true, `Shaded grant ${i} must allow monsoon play`);
    }
  });

  it('march grants have executionContext maxSpaces: 3 and moveZoneBindings', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.shaded?.freeOperationGrants , 4);
    for (const idx of [0, 2]) {
      const grant = grants[idx]!;
      assert.equal(
        grant.executionContext?.maxSpaces,
        3,
        `March grant for ${grant.seat} must allow up to 3 spaces`,
      );
      assert.deepEqual(
        grant.moveZoneBindings,
        ['$targetSpaces'],
        `March grant for ${grant.seat} must capture move zone bindings`,
      );
    }
  });

  it('ambush grants have executionContext skipUndergroundRequirement: true', () => {
    const { masher } = compileMasher();
    const grants = requireGrants(masher.shaded?.freeOperationGrants , 4);
    for (const idx of [1, 3]) {
      const grant = grants[idx]!;
      assert.equal(
        grant.executionContext?.skipUndergroundRequirement,
        true,
        `Ambush grant for ${grant.seat} must skip underground requirement (even if Active)`,
      );
    }
  });
});
