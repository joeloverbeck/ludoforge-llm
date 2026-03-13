import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const targetCardIds = [
  'card-44',
  'card-47',
  'card-53',
  'card-64',
  'card-69',
  'card-73',
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
    effects?: readonly unknown[];
    targets?: ReadonlyArray<{ effects?: readonly unknown[] }>;
    branches?: readonly unknown[];
    freeOperationGrants?: readonly unknown[];
    lastingEffects?: readonly unknown[];
    eligibilityOverrides?: readonly unknown[];
  };
  return Boolean(
      (Array.isArray(payload.effects) && payload.effects.length > 0) ||
      (Array.isArray(payload.targets) && payload.targets.some((target) => Array.isArray(target.effects) && target.effects.length > 0)) ||
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
    const parsedCardById = new Map((parsed.doc.eventDecks?.[0]?.cards ?? []).map((card) => [card.id, card] as const));

    const card47 = cardById.get('card-47');
    assert.equal(typeof (card47?.unshaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal(typeof (card47?.unshaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal(card47?.unshaded?.freeOperationGrants, undefined);
    const serializedCompiledCard47Unshaded = JSON.stringify(card47?.unshaded?.effects ?? []);
    const serializedCard47Unshaded = JSON.stringify(parsedCardById.get('card-47')?.unshaded?.effects ?? []);
    assert.match(serializedCompiledCard47Unshaded, /coin-assault-removal-order/);
    assert.doesNotMatch(serializedCompiledCard47Unshaded, /coin-assault-removal-order-single-faction/);
    assert.match(serializedCard47Unshaded, /targetFactions/);
    assert.doesNotMatch(serializedCard47Unshaded, /targetFactionMode/);
    assert.equal((card47?.shaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$nvaTroopsToPlace');

    const card44 = cardById.get('card-44');
    assert.deepEqual(card44?.unshaded?.freeOperationGrants?.map((grant) => grant.actionIds?.[0]), ['airLift', 'sweep', 'assault']);
    assert.equal((card44?.shaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 1);
    assert.equal(card44?.shaded?.effects, undefined);
    assert.equal(typeof (card44?.shaded?.targets?.[0]?.effects?.[0] as { rollRandom?: unknown })?.rollRandom, 'object');

    const card53 = cardById.get('card-53');
    assert.deepEqual(card53?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.equal((card53?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 3);
    assert.equal(card53?.unshaded?.targets?.[0]?.application, 'each');
    assert.equal((card53?.unshaded?.targets?.[0]?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 2);
    assert.equal((card53?.shaded?.effects?.[0] as { chooseN?: { max?: unknown } } | undefined)?.chooseN?.max, 1);
    assert.equal((card53?.shaded?.effects?.[1] as { chooseN?: { max?: unknown } } | undefined)?.chooseN?.max, 2);
    assert.equal(typeof (card53?.shaded?.effects?.[2] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal(typeof (card53?.shaded?.effects?.[3] as { forEach?: unknown } | undefined)?.forEach, 'object');

    const card64 = cardById.get('card-64');
    assert.equal(card64?.unshaded?.branches?.length, 4);
    assert.deepEqual(card64?.unshaded?.eligibilityOverrides, [
      {
        target: { kind: 'active' },
        eligible: true,
        windowId: 'remain-eligible',
        when: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'activeSeat' }, right: 'nva' },
            { op: '==', left: { ref: 'activeSeat' }, right: 'vc' },
          ],
        },
      },
    ]);
    assert.equal(
      ((card64?.unshaded?.branches?.[0]?.effects?.[2] as { if?: { then?: Array<{ pushInterruptPhase?: { phase?: string } }> } } | undefined)
        ?.if?.then?.[0]?.pushInterruptPhase?.phase),
      'honoluluPacify',
    );

    const card69 = cardById.get('card-69');
    assert.deepEqual(card69?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.deepEqual(
      [...(card69?.unshaded?.branches?.map((branch) => branch.id) ?? [])].sort(),
      ['macv-nva-then-vc', 'macv-us-then-arvn'],
    );
    const macvUsThenArvn = card69?.unshaded?.branches?.find((branch) => branch.id === 'macv-us-then-arvn');
    const macvNvaThenVc = card69?.unshaded?.branches?.find((branch) => branch.id === 'macv-nva-then-vc');
    assert.equal(macvUsThenArvn?.freeOperationGrants?.[0]?.operationClass, 'specialActivity');
    assert.equal(macvNvaThenVc?.freeOperationGrants?.[1]?.seat, 'vc');

    const card76 = cardById.get('card-76');
    assert.equal(card76?.unshaded?.text, 'NVA and VC -1 Resource each per space with both. Patronage +2.');
    assert.equal(typeof (card76?.unshaded?.effects?.[0] as { let?: unknown } | undefined)?.let, 'object');
    assert.deepEqual(card76?.unshaded?.effects?.[1], { addVar: { scope: 'global', var: 'patronage', delta: 2 } });
    assert.equal(card76?.shaded?.text, 'Remove Support from Hue, Da Nang, and an adjacent Province.');
    assert.equal(typeof (card76?.shaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal(typeof (card76?.shaded?.effects?.[1] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal((card76?.shaded?.effects?.[2] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$annamAdjacentProvince');
    assert.equal(typeof (card76?.shaded?.effects?.[3] as { forEach?: unknown } | undefined)?.forEach, 'object');

    const card73 = cardById.get('card-73');
    assert.equal(card73?.unshaded?.text, 'Conduct a Commitment Phase.');
    assert.deepEqual(card73?.unshaded?.effects, [
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]);
    assert.equal((card73?.shaded?.effects?.[0] as { chooseN?: { bind?: string; chooser?: unknown } })?.chooseN?.bind, '$greatSocietyUsPieces');
    assert.deepEqual((card73?.shaded?.effects?.[0] as { chooseN?: { chooser?: unknown } })?.chooseN?.chooser, { id: 0 });
    assert.equal(typeof (card73?.shaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');

    const card81 = cardById.get('card-81');
    assert.equal(typeof (card81?.unshaded?.effects?.[0] as { rollRandom?: unknown } | undefined)?.rollRandom, 'object');
    assert.equal(typeof (card81?.shaded?.effects?.[0] as { let?: unknown } | undefined)?.let, 'object');

    const card83 = cardById.get('card-83');
    assert.equal((card83?.unshaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$electionPassiveSupportSpaces');
    assert.equal(typeof (card83?.unshaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal((card83?.unshaded?.effects?.[2] as { addVar?: { var?: string; delta?: number } } | undefined)?.addVar?.delta, 10);
    assert.equal((card83?.shaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$electionCities');
    assert.equal(typeof (card83?.shaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal((card83?.shaded?.effects?.[2] as { addVar?: { delta?: number } } | undefined)?.addVar?.delta, -15);

    const card85 = cardById.get('card-85');
    assert.equal((card85?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 2);
    assert.equal(card85?.unshaded?.effects, undefined);
    assert.equal(card85?.shaded?.effects, undefined);
    assert.equal((card85?.unshaded?.targets?.[0]?.effects?.[0] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, 1);
    assert.equal((card85?.shaded?.targets?.[0]?.effects?.[0] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, -1);

    const card87 = cardById.get('card-87');
    assert.equal(card87?.unshaded?.effects, undefined);
    assert.equal(card87?.shaded?.effects, undefined);
    assert.equal((card87?.unshaded?.targets?.[0]?.effects?.[1] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, 1);
    assert.equal((card87?.shaded?.targets?.[0]?.effects?.[2] as { shiftMarker?: { delta?: number } })?.shiftMarker?.delta, -1);

    const card89 = cardById.get('card-89');
    assert.equal((card89?.unshaded?.effects?.[1] as { addVar?: { delta?: number } })?.addVar?.delta, 3);
    assert.equal((card89?.shaded?.effects?.[1] as { addVar?: { delta?: number } })?.addVar?.delta, -3);

    const card90 = cardById.get('card-90');
    assert.equal((card90?.unshaded?.effects?.[0] as { chooseN?: { bind?: string } })?.chooseN?.bind, '$rostowArvnPieces');
    assert.equal(typeof (card90?.unshaded?.effects?.[1] as { forEach?: unknown })?.forEach, 'object');
    assert.equal(typeof (card90?.shaded?.effects?.[0] as { forEach?: unknown })?.forEach, 'object');
    assert.equal(typeof (card90?.shaded?.effects?.[1] as { forEach?: unknown })?.forEach, 'object');

    const card98 = cardById.get('card-98');
    assert.equal(card98?.unshaded?.branches?.length, 2);
    assert.equal(card98?.shaded?.effects, undefined);
    assert.equal((card98?.shaded?.targets?.[0]?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 2);

    const card100 = cardById.get('card-100');
    assert.equal(card100?.unshaded?.branches?.length, 2);
    assert.equal(card100?.shaded?.effects, undefined);
    assert.equal(
      typeof (card100?.shaded?.targets?.[0]?.effects?.[0] as { rollRandom?: unknown })?.rollRandom,
      'object',
      'card-100 shaded must include die-roll removal logic',
    );

    const card102 = cardById.get('card-102');
    assert.equal(card102?.unshaded?.effects, undefined);
    assert.equal(card102?.shaded?.effects, undefined);
    assert.equal((card102?.unshaded?.targets?.[0]?.effects?.[0] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 99);
    assert.equal(typeof (card102?.shaded?.targets?.[0]?.effects?.[0] as { forEach?: unknown })?.forEach, 'object');

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
    assert.equal(card114?.unshaded?.effects, undefined);
    assert.equal((card114?.unshaded?.targets?.[0]?.effects?.[0] as { setMarker?: { state?: string } })?.setMarker?.state, 'passiveSupport');
    assert.equal((card114?.shaded?.effects?.[0] as { shiftMarker?: { space?: string } })?.shiftMarker?.space, 'hue:none');
    assert.equal((card114?.shaded?.effects?.[3] as { removeByPriority?: { budget?: unknown } })?.removeByPriority?.budget, 1);
  });
});
