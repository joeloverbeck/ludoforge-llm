import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const targetCardIds = [
  'card-47',
  'card-53',
  'card-64',
  'card-69',
  'card-76',
  'card-81',
  'card-83',
  'card-85',
  'card-87',
  'card-89',
  'card-90',
  'card-98',
  'card-100',
  'card-102',
  'card-105',
  'card-106',
  'card-108',
  'card-114',
] as const;

const hasBehavior = (side: unknown): boolean => {
  if (side === null || typeof side !== 'object') return false;
  const payload = side as {
    effects?: unknown[];
    branches?: unknown[];
    freeOperationGrants?: unknown[];
    lastingEffects?: unknown[];
    eligibilityOverrides?: unknown[];
  };
  return Boolean(
    (Array.isArray(payload.effects) && payload.effects.length > 0) ||
      (Array.isArray(payload.branches) && payload.branches.length > 0) ||
      (Array.isArray(payload.freeOperationGrants) && payload.freeOperationGrants.length > 0) ||
      (Array.isArray(payload.lastingEffects) && payload.lastingEffects.length > 0) ||
      (Array.isArray(payload.eligibilityOverrides) && payload.eligibilityOverrides.length > 0),
  );
};

describe('FITL text-only card behavior backfill', () => {
  it('ensures all ticketed cards now carry executable behavior payloads', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const id of targetCardIds) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === id);
      assert.notEqual(card, undefined, `Expected ${id} to exist`);
      const unshadedHasBehavior = hasBehavior(card?.unshaded);
      const shadedHasBehavior = card?.sideMode === 'dual' ? hasBehavior(card?.shaded) : false;
      assert.equal(
        unshadedHasBehavior || shadedHasBehavior,
        true,
        `${id} must include executable behavior on at least one encoded side`,
      );
    }
  });

  it('asserts card-specific executable semantics for the backfilled set', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const cardById = new Map((compiled.gameDef?.eventDecks?.[0]?.cards ?? []).map((card) => [card.id, card] as const));

    const card47 = cardById.get('card-47');
    assert.equal((card47?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 1);
    assert.equal((card47?.unshaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 3);

    const card53 = cardById.get('card-53');
    assert.equal((card53?.unshaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 3);
    assert.equal((card53?.shaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 3);

    const card64 = cardById.get('card-64');
    assert.deepEqual(card64?.unshaded?.effects, [
      { addVar: { scope: 'global', var: 'aid', delta: 6 } },
      { addVar: { scope: 'global', var: 'patronage', delta: 6 } },
    ]);

    const card69 = cardById.get('card-69');
    assert.equal(card69?.unshaded?.freeOperationGrants?.[0]?.faction, '1');
    assert.equal(card69?.unshaded?.freeOperationGrants?.[0]?.operationClass, 'limitedOperation');

    const card76 = cardById.get('card-76');
    assert.deepEqual(card76?.unshaded?.effects, [
      { addVar: { scope: 'global', var: 'nvaResources', delta: -3 } },
      { addVar: { scope: 'global', var: 'vcResources', delta: -3 } },
      { addVar: { scope: 'global', var: 'patronage', delta: 3 } },
    ]);

    const card81 = cardById.get('card-81');
    assert.equal((card81?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 2);
    assert.equal((card81?.shaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 2);

    const card83 = cardById.get('card-83');
    assert.equal((card83?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 3);
    assert.equal(
      (card83?.unshaded?.effects?.[1] as { addVar?: { var?: string; delta?: number } })?.addVar?.var,
      'aid',
    );

    const card85 = cardById.get('card-85');
    assert.equal((card85?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 2);
    assert.equal((card85?.unshaded?.effects?.[0] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, 1);
    assert.equal((card85?.shaded?.effects?.[0] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, -1);

    const card87 = cardById.get('card-87');
    assert.equal((card87?.unshaded?.effects?.[1] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, 1);
    assert.equal((card87?.shaded?.effects?.[2] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, -1);

    const card89 = cardById.get('card-89');
    assert.equal((card89?.unshaded?.effects?.[1] as { addVar?: { delta?: number } })?.addVar?.delta, 3);
    assert.equal((card89?.shaded?.effects?.[1] as { addVar?: { delta?: number } })?.addVar?.delta, -3);

    const card90 = cardById.get('card-90');
    assert.equal((card90?.unshaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 2);
    assert.equal((card90?.shaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 3);

    const card98 = cardById.get('card-98');
    assert.equal(card98?.unshaded?.branches?.length, 2);
    assert.equal((card98?.shaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 2);

    const card100 = cardById.get('card-100');
    assert.equal(card100?.unshaded?.branches?.length, 2);
    assert.equal(
      typeof (card100?.shaded?.effects?.[0] as { rollRandom?: unknown })?.rollRandom,
      'object',
      'card-100 shaded must include die-roll removal logic',
    );

    const card102 = cardById.get('card-102');
    assert.equal((card102?.unshaded?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 99);
    assert.equal(typeof (card102?.shaded?.effects?.[0] as { forEach?: unknown })?.forEach, 'object');

    const card105 = cardById.get('card-105');
    assert.equal((card105?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 4);
    assert.equal(card105?.shaded?.branches?.length, 2);

    const card106 = cardById.get('card-106');
    assert.equal(card106?.sideMode, 'single');
    assert.equal((card106?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 2);

    const card108 = cardById.get('card-108');
    assert.equal(typeof (card108?.unshaded?.effects?.[0] as { if?: unknown })?.if, 'object');
    assert.equal(typeof (card108?.shaded?.effects?.[0] as { let?: unknown })?.let, 'object');

    const card114 = cardById.get('card-114');
    assert.equal((card114?.unshaded?.effects?.[0] as { setMarker?: { state?: string } })?.setMarker?.state, 'passiveSupport');
    assert.equal((card114?.shaded?.effects?.[0] as { shiftMarker?: { space?: string } })?.shiftMarker?.space, 'hue:none');
    assert.equal((card114?.shaded?.effects?.[3] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 1);
  });
});
