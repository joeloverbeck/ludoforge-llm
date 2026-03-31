import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCardMetadataIndex } from '../../../src/cnl/compile-event-cards.js';
import type { EventDeckDef } from '../../../src/kernel/types.js';

function makeDeck(overrides: Partial<EventDeckDef> & { id: string; cards: EventDeckDef['cards'] }): EventDeckDef {
  return {
    drawZone: 'draw',
    discardZone: 'discard',
    ...overrides,
  };
}

describe('buildCardMetadataIndex', () => {
  it('builds entries for all cards across multiple decks', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [
          { id: 'card-1', title: 'Card 1', sideMode: 'single' },
          { id: 'card-2', title: 'Card 2', sideMode: 'single' },
        ],
      }),
      makeDeck({
        id: 'deck-b',
        cards: [
          { id: 'card-3', title: 'Card 3', sideMode: 'dual' },
        ],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.equal(Object.keys(index.entries).length, 3);
    assert.equal(index.entries['card-1']!.deckId, 'deck-a');
    assert.equal(index.entries['card-2']!.deckId, 'deck-a');
    assert.equal(index.entries['card-3']!.deckId, 'deck-b');
  });

  it('populates cardId on each entry', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [{ id: 'evt-42', title: 'Event 42', sideMode: 'single' }],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.equal(index.entries['evt-42']!.cardId, 'evt-42');
  });

  it('propagates tags when present', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [
          { id: 'card-1', title: 'Card 1', sideMode: 'single', tags: ['pivotal', 'us'] },
        ],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries['card-1']!.tags, ['pivotal', 'us']);
  });

  it('defaults tags to empty array when absent', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [{ id: 'card-1', title: 'Card 1', sideMode: 'single' }],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries['card-1']!.tags, []);
  });

  it('includes scalar metadata values', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [
          {
            id: 'card-1',
            title: 'Card 1',
            sideMode: 'single',
            metadata: { faction: 'us', order: 5, critical: true },
          },
        ],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries['card-1']!.metadata, {
      faction: 'us',
      order: 5,
      critical: true,
    });
  });

  it('excludes array-valued metadata fields', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [
          {
            id: 'card-1',
            title: 'Card 1',
            sideMode: 'single',
            metadata: {
              faction: 'nva',
              relatedFactions: ['us', 'arvn'] as unknown as readonly string[],
              priority: 3,
            },
          },
        ],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries['card-1']!.metadata, {
      faction: 'nva',
      priority: 3,
    });
  });

  it('returns empty metadata when card has no metadata', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({
        id: 'deck-a',
        cards: [{ id: 'card-1', title: 'Card 1', sideMode: 'single' }],
      }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries['card-1']!.metadata, {});
  });

  it('returns empty entries for empty deck list', () => {
    const index = buildCardMetadataIndex([]);

    assert.deepStrictEqual(index.entries, {});
  });

  it('handles deck with no cards', () => {
    const decks: readonly EventDeckDef[] = [
      makeDeck({ id: 'empty-deck', cards: [] }),
    ];

    const index = buildCardMetadataIndex(decks);

    assert.deepStrictEqual(index.entries, {});
  });
});
