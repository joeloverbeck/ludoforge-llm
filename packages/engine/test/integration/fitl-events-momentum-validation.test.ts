import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type EventSide = 'unshaded' | 'shaded';
type MomentumEffect = { readonly id: string; readonly duration: string };
type SidePayload = { readonly lastingEffects?: readonly MomentumEffect[] };
type MomentumCardLike = {
  readonly id: string;
  readonly title: string;
  readonly tags?: readonly string[];
  readonly unshaded?: SidePayload;
  readonly shaded?: SidePayload;
};

const expectedMomentumCards = [
  { id: 'card-5', title: 'Wild Weasels', sides: ['shaded'] },
  { id: 'card-7', title: 'ADSID', sides: ['unshaded'] },
  { id: 'card-10', title: 'Rolling Thunder', sides: ['shaded'] },
  { id: 'card-15', title: 'Medevac', sides: ['unshaded', 'shaded'] },
  { id: 'card-16', title: 'Blowtorch Komer', sides: ['unshaded'] },
  { id: 'card-17', title: 'Claymores', sides: ['unshaded'] },
  { id: 'card-22', title: 'Da Nang', sides: ['shaded'] },
  { id: 'card-38', title: 'McNamara Line', sides: ['unshaded'] },
  { id: 'card-39', title: 'Oriskany', sides: ['shaded'] },
  { id: 'card-41', title: 'Bombing Pause', sides: ['unshaded'] },
  { id: 'card-46', title: '559th Transport Grp', sides: ['unshaded'] },
  { id: 'card-72', title: 'Body Count', sides: ['unshaded'] },
  { id: 'card-78', title: 'General Landsdale', sides: ['shaded'] },
  { id: 'card-115', title: 'Typhoon Kate', sides: ['unshaded'] },
] as const satisfies ReadonlyArray<{ readonly id: string; readonly title: string; readonly sides: readonly EventSide[] }>;

const allSides: readonly EventSide[] = ['unshaded', 'shaded'];

describe('FITL momentum event-card aggregate validation', () => {
  it('keeps momentum card coverage and lasting-effect duration contracts in sync', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected production spec compilation to succeed');

    const allCards = ((compiled.gameDef?.eventDecks ?? []).flatMap((deck) => deck.cards) as readonly MomentumCardLike[]);
    const momentumCards = allCards.filter((card) => card.tags?.includes('momentum'));

    const expectedMomentumIds = new Set(expectedMomentumCards.map((entry) => entry.id));
    assert.deepEqual(
      new Set(momentumCards.map((card) => card.id)),
      expectedMomentumIds,
      'Momentum-tagged card IDs must match canonical FITL momentum set',
    );
    assert.equal(momentumCards.length, 14, 'Expected exactly 14 momentum-tagged cards');

    let momentumEffectCount = 0;
    for (const expected of expectedMomentumCards) {
      const card = allCards.find((candidate) => candidate.id === expected.id);
      const expectedSides = new Set<EventSide>(expected.sides);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title, `${expected.id} title drifted`);
      assert.equal(card?.tags?.includes('momentum'), true, `${expected.id} must be tagged momentum`);

      for (const side of allSides) {
        const sidePayload: SidePayload | undefined = side === 'unshaded' ? card?.unshaded : card?.shaded;
        const lastingEffects: readonly MomentumEffect[] = sidePayload?.lastingEffects ?? [];
        const momentumEffects: readonly MomentumEffect[] = lastingEffects.filter((effect: MomentumEffect) => effect.id.startsWith('mom-'));

        if (expectedSides.has(side)) {
          assert.equal(
            momentumEffects.length > 0,
            true,
            `${expected.id} ${side} must include at least one momentum lasting effect`,
          );
          for (const effect of momentumEffects) {
            assert.equal(effect.duration, 'round', `${expected.id} ${side} effect ${effect.id} must use round duration`);
          }
          momentumEffectCount += momentumEffects.length;
        } else {
          assert.equal(
            momentumEffects.length,
            0,
            `${expected.id} ${side} should not include momentum lasting effects`,
          );
        }
      }
    }

    assert.equal(momentumEffectCount, 15, 'Expected 15 momentum lasting effects total (Medevac has both sides)');
  });
});
