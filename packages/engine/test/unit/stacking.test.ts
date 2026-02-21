import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkStackingConstraints,
} from '../../src/kernel/index.js';
import type { AttributeValue, StackingConstraint, Token, ZoneDef } from '../../src/kernel/types.js';
import { asTokenId, asZoneId } from '../../src/kernel/branded.js';

const makeSpace = (
  id: string,
  overrides?: {
    category?: string;
    attributes?: Readonly<Record<string, AttributeValue>>;
    adjacentTo?: readonly string[];
  },
): ZoneDef => {
  const base: ZoneDef = {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    category: overrides?.category ?? 'province',
    attributes: overrides?.attributes ?? { population: 2, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false },
  };
  if (overrides?.adjacentTo !== undefined) {
    return { ...base, adjacentTo: overrides.adjacentTo.map((zoneId) => ({ to: asZoneId(zoneId) })) };
  }
  return base;
};

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction },
});

const maxTwoBases: StackingConstraint = {
  id: 'max-2-bases',
  description: 'Max 2 Bases per Province or City',
  spaceFilter: { category: ['province', 'city'] },
  pieceFilter: { pieceTypeIds: ['base'] },
  rule: 'maxCount',
  maxCount: 2,
};

const noBasesOnLocs: StackingConstraint = {
  id: 'no-bases-loc',
  description: 'No Bases on LoCs',
  spaceFilter: { category: ['loc'] },
  pieceFilter: { pieceTypeIds: ['base'] },
  rule: 'prohibit',
};

const noUsArvnInNv: StackingConstraint = {
  id: 'nv-restriction',
  description: 'Only NVA/VC in North Vietnam',
  spaceFilter: { attributeEquals: { country: 'northVietnam' } },
  pieceFilter: { seats: ['US', 'ARVN'] },
  rule: 'prohibit',
};
const tokenTypeFactionById = new Map<string, string>([
  ['troops', 'US'],
  ['base', 'US'],
  ['guerrilla', 'NVA'],
  ['us-troops', 'us'],
]);

