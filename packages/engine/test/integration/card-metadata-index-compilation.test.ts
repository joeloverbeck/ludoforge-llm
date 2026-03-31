import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

describe('cardMetadataIndex compilation', () => {
  it('FITL GameDef includes cardMetadataIndex with entries for all event cards', () => {
    const { compiled } = compileProductionSpec();
    const gameDef = compiled.gameDef;

    assert.ok(gameDef.cardMetadataIndex !== undefined, 'cardMetadataIndex should be present');
    const index = gameDef.cardMetadataIndex!;

    assert.ok(gameDef.eventDecks !== undefined, 'FITL should have eventDecks');
    const expectedCardCount = gameDef.eventDecks!.reduce(
      (sum, deck) => sum + deck.cards.length,
      0,
    );
    const actualEntryCount = Object.keys(index.entries).length;

    assert.equal(
      actualEntryCount,
      expectedCardCount,
      `Expected ${expectedCardCount} index entries, got ${actualEntryCount}`,
    );

    for (const deck of gameDef.eventDecks!) {
      for (const card of deck.cards) {
        const entry = index.entries[card.id];
        assert.ok(entry !== undefined, `Missing index entry for card ${card.id}`);
        assert.equal(entry.deckId, deck.id);
        assert.equal(entry.cardId, card.id);
        assert.ok(Array.isArray(entry.tags));

        for (const value of Object.values(entry.metadata)) {
          const valueType = typeof value;
          assert.ok(
            valueType === 'string' || valueType === 'number' || valueType === 'boolean',
            `Non-scalar metadata value found for card ${card.id}: type ${valueType}`,
          );
        }
      }
    }
  });

  it('Texas Hold\'em GameDef has no cardMetadataIndex (no event decks)', () => {
    const { compiled } = compileTexasProductionSpec();
    const gameDef = compiled.gameDef;

    assert.equal(gameDef.cardMetadataIndex, undefined);
  });
});
