import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

interface PieceTypeLike {
  readonly id: string;
  readonly faction: string;
}

interface InventoryEntryLike {
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly total: number;
}

describe('fitl production piece inventory', () => {
  it('encodes the full 229-piece inventory', () => {
    const markdown = readProductionSpec();
    const parsed = parseGameSpec(markdown);
    assertNoErrors(parsed);

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
    assert.equal(inventory.length, 12);

    const pieceTypeById = new Map(pieceTypes.map((pieceType) => [pieceType.id, pieceType]));
    assert.equal(pieceTypeById.size, 12, 'Expected unique piece type ids');

    const inventoryByPieceTypeId = new Map(inventory.map((entry) => [entry.pieceTypeId, entry]));
    assert.equal(inventoryByPieceTypeId.size, 12, 'Expected exactly one inventory entry per piece type');

    let totalPieces = 0;
    const totalsByFaction = new Map<string, number>([
      ['us', 0],
      ['arvn', 0],
      ['nva', 0],
      ['vc', 0],
    ]);

    for (const entry of inventory) {
      assert.equal(entry.total > 0, true, `Inventory total must be > 0 for ${entry.pieceTypeId}`);
      const pieceType = pieceTypeById.get(entry.pieceTypeId);
      assert.ok(pieceType, `Unknown pieceTypeId in inventory: ${entry.pieceTypeId}`);
      assert.equal(entry.faction, pieceType.faction, `Faction mismatch for ${entry.pieceTypeId}`);
      totalPieces += entry.total;
      totalsByFaction.set(entry.faction, (totalsByFaction.get(entry.faction) ?? 0) + entry.total);
    }

    assert.equal(totalPieces, 229);
    assert.equal(totalsByFaction.get('us'), 52);
    assert.equal(totalsByFaction.get('arvn'), 69);
    assert.equal(totalsByFaction.get('nva'), 69);
    assert.equal(totalsByFaction.get('vc'), 39);
  });
});