describe('checkStackingConstraints', () => {
  it('returns no violations when maxCount is not exceeded', () => {
    const spaces = [makeSpace('quangTri', { category: 'province' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
    ];

    const violations = checkStackingConstraints([maxTwoBases], spaces, 'quangTri', tokens);
    assert.equal(violations.length, 0);
  });

  it('returns violation when maxCount is exceeded', () => {
    const spaces = [makeSpace('quangTri', { category: 'province' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
      makeToken('b3', 'base', 'NVA'),
    ];

    const violations = checkStackingConstraints([maxTwoBases], spaces, 'quangTri', tokens);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.constraintId, 'max-2-bases');
    assert.equal(violations[0]!.rule, 'maxCount');
    assert.equal(violations[0]!.matchingCount, 3);
    assert.equal(violations[0]!.maxCount, 2);
  });

  it('returns violation for prohibit rule with matching piece', () => {
    const spaces = [makeSpace('route1', { category: 'loc' })];
    const tokens = [makeToken('b1', 'base', 'US')];

    const violations = checkStackingConstraints([noBasesOnLocs], spaces, 'route1', tokens);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.constraintId, 'no-bases-loc');
    assert.equal(violations[0]!.rule, 'prohibit');
  });

  it('returns no violation for prohibit rule with non-matching piece type', () => {
    const spaces = [makeSpace('route1', { category: 'loc' })];
    const tokens = [makeToken('t1', 'troops', 'US')];

    const violations = checkStackingConstraints([noBasesOnLocs], spaces, 'route1', tokens);
    assert.equal(violations.length, 0);
  });

  it('returns no violation when no constraints are defined', () => {
    const spaces = [makeSpace('quangTri', { category: 'province' })];
    const tokens = [makeToken('b1', 'base', 'US')];

    const violations = checkStackingConstraints([], spaces, 'quangTri', tokens);
    assert.equal(violations.length, 0);
  });

  it('returns no violation when spaceFilter does not match destination', () => {
    const spaces = [makeSpace('route1', { category: 'loc' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
      makeToken('b3', 'base', 'NVA'),
    ];

    // maxTwoBases filters for provinces/cities, not LoCs
    const violations = checkStackingConstraints([maxTwoBases], spaces, 'route1', tokens);
    assert.equal(violations.length, 0);
  });

  it('returns no violation when pieceFilter does not match token', () => {
    const spaces = [makeSpace('quangTri', { category: 'province' })];
    const tokens = [
      makeToken('t1', 'troops', 'US'),
      makeToken('t2', 'troops', 'US'),
      makeToken('t3', 'troops', 'US'),
    ];

    // maxTwoBases filters for bases, not troops
    const violations = checkStackingConstraints([maxTwoBases], spaces, 'quangTri', tokens);
    assert.equal(violations.length, 0);
  });

  it('returns no violation when zone is not in zones list', () => {
    const spaces = [makeSpace('differentZone', { category: 'province' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
      makeToken('b3', 'base', 'NVA'),
    ];

    const violations = checkStackingConstraints([maxTwoBases], spaces, 'quangTri', tokens);
    assert.equal(violations.length, 0);
  });

  it('enforces country-based prohibit constraint', () => {
    const spaces = [makeSpace('hanoi', { category: 'city', attributes: { population: 2, econ: 0, terrainTags: [], country: 'northVietnam', coastal: false } })];
    const tokens = [makeToken('t1', 'troops', 'US')];

    const violations = checkStackingConstraints([noUsArvnInNv], spaces, 'hanoi', tokens, tokenTypeFactionById);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.constraintId, 'nv-restriction');
    assert.equal(violations[0]!.rule, 'prohibit');
  });

  it('allows NVA/VC pieces in North Vietnam with country-based prohibit', () => {
    const spaces = [makeSpace('hanoi', { category: 'city', attributes: { population: 2, econ: 0, terrainTags: [], country: 'northVietnam', coastal: false } })];
    const tokens = [
      makeToken('g1', 'guerrilla', 'NVA'),
      makeToken('g2', 'guerrilla', 'VC'),
    ];

    const violations = checkStackingConstraints([noUsArvnInNv], spaces, 'hanoi', tokens, tokenTypeFactionById);
    assert.equal(violations.length, 0);
  });

  it('uses canonical token-type faction mapping when provided', () => {
    const spaces = [makeSpace('hanoi', { category: 'city', attributes: { population: 2, econ: 0, terrainTags: [], country: 'northVietnam', coastal: false } })];
    const tokens = [makeToken('t1', 'us-troops', 'US')];
    const lowerCaseConstraint: StackingConstraint = {
      id: 'nv-restriction-canonical',
      description: 'Only nva/vc in North Vietnam (canonical ids)',
      spaceFilter: { attributeEquals: { country: 'northVietnam' } },
      pieceFilter: { seats: ['us', 'arvn'] },
      rule: 'prohibit',
    };
    const violationsWithoutMapping = checkStackingConstraints([lowerCaseConstraint], spaces, 'hanoi', tokens);
    assert.equal(violationsWithoutMapping.length, 0);

    const violationsWithMapping = checkStackingConstraints(
      [lowerCaseConstraint],
      spaces,
      'hanoi',
      tokens,
      tokenTypeFactionById,
    );
    assert.equal(violationsWithMapping.length, 1);
    assert.equal(violationsWithMapping[0]!.constraintId, 'nv-restriction-canonical');
  });

  it('checks attributeEquals filter', () => {
    const constraint: StackingConstraint = {
      id: 'pop-zero-limit',
      description: 'No bases in unpopulated spaces',
      spaceFilter: { attributeEquals: { population: 0 } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };

    const spaces = [makeSpace('loc1', { attributes: { population: 0, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false } })];
    const tokens = [makeToken('b1', 'base', 'US')];

    const violations = checkStackingConstraints([constraint], spaces, 'loc1', tokens);
    assert.equal(violations.length, 1);
  });

  it('matches array-valued attributeEquals filters by value', () => {
    const constraint: StackingConstraint = {
      id: 'terrain-restricted',
      description: 'No bases in exact terrain profile',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spaces = [
      makeSpace('loc1', {
        attributes: {
          population: 1,
          econ: 0,
          terrainTags: ['highland', 'jungle'],
          country: 'southVietnam',
          coastal: false,
        },
      }),
    ];

    const violations = checkStackingConstraints([constraint], spaces, 'loc1', [makeToken('b1', 'base', 'US')]);
    assert.equal(violations.length, 1);
  });

  it('does not match array-valued attributeEquals filters when order differs', () => {
    const constraint: StackingConstraint = {
      id: 'terrain-restricted-order',
      description: 'No bases in exact terrain profile',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spaces = [
      makeSpace('loc1', {
        attributes: {
          population: 1,
          econ: 0,
          terrainTags: ['jungle', 'highland'],
          country: 'southVietnam',
          coastal: false,
        },
      }),
    ];

    const violations = checkStackingConstraints([constraint], spaces, 'loc1', [makeToken('b1', 'base', 'US')]);
    assert.equal(violations.length, 0);
  });

  it('multiple constraints can produce multiple violations', () => {
    const spaces = [makeSpace('route1', { category: 'loc' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
      makeToken('b3', 'base', 'NVA'),
    ];

    const violations = checkStackingConstraints([noBasesOnLocs, maxTwoBases], spaces, 'route1', tokens);
    // noBasesOnLocs matches (loc + base), maxTwoBases does NOT match (not province/city)
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.constraintId, 'no-bases-loc');
  });

  it('handles spaceIds filter in spaceFilter', () => {
    const constraint: StackingConstraint = {
      id: 'specific-space-limit',
      description: 'Max 1 base in Saigon',
      spaceFilter: { spaceIds: ['saigon'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'maxCount',
      maxCount: 1,
    };

    const spaces = [makeSpace('saigon', { category: 'city' })];
    const tokens = [
      makeToken('b1', 'base', 'US'),
      makeToken('b2', 'base', 'ARVN'),
    ];

    const violations = checkStackingConstraints([constraint], spaces, 'saigon', tokens);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.matchingCount, 2);
    assert.equal(violations[0]!.maxCount, 1);
  });
});
