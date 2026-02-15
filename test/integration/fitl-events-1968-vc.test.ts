import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-91', order: 91, title: 'Bob Hope', sideMode: 'dual', factionOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-92', order: 92, title: 'SEALORDS', sideMode: 'dual', factionOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-94', order: 94, title: 'Tunnel Rats', sideMode: 'single', factionOrder: ['VC', 'US', 'NVA', 'ARVN'] },
  { id: 'card-96', order: 96, title: 'APC', sideMode: 'dual', factionOrder: ['VC', 'US', 'ARVN', 'NVA'] },
  { id: 'card-103', order: 103, title: 'Kent State', sideMode: 'dual', factionOrder: ['VC', 'NVA', 'US', 'ARVN'] },
  { id: 'card-111', order: 111, title: 'Agent Orange', sideMode: 'dual', factionOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-113', order: 113, title: 'Ruff Puff', sideMode: 'dual', factionOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-115', order: 115, title: 'Typhoon Kate', sideMode: 'single', factionOrder: ['VC', 'ARVN', 'US', 'NVA'] },
  { id: 'card-117', order: 117, title: 'Corps Commander', sideMode: 'dual', factionOrder: ['VC', 'ARVN', 'NVA', 'US'] },
  { id: 'card-119', order: 119, title: 'My Lai', sideMode: 'dual', factionOrder: ['VC', 'ARVN', 'NVA', 'US'] },
  { id: 'card-120', order: 120, title: 'US Press Corps', sideMode: 'dual', factionOrder: ['VC', 'ARVN', 'NVA', 'US'] },
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
      assert.deepEqual(card?.metadata?.factionOrder, expected.factionOrder);
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
            effects?: Array<{ moveToken?: { token?: string; from?: string; to?: string } }>;
          };
        }
      | undefined;
    assert.equal(tetMove?.forEach?.bind, 'tetCard');
    assert.equal(tetMove?.forEach?.limit, 1);
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.token, 'tetCard');
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.from, 'played:none');
    assert.equal(tetMove?.forEach?.effects?.[0]?.moveToken?.to, 'leader:none');
    assert.equal(
      (conditional?.else?.[0] as { grantFreeOperation?: { faction?: string; operationClass?: string; actionIds?: string[] } })?.grantFreeOperation
        ?.faction,
      '3',
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
});
