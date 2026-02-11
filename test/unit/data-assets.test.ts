import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { loadDataAssetEnvelopeFromFile } from '../../src/kernel/index.js';

describe('data asset loader scaffold', () => {
  it('loads a valid JSON map envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-foundation',
          version: 1,
          kind: 'map',
          payload: { spaces: [] },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario'],
        expectedVersion: 1,
      });

      assert.equal(result.diagnostics.length, 0);
      assert.notEqual(result.asset, null);
      assert.equal(result.asset?.kind, 'map');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a valid YAML scenario envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-scenario.v1.yaml');
      writeFileSync(
        assetPath,
        [
          'id: fitl-foundation-westys-war',
          'version: 1',
          'kind: scenario',
          'payload:',
          '  setup: {}',
          '',
        ].join('\n'),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario'],
        expectedVersion: 1,
      });

      assert.equal(result.diagnostics.length, 0);
      assert.notEqual(result.asset, null);
      assert.equal(result.asset?.kind, 'scenario');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports unsupported version with asset context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map.v2.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-foundation',
          version: 2,
          kind: 'map',
          payload: { spaces: [] },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario'],
        expectedVersion: 1,
      });

      assert.equal(result.asset, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0]?.code, 'DATA_ASSET_VERSION_UNSUPPORTED');
      assert.equal(result.diagnostics[0]?.assetPath, assetPath);
      assert.equal(result.diagnostics[0]?.entityId, 'fitl-map-foundation');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports schema failures with assetPath and entityId when available', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'bad-kind.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-invalid-kind',
          version: 1,
          kind: 'invalid',
          payload: {},
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      assert.equal(result.diagnostics.length > 0, true);
      assert.equal(result.diagnostics[0]?.code, 'DATA_ASSET_SCHEMA_INVALID');
      assert.equal(result.diagnostics[0]?.assetPath, assetPath);
      assert.equal(result.diagnostics[0]?.entityId, 'fitl-invalid-kind');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a valid piece-catalog envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-pieces.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-piece-catalog-foundation',
          version: 1,
          kind: 'pieceCatalog',
          payload: {
            pieceTypes: [
              {
                id: 'vc-guerrilla',
                faction: 'vc',
                statusDimensions: ['activity'],
                transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
              },
            ],
            inventory: [{ pieceTypeId: 'vc-guerrilla', faction: 'vc', total: 30 }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario', 'pieceCatalog'],
        expectedVersion: 1,
      });

      assert.equal(result.diagnostics.length, 0);
      assert.notEqual(result.asset, null);
      assert.equal(result.asset?.kind, 'pieceCatalog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects piece-catalog transitions for undeclared dimensions with asset context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-pieces-invalid-transition.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-piece-catalog-invalid-transition',
          version: 1,
          kind: 'pieceCatalog',
          payload: {
            pieceTypes: [
              {
                id: 'vc-base',
                faction: 'vc',
                statusDimensions: ['activity'],
                transitions: [{ dimension: 'tunnel', from: 'untunneled', to: 'tunneled' }],
              },
            ],
            inventory: [{ pieceTypeId: 'vc-base', faction: 'vc', total: 9 }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'PIECE_STATUS_DIMENSION_UNDECLARED');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.assetPath, assetPath);
      assert.equal(diag?.entityId, 'fitl-piece-catalog-invalid-transition');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects piece-catalog inventory gaps with asset context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-pieces-missing-inventory.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-piece-catalog-missing-inventory',
          version: 1,
          kind: 'pieceCatalog',
          payload: {
            pieceTypes: [
              {
                id: 'vc-guerrilla',
                faction: 'vc',
                statusDimensions: ['activity'],
                transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
              },
            ],
            inventory: [],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'PIECE_INVENTORY_MISSING');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.assetPath, assetPath);
      assert.equal(diag?.entityId, 'fitl-piece-catalog-missing-inventory');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects negative piece-catalog totals at schema validation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-pieces-negative-total.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-piece-catalog-negative-total',
          version: 1,
          kind: 'pieceCatalog',
          payload: {
            pieceTypes: [
              {
                id: 'vc-guerrilla',
                faction: 'vc',
                statusDimensions: ['activity'],
                transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
              },
            ],
            inventory: [{ pieceTypeId: 'vc-guerrilla', faction: 'vc', total: -1 }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'PIECE_CATALOG_SCHEMA_INVALID');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.path, 'asset.payload.inventory.0.total');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
