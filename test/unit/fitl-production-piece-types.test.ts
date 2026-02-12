import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';

interface PieceTypeLike {
  readonly id: string;
  readonly faction: string;
  readonly statusDimensions: readonly string[];
  readonly transitions: ReadonlyArray<{
    readonly dimension: string;
    readonly from: string;
    readonly to: string;
  }>;
}

interface InventoryEntryLike {
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly total: number;
}

describe('fitl production piece type catalog', () => {
  it('encodes complete piece type status dimensions and transitions', () => {
    const markdown = readFileSync(join(process.cwd(), 'data', 'games', 'fire-in-the-lake.md'), 'utf8');
    const parsed = parseGameSpec(markdown);
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);

    const pieceCatalogAsset = (parsed.doc.dataAssets ?? []).find(
      (asset) => asset.id === 'fitl-piece-catalog-production' && asset.kind === 'pieceCatalog',
    );
    assert.ok(pieceCatalogAsset, 'Expected fitl-piece-catalog-production pieceCatalog asset');

    const payload = pieceCatalogAsset.payload as {
      readonly pieceTypes?: readonly PieceTypeLike[];
      readonly inventory?: readonly InventoryEntryLike[];
    };
    assert.ok(Array.isArray(payload.pieceTypes), 'Expected pieceTypes array on pieceCatalog payload');
    assert.ok(Array.isArray(payload.inventory), 'Expected inventory array on pieceCatalog payload');

    const pieceTypes = payload.pieceTypes;
    const inventory = payload.inventory;
    assert.equal(pieceTypes.length, 12);

    const byId = new Map(pieceTypes.map((pieceType) => [pieceType.id, pieceType]));
    assert.equal(byId.size, 12, 'Expected piece type ids to be unique');

    const factionCounts = new Map<string, number>();
    for (const pieceType of pieceTypes) {
      factionCounts.set(pieceType.faction, (factionCounts.get(pieceType.faction) ?? 0) + 1);
    }
    assert.equal(factionCounts.get('us'), 3);
    assert.equal(factionCounts.get('arvn'), 4);
    assert.equal(factionCounts.get('nva'), 3);
    assert.equal(factionCounts.get('vc'), 2);

    const activityIds = ['us-irregulars', 'arvn-rangers', 'nva-guerrillas', 'vc-guerrillas'];
    const tunnelIds = ['nva-bases', 'vc-bases'];
    const noDimensionIds = ['us-troops', 'us-bases', 'arvn-troops', 'arvn-police', 'arvn-bases', 'nva-troops'];

    for (const id of activityIds) {
      const pieceType = byId.get(id);
      assert.ok(pieceType, `Expected piece type ${id}`);
      assert.equal(pieceType.statusDimensions.includes('activity'), true, `${id} must declare activity dimension`);
      assert.equal(
        hasTransition(pieceType, 'activity', 'underground', 'active'),
        true,
        `${id} must transition underground -> active`,
      );
      assert.equal(
        hasTransition(pieceType, 'activity', 'active', 'underground'),
        true,
        `${id} must transition active -> underground`,
      );
    }

    for (const id of tunnelIds) {
      const pieceType = byId.get(id);
      assert.ok(pieceType, `Expected piece type ${id}`);
      assert.equal(pieceType.statusDimensions.includes('tunnel'), true, `${id} must declare tunnel dimension`);
      assert.equal(
        hasTransition(pieceType, 'tunnel', 'untunneled', 'tunneled'),
        true,
        `${id} must transition untunneled -> tunneled`,
      );
      assert.equal(
        hasTransition(pieceType, 'tunnel', 'tunneled', 'untunneled'),
        true,
        `${id} must transition tunneled -> untunneled`,
      );
    }

    for (const id of noDimensionIds) {
      const pieceType = byId.get(id);
      assert.ok(pieceType, `Expected piece type ${id}`);
      assert.deepEqual(pieceType.statusDimensions, []);
      assert.deepEqual(pieceType.transitions, []);
    }

    for (const pieceType of pieceTypes) {
      const hasActivity = pieceType.statusDimensions.includes('activity');
      const hasTunnel = pieceType.statusDimensions.includes('tunnel');
      assert.equal(hasActivity && hasTunnel, false, `${pieceType.id} cannot have both activity and tunnel`);
    }

    assert.equal(inventory.length, 12);
    const inventoryByPieceTypeId = new Map(inventory.map((entry) => [entry.pieceTypeId, entry]));
    assert.equal(inventoryByPieceTypeId.size, 12, 'Expected one inventory entry per piece type');

    for (const pieceType of pieceTypes) {
      const entry = inventoryByPieceTypeId.get(pieceType.id);
      assert.ok(entry, `Expected inventory entry for ${pieceType.id}`);
      assert.equal(entry.faction, pieceType.faction);
      assert.equal(entry.total > 0, true, `${pieceType.id} inventory total must be positive`);
    }
  });
});

function hasTransition(
  pieceType: PieceTypeLike,
  dimension: string,
  from: string,
  to: string,
): boolean {
  return pieceType.transitions.some((transition) => {
    return transition.dimension === dimension && transition.from === from && transition.to === to;
  });
}
