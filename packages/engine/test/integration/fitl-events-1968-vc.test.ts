import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-91', order: 91, title: 'Bob Hope', sideMode: 'dual', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-92', order: 92, title: 'SEALORDS', sideMode: 'dual', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-94', order: 94, title: 'Tunnel Rats', sideMode: 'single', seatOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-96', order: 96, title: 'APC', sideMode: 'dual', seatOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-103', order: 103, title: 'Kent State', sideMode: 'dual', seatOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-111', order: 111, title: 'Agent Orange', sideMode: 'dual', seatOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-113', order: 113, title: 'Ruff Puff', sideMode: 'dual', seatOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-115', order: 115, title: 'Typhoon Kate', sideMode: 'single', seatOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-117', order: 117, title: 'Corps Commanders', sideMode: 'dual', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
  { id: 'card-119', order: 119, title: 'My Lai', sideMode: 'dual', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
  { id: 'card-120', order: 120, title: 'US Press Corps', sideMode: 'dual', seatOrder: ['VC', 'ARVN', 'NVA', 'US'] },
] as const;

describe('FITL 1968 VC-first event-card production spec', () => {
  it('compiles all 11 VC-first 1968 cards with side-mode and metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, '1968');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string', `${expected.id} must include flavorText`);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes card 115 (Typhoon Kate) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-115');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.equal(card?.sideMode, 'single');

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-typhoon-kate');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_typhoonKate', value: true } }]);
    assert.deepEqual(momentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_typhoonKate', value: false } }]);
  });

  it('encodes card 96 shaded side with generic Tet-return lifecycle move', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-96');
    assert.notEqual(card, undefined);
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.shaded?.text?.includes('Tet Offensive'), true);
    const conditional = (card?.shaded?.effects?.[0] as { if?: { when?: { op?: string; left?: unknown; right?: unknown }; then?: unknown[]; else?: unknown[] } })?.if;
    assert.equal(conditional?.when?.op, '>');
    assert.equal(conditional?.when?.right, 0);
    assert.equal(Array.isArray(conditional?.then), true);
    const tetMove = conditional?.then?.[0] as
      | {
          forEach?: {
            bind?: string;
            limit?: number;
            effects?: Array<{ moveToken?: { token?: string; from?: string; to?: { zoneExpr?: string } } }>;
          };
        }
      | undefined;
    assert.equal(tetMove?.forEach?.bind, 'tetCard');
    assert.equal(tetMove?.forEach?.limit, 1);
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.token, 'tetCard');
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.from, 'played:none');
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.to?.zoneExpr, 'leader:none');
    assert.equal(
      (conditional?.else?.[0] as { grantFreeOperation?: { seat?: string; operationClass?: string; actionIds?: string[] } })?.grantFreeOperation
        ?.seat,
      'vc',
    );
    assert.equal(
      (conditional?.else?.[0] as { grantFreeOperation?: { operationClass?: string } })?.grantFreeOperation?.operationClass,
      'operation',
    );
    assert.deepEqual(
      (conditional?.else?.[0] as { grantFreeOperation?: { actionIds?: string[] } })?.grantFreeOperation?.actionIds,
      ['operation'],
    );
  });

  it('encodes card 117 with adjacent-space placement, per-space free sweeps, shaded die-roll removal, and ARVN ineligibility', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-117');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'ARVN places 3 of its Troops from out of play or Available into 1 or 2 adjacent spaces then free Sweeps each.',
    );
    assert.equal(
      card?.shaded?.text,
      'Remove a die roll of ARVN pieces from 1 or 2 adjacent spaces. ARVN Ineligible through next card.',
    );
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'arvn' }, eligible: false, windowId: 'make-ineligible' },
    ]);

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(typeof (unshadedEffects[0] as { setActivePlayer?: unknown })?.setActivePlayer, 'object');
    assert.equal((unshadedEffects[1] as { chooseOne?: { bind?: string } })?.chooseOne?.bind, '$anchorSpace');
    assert.equal((unshadedEffects[2] as { chooseN?: { bind?: string; max?: number } })?.chooseN?.bind, '$adjacentSpace');
    assert.equal((unshadedEffects[2] as { chooseN?: { max?: number } })?.chooseN?.max, 1);
    assert.equal((unshadedEffects[3] as { chooseN?: { bind?: string; max?: unknown; min?: unknown } })?.chooseN?.bind, '$selectedTroops');
    assert.equal(typeof (unshadedEffects[3] as { chooseN?: { min?: unknown } })?.chooseN?.min, 'object');
    assert.equal(typeof (unshadedEffects[3] as { chooseN?: { max?: unknown } })?.chooseN?.max, 'object');
    assert.equal((unshadedEffects[4] as { chooseN?: { bind?: string; max?: unknown } })?.chooseN?.bind, '$troopsToAnchor');
    assert.equal(typeof (unshadedEffects[5] as { forEach?: unknown })?.forEach, 'object');
    assert.equal(typeof (unshadedEffects[6] as { if?: unknown })?.if, 'object');
    assert.equal(typeof (unshadedEffects[7] as { setActivePlayer?: unknown })?.setActivePlayer, 'object');
    assert.equal(typeof (unshadedEffects[8] as { grantFreeOperation?: unknown })?.grantFreeOperation, 'object');
    assert.equal(typeof (unshadedEffects[9] as { forEach?: unknown })?.forEach, 'object');

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal((shadedEffects[0] as { chooseOne?: { bind?: string } })?.chooseOne?.bind, '$anchorSpace');
    assert.equal((shadedEffects[1] as { chooseN?: { bind?: string; max?: number } })?.chooseN?.bind, '$adjacentSpace');
    assert.equal((shadedEffects[1] as { chooseN?: { max?: number } })?.chooseN?.max, 1);
    assert.equal(typeof (shadedEffects[2] as { rollRandom?: unknown })?.rollRandom, 'object');
  });
});
