// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

describe('cardAnnotationIndex compilation', () => {
  it('FITL GameDef includes cardAnnotationIndex with entries for all event cards', () => {
    const { compiled } = compileProductionSpec();
    const gameDef = compiled.gameDef;

    assert.ok(gameDef.cardAnnotationIndex !== undefined, 'cardAnnotationIndex should be present');
    const index = gameDef.cardAnnotationIndex!;

    assert.ok(gameDef.eventDecks !== undefined, 'FITL should have eventDecks');
    const expectedCardCount = gameDef.eventDecks!.reduce(
      (sum, deck) => sum + deck.cards.length,
      0,
    );
    const actualEntryCount = Object.keys(index.entries).length;

    assert.equal(
      actualEntryCount,
      expectedCardCount,
      `Expected ${expectedCardCount} annotation entries, got ${actualEntryCount}`,
    );
  });

  it('annotation entries are keyed by card ID and match event deck cards', () => {
    const { compiled } = compileProductionSpec();
    const gameDef = compiled.gameDef;
    const index = gameDef.cardAnnotationIndex!;

    for (const deck of gameDef.eventDecks!) {
      for (const card of deck.cards) {
        const entry = index.entries[card.id];
        assert.ok(entry !== undefined, `Missing annotation entry for card ${card.id}`);
        assert.equal(entry.cardId, card.id);
      }
    }
  });

  it('at least one annotation entry has non-zero effectNodeCount', () => {
    const { compiled } = compileProductionSpec();
    const index = compiled.gameDef.cardAnnotationIndex!;

    const hasNonZero = Object.values(index.entries).some((entry) => {
      const unshadedCount = entry.unshaded?.effectNodeCount ?? 0;
      const shadedCount = entry.shaded?.effectNodeCount ?? 0;
      return unshadedCount > 0 || shadedCount > 0;
    });

    assert.ok(hasNonZero, 'Expected at least one entry with non-zero effectNodeCount');
  });

  it('annotation numeric fields are non-negative', () => {
    const { compiled } = compileProductionSpec();
    const index = compiled.gameDef.cardAnnotationIndex!;

    for (const [cardId, entry] of Object.entries(index.entries)) {
      for (const side of [entry.unshaded, entry.shaded] as const) {
        if (side === undefined) continue;
        assert.ok(side.effectNodeCount >= 0, `${cardId}: effectNodeCount < 0`);
        assert.ok(side.markerModifications >= 0, `${cardId}: markerModifications < 0`);
        assert.ok(side.globalMarkerModifications >= 0, `${cardId}: globalMarkerModifications < 0`);
        assert.ok(side.globalVarModifications >= 0, `${cardId}: globalVarModifications < 0`);
        assert.ok(side.perPlayerVarModifications >= 0, `${cardId}: perPlayerVarModifications < 0`);
        assert.ok(side.varTransfers >= 0, `${cardId}: varTransfers < 0`);
        assert.ok(side.drawCount >= 0, `${cardId}: drawCount < 0`);
        assert.ok(side.shuffleCount >= 0, `${cardId}: shuffleCount < 0`);

        for (const [seat, count] of Object.entries(side.tokenPlacements)) {
          assert.ok(count >= 0, `${cardId}: tokenPlacements.${seat} < 0`);
        }
        for (const [seat, count] of Object.entries(side.tokenRemovals)) {
          assert.ok(count >= 0, `${cardId}: tokenRemovals.${seat} < 0`);
        }
      }
    }
  });

  it('Texas Hold\'em GameDef has no cardAnnotationIndex (no event decks)', () => {
    const { compiled } = compileTexasProductionSpec();
    const gameDef = compiled.gameDef;

    assert.equal(gameDef.cardAnnotationIndex, undefined);
  });

  it('GameDef validates against schema with cardAnnotationIndex', () => {
    const { compiled } = compileProductionSpec();
    assert.ok(compiled.gameDef !== null, 'FITL GameDef should compile successfully');
    assert.ok(compiled.gameDef.cardAnnotationIndex !== undefined);
  });
});
