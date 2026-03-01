import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandPieceGeneration } from '../../src/cnl/expand-piece-generation.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'piece-gen-test', players: { min: 2, max: 4 } },
});

function makePieceCatalogAsset(payload: unknown, id = 'deck') {
  return { id, kind: 'pieceCatalog', payload };
}

describe('expandPieceGeneration', () => {
  // Test 1: 52-card deck (4 suits × 13 ranks)
  it('expands a 52-card deck from 4 suits × 13 ranks', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'card-{suit}-{rank}',
                seat: 'none',
                statusDimensions: ['location'],
                transitions: [{ from: 'deck', to: 'hand' }],
                dimensions: [
                  { name: 'suit', values: ['hearts', 'diamonds', 'clubs', 'spades'] },
                  {
                    name: 'rank',
                    values: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
                  },
                ],
                derivedProps: {
                  value: {
                    from: 'rank',
                    map: { J: 11, Q: 12, K: 13, A: 14 },
                    default: '{rank}',
                  },
                },
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const payload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
      inventory: readonly Record<string, unknown>[];
    };

    assert.equal(payload.pieceTypes.length, 52);
    assert.equal(payload.inventory.length, 52);

    // Check first card: hearts-2
    const first = payload.pieceTypes[0]!;
    assert.equal(first.id, 'card-hearts-2');
    assert.equal(first.seat, 'none');
    assert.deepEqual(first.runtimeProps, { suit: 'hearts', rank: '2', value: '2' });

    // Check a face card with map lookup: hearts-J
    const jackOfHearts = payload.pieceTypes.find((pt) => pt.id === 'card-hearts-J');
    assert.ok(jackOfHearts);
    assert.deepEqual(jackOfHearts.runtimeProps, { suit: 'hearts', rank: 'J', value: 11 });

    // Verify all IDs are unique
    const ids = payload.pieceTypes.map((pt) => pt.id);
    assert.equal(new Set(ids).size, 52);

    // Verify inventory entries
    const firstInv = payload.inventory[0]!;
    assert.equal(firstInv.pieceTypeId, 'card-hearts-2');
    assert.equal(firstInv.seat, 'none');
    assert.equal(firstInv.total, 1);
  });

  // Test 2: Single dimension
  it('expands a single dimension correctly', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'die-{face}',
                seat: 'none',
                statusDimensions: ['location'],
                transitions: [],
                dimensions: [{ name: 'face', values: [1, 2, 3, 4, 5, 6] }],
                inventoryPerCombination: 2,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const payload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
      inventory: readonly Record<string, unknown>[];
    };

    assert.equal(payload.pieceTypes.length, 6);
    assert.equal(payload.inventory.length, 6);

    const first = payload.pieceTypes[0]!;
    assert.equal(first.id, 'die-1');
    assert.deepEqual(first.runtimeProps, { face: 1 });
  });

  // Test 3: Derived props with map + default
  it('evaluates derived props: map hit uses mapped value, map miss uses default with substitution', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'token-{color}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'color', values: ['red', 'blue', 'green'] }],
                derivedProps: {
                  label: {
                    from: 'color',
                    map: { red: 'R', blue: 'B' },
                    default: 'other-{color}',
                  },
                },
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const payload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
    };

    const red = payload.pieceTypes.find((pt) => pt.id === 'token-red')!;
    assert.deepEqual(red.runtimeProps, { color: 'red', label: 'R' });

    const green = payload.pieceTypes.find((pt) => pt.id === 'token-green')!;
    assert.deepEqual(green.runtimeProps, {
      color: 'green',
      label: 'other-green',
    });
  });

  // Test 4: Duplicate ID detection
  it('emits CNL_COMPILER_PIECE_GEN_DUPLICATE_ID when IDs collide', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            { id: 'card-a', seat: 'none', statusDimensions: [], transitions: [] },
            {
              generate: {
                idPattern: 'card-{x}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'x', values: ['a', 'b'] }],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    const dupDiag = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DUPLICATE_ID,
    );
    assert.equal(dupDiag.length, 1);
    assert.ok(dupDiag[0]!.message.includes('card-a'));
  });

  // Test 5: Missing placeholder in idPattern
  it('emits CNL_COMPILER_PIECE_GEN_ID_PATTERN_NO_PLACEHOLDER when no placeholders exist', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'static-id',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'x', values: ['a'] }],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_ID_PATTERN_NO_PLACEHOLDER,
      ),
    );
  });

  // Test 6: Invalid derivedProps.from
  it('emits CNL_COMPILER_PIECE_GEN_DERIVED_PROP_FROM_UNKNOWN for unknown dimension ref', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'item-{x}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'x', values: ['a'] }],
                derivedProps: {
                  label: { from: 'nonexistent', map: {} },
                },
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code ===
          CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DERIVED_PROP_FROM_UNKNOWN,
      ),
    );
  });

  // Test 7: Mixed generate + individual pieceTypes
  it('preserves individual pieceTypes alongside generated ones', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            { id: 'joker', seat: 'none', statusDimensions: ['location'], transitions: [] },
            {
              generate: {
                idPattern: 'card-{suit}',
                seat: 'none',
                statusDimensions: ['location'],
                transitions: [],
                dimensions: [{ name: 'suit', values: ['hearts', 'spades'] }],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [{ pieceTypeId: 'joker', total: 2 }],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const payload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
      inventory: readonly Record<string, unknown>[];
    };

    // 1 individual + 2 generated
    assert.equal(payload.pieceTypes.length, 3);
    assert.equal(payload.pieceTypes[0]!.id, 'joker');
    assert.equal(payload.pieceTypes[1]!.id, 'card-hearts');
    assert.equal(payload.pieceTypes[2]!.id, 'card-spades');

    // 1 original + 2 generated inventory entries
    assert.equal(payload.inventory.length, 3);
    assert.equal(payload.inventory[0]!.pieceTypeId, 'joker');
    assert.equal(payload.inventory[0]!.total, 2);
  });

  // Test 8: No pieceCatalog assets
  it('returns doc unchanged when no pieceCatalog assets exist', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [{ id: 'other', kind: 'scenario', payload: {} }],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.doc, doc);
  });

  // Test 9: inventoryPerCombination > 1
  it('sets correct total when inventoryPerCombination > 1', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'meeple-{color}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'color', values: ['red', 'blue'] }],
                inventoryPerCombination: 5,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const payload = result.doc.dataAssets![0]!.payload as {
      inventory: readonly Record<string, unknown>[];
    };

    assert.equal(payload.inventory.length, 2);
    assert.equal(payload.inventory[0]!.total, 5);
    assert.equal(payload.inventory[1]!.total, 5);
  });

  // Test 10: Unresolved placeholder in idPattern
  it('emits CNL_COMPILER_PIECE_GEN_ID_PATTERN_UNRESOLVED_PLACEHOLDER for unknown placeholders', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'item-{x}-{unknown}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'x', values: ['a'] }],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code ===
          CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_ID_PATTERN_UNRESOLVED_PLACEHOLDER,
      ),
    );
  });

  // Test 11: Empty dimensions array
  it('emits CNL_COMPILER_PIECE_GEN_DIMENSIONS_EMPTY when dimensions is empty', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'item-{x}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DIMENSIONS_EMPTY,
      ),
    );
  });

  // Test 12: Dimension with empty values
  it('emits CNL_COMPILER_PIECE_GEN_DIMENSION_VALUES_EMPTY when a dimension has no values', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset({
          pieceTypes: [
            {
              generate: {
                idPattern: 'item-{x}',
                seat: 'none',
                statusDimensions: [],
                transitions: [],
                dimensions: [{ name: 'x', values: [] }],
                inventoryPerCombination: 1,
              },
            },
          ],
          inventory: [],
        }),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code ===
          CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_DIMENSION_VALUES_EMPTY,
      ),
    );
  });

  // Test 13: Multiple pieceCatalog assets expanded independently
  it('expands multiple pieceCatalog assets independently', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [
        makePieceCatalogAsset(
          {
            pieceTypes: [
              {
                generate: {
                  idPattern: 'coin-{type}',
                  seat: 'none',
                  statusDimensions: [],
                  transitions: [],
                  dimensions: [{ name: 'type', values: ['gold', 'silver'] }],
                  inventoryPerCombination: 3,
                },
              },
            ],
            inventory: [],
          },
          'coins',
        ),
        makePieceCatalogAsset(
          {
            pieceTypes: [
              {
                generate: {
                  idPattern: 'tile-{color}',
                  seat: 'none',
                  statusDimensions: [],
                  transitions: [],
                  dimensions: [{ name: 'color', values: ['red', 'blue', 'green'] }],
                  inventoryPerCombination: 1,
                },
              },
            ],
            inventory: [],
          },
          'tiles',
        ),
      ],
    };

    const result = expandPieceGeneration(doc);
    assert.deepEqual(result.diagnostics, []);

    const coinPayload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
    };
    const tilePayload = result.doc.dataAssets![1]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
    };

    assert.equal(coinPayload.pieceTypes.length, 2);
    assert.equal(tilePayload.pieceTypes.length, 3);
  });
});
