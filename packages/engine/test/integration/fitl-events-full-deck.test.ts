import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const FITL_FACTIONS = new Set(['US', 'NVA', 'ARVN', 'VC']);

interface TutorialGoldenCard {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly sideMode: 'single' | 'dual';
  readonly tags: readonly string[];
  readonly metadata: {
    readonly period: string | null;
    readonly seatOrder: readonly string[] | null;
  };
}

interface TutorialGoldenFragment {
  readonly deckId: string;
  readonly tutorialIds: readonly string[];
  readonly cards: readonly TutorialGoldenCard[];
}

function readTutorialGolden(): TutorialGoldenFragment {
  const raw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'fitl-events-tutorial-golden.json'), 'utf8');
  return JSON.parse(raw) as TutorialGoldenFragment;
}

describe('FITL full deck compilation and golden invariants', () => {
  it('compiles full deck with deck-wide invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);

    const deck = compiled.gameDef?.eventDecks?.[0];
    assert.notEqual(deck, undefined);
    const cards = deck?.cards ?? [];

    assert.equal(cards.length, 130);

    const ids = cards.map((card) => card.id);
    assert.equal(new Set(ids).size, cards.length, 'Expected unique card IDs across compiled deck');

    const numericIds = ids.map((id) => Number(id.replace('card-', '')));
    const missingCardNumbers: number[] = [];
    for (let cardNumber = 1; cardNumber <= 130; cardNumber += 1) {
      if (!numericIds.includes(cardNumber)) {
        missingCardNumbers.push(cardNumber);
      }
    }
    assert.deepEqual(missingCardNumbers, []);

    const xrefDiagnostics = compiled.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));
    assert.equal(xrefDiagnostics.length, 0, 'Expected no CNL_XREF_* compile diagnostics');

    for (const card of cards) {
      if (card.sideMode === 'dual') {
        assert.notEqual(card.unshaded, undefined, `${card.id} should define unshaded side`);
        assert.notEqual(card.shaded, undefined, `${card.id} should define shaded side`);
      } else {
        assert.notEqual(card.unshaded, undefined, `${card.id} should define unshaded side`);
        assert.equal(card.shaded, undefined, `${card.id} should not define shaded side`);
      }

      const isCoup = card.tags?.includes('coup') ?? false;
      const factionOrderRaw = card.metadata?.seatOrder;

      if (isCoup) {
        assert.equal(card.sideMode, 'single', `${card.id} coup cards must be single side mode`);
        assert.equal(factionOrderRaw, undefined, `${card.id} coup cards should omit seatOrder`);
      } else {
        assert.equal(Array.isArray(factionOrderRaw), true, `${card.id} should define seatOrder`);
        if (!Array.isArray(factionOrderRaw)) {
          assert.fail(`${card.id} seatOrder must be an array`);
        }
        const seatOrder = factionOrderRaw.filter((faction): faction is string => typeof faction === 'string');
        assert.equal(seatOrder.length, factionOrderRaw.length, `${card.id} seatOrder entries must all be strings`);
        assert.equal(seatOrder?.length, 4, `${card.id} seatOrder should contain 4 entries`);
        assert.equal(new Set(seatOrder).size, 4, `${card.id} seatOrder should not repeat factions`);
        assert.equal(
          seatOrder?.every((faction) => FITL_FACTIONS.has(faction)) ?? false,
          true,
          `${card.id} seatOrder should only contain FITL factions`,
        );
      }

      if (card.tags?.includes('pivotal')) {
        assert.notEqual(card.playCondition, undefined, `${card.id} pivotal cards must define playCondition`);
      }
    }

    for (let index = 1; index < cards.length; index += 1) {
      const previous = cards[index - 1];
      const current = cards[index];
      assert.equal(
        (previous?.order ?? Number.NEGATIVE_INFINITY) <= (current?.order ?? Number.POSITIVE_INFINITY),
        true,
        `Card order must be non-decreasing: ${previous?.id} -> ${current?.id}`,
      );
    }
  });

  it('matches tutorial golden fragment', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);

    const expected = readTutorialGolden();
    const deck = compiled.gameDef?.eventDecks?.find((entry) => entry.id === expected.deckId);
    assert.notEqual(deck, undefined);

    const cardsById = new Map((deck?.cards ?? []).map((card) => [card.id, card] as const));
    const actualCards = expected.tutorialIds.map((id) => {
      const card = cardsById.get(id);
      assert.notEqual(card, undefined, `Expected tutorial card ${id}`);
      const order = card?.order;
      if (order === undefined) {
        assert.fail(`Expected tutorial card ${id} to define order`);
      }
      const periodRaw = card?.metadata?.period;
      const factionOrderRaw = card?.metadata?.seatOrder;

      return {
        id,
        title: card?.title ?? '',
        order,
        sideMode: card?.sideMode ?? 'single',
        tags: [...(card?.tags ?? [])],
        metadata: {
          period: typeof periodRaw === 'string' ? periodRaw : null,
          seatOrder:
            Array.isArray(factionOrderRaw) && factionOrderRaw.every((faction) => typeof faction === 'string')
              ? [...factionOrderRaw]
              : null,
        },
      };
    });

    const actual: TutorialGoldenFragment = {
      deckId: expected.deckId,
      tutorialIds: [...expected.tutorialIds],
      cards: actualCards,
    };

    assert.deepEqual(actual, expected);
  });
});
