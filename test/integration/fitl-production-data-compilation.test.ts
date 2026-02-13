import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';

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

describe('FITL production data integration compilation', () => {
  it('parses and validates the canonical production GameSpecDoc with required invariants', () => {
    const markdown = readFileSync(join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md'), 'utf8');
    const parsed = parseGameSpec(markdown);
    const validationDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    const actualValidationProfile = new Set(validationDiagnostics.map((diagnostic) => `${diagnostic.code}|${diagnostic.path}`));
    const expectedValidationProfile = new Set([
      'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.actions',
      'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.endConditions',
      'CNL_VALIDATOR_METADATA_PLAYERS_INVALID|doc.metadata.players',
      'CNL_VALIDATOR_REQUIRED_SECTION_MISSING|doc.turnStructure',
      // train-us-profile, train-arvn-profile, and patrol-us-profile all reference actionIds but no actions section exists yet
      'CNL_VALIDATOR_REFERENCE_MISSING|doc.operationProfiles.0.actionId',
      'CNL_VALIDATOR_REFERENCE_MISSING|doc.operationProfiles.1.actionId',
      'CNL_VALIDATOR_REFERENCE_MISSING|doc.operationProfiles.2.actionId',
    ]);
    assert.deepEqual(actualValidationProfile, expectedValidationProfile);

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
  });
});
