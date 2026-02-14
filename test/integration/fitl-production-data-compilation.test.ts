import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

interface MapSpaceLike {
  readonly id: string;
  readonly spaceType: string;
  readonly terrainTags: readonly string[];
  readonly adjacentTo: readonly string[];
}

interface TrackLike {
  readonly id: string;
}

interface MarkerLatticeLike {
  readonly id: string;
  readonly states: readonly string[];
}

interface PieceTypeLike {
  readonly id: string;
}

interface InventoryEntryLike {
  readonly total: number;
}

interface EventCardLike {
  readonly id: string;
  readonly title: string;
}

describe('FITL production data integration compilation', () => {
  it('parses and validates the canonical production GameSpecDoc with required invariants', () => {
    const { parsed, validatorDiagnostics, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    // All required sections now present — no expected validation warnings
    const actualValidationProfile = new Set(validatorDiagnostics.map((diagnostic) => `${diagnostic.code}|${diagnostic.path}`));
    assert.deepEqual(actualValidationProfile, new Set());

    // Compilation must succeed (gameDef non-null)
    assert.notEqual(compiled.gameDef, null, 'Expected gameDef to compile successfully');
    const profileBackedActionIds = new Set((compiled.gameDef!.actionPipelines ?? []).map((profile) => String(profile.actionId)));
    for (const action of compiled.gameDef!.actions) {
      if (!profileBackedActionIds.has(String(action.id))) {
        continue;
      }
      assert.deepEqual(action.effects, [], `Expected profile-backed action ${String(action.id)} to have no fallback action effects`);
    }

    const mapAsset = (parsed.doc.dataAssets ?? []).find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
    assert.ok(mapAsset, 'Expected fitl-map-production map asset');
    const mapPayload = mapAsset.payload as {
      readonly spaces?: readonly MapSpaceLike[];
      readonly tracks?: readonly TrackLike[];
      readonly markerLattices?: readonly MarkerLatticeLike[];
    };

    assert.ok(Array.isArray(mapPayload.spaces), 'Expected map spaces array');
    const spaces = [...mapPayload.spaces];
    assert.equal(spaces.length, 47);

    const spaceById = new Map(spaces.map((space) => [space.id, space]));
    for (const space of spaces) {
      for (const adjacentId of space.adjacentTo) {
        assert.equal(space.id === adjacentId, false, `${space.id} must not self-reference in adjacentTo`);
        const adjacent = spaceById.get(adjacentId);
        assert.ok(adjacent, `${space.id} references unknown adjacent space ${adjacentId}`);
        assert.equal(adjacent.adjacentTo.includes(space.id), true, `${space.id} -> ${adjacentId} must be symmetric`);
      }
    }

    const locs = spaces.filter((space) => space.spaceType === 'loc');
    assert.equal(
      locs.every((space) => space.terrainTags.includes('highway') || space.terrainTags.includes('mekong')),
      true,
      'Every LoC must include at least one of highway or mekong terrain tags',
    );

    assert.ok(Array.isArray(mapPayload.tracks), 'Expected tracks array');
    const trackIds = new Set(mapPayload.tracks.map((track) => track.id));
    assert.equal(trackIds.size, 8);
    assert.deepEqual(
      trackIds,
      new Set(['nvaResources', 'vcResources', 'arvnResources', 'aid', 'patronage', 'trail', 'totalEcon', 'terrorSabotageMarkersPlaced']),
    );

    assert.ok(Array.isArray(mapPayload.markerLattices), 'Expected markerLattices array');
    const supportOpposition = mapPayload.markerLattices.find((lattice) => lattice.id === 'supportOpposition');
    assert.ok(supportOpposition, 'Expected supportOpposition lattice');
    assert.equal(supportOpposition.states.length, 5);

    const pieceCatalogAsset = (parsed.doc.dataAssets ?? []).find(
      (asset) => asset.id === 'fitl-piece-catalog-production' && asset.kind === 'pieceCatalog',
    );
    assert.ok(pieceCatalogAsset, 'Expected fitl-piece-catalog-production piece catalog asset');
    const pieceCatalogPayload = pieceCatalogAsset.payload as {
      readonly pieceTypes?: readonly PieceTypeLike[];
      readonly inventory?: readonly InventoryEntryLike[];
    };
    assert.ok(Array.isArray(pieceCatalogPayload.pieceTypes), 'Expected pieceTypes array');
    assert.ok(Array.isArray(pieceCatalogPayload.inventory), 'Expected inventory array');

    assert.equal(pieceCatalogPayload.pieceTypes.length, 12);
    const inventoryTotal = pieceCatalogPayload.inventory.reduce((sum, entry) => sum + entry.total, 0);
    assert.equal(inventoryTotal, 229);

    const allAssets = parsed.doc.dataAssets ?? [];
    const scenarioAssets = allAssets.filter((asset) => asset.kind === 'scenario');
    assert.equal(scenarioAssets.length, 3, 'Expected exactly 3 scenario assets');
    const scenarioIds = new Set(scenarioAssets.map((asset) => asset.id));
    assert.deepEqual(
      scenarioIds,
      new Set(['fitl-scenario-full', 'fitl-scenario-short', 'fitl-scenario-medium']),
      'Expected scenario IDs: fitl-scenario-full, fitl-scenario-short, fitl-scenario-medium',
    );
    assert.equal(
      allAssets.some((asset) => asset.id === 'fitl-scenario-production'),
      false,
      'Placeholder fitl-scenario-production must not exist',
    );

    const eventDeck = parsed.doc.eventDecks?.find((deck) => deck.id === 'fitl-events-initial-card-pack');
    assert.ok(eventDeck, 'Expected fitl-events-initial-card-pack event deck');
    assert.equal(eventDeck?.cards.length, 2, 'Expected 2 event cards (82 Domino Theory, 27 Phoenix Program)');
    const cardIds = new Set((eventDeck?.cards ?? []).map((card: EventCardLike) => card.id));
    assert.deepEqual(cardIds, new Set(['card-82', 'card-27']));
  });
});
