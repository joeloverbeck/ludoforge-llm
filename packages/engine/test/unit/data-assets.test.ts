import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { loadDataAssetEnvelopeFromFile, validateDataAssetEnvelope } from '../../src/kernel/index.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('data asset loader scaffold', () => {
  it('loads a valid JSON map envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-foundation',
          kind: 'map',
          payload: { spaces: [] },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario'],
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
          'kind: scenario',
          'payload:',
          '  setup: {}',
          '',
        ].join('\n'),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario'],
      });

      assert.equal(result.diagnostics.length, 0);
      assert.notEqual(result.asset, null);
      assert.equal(result.asset?.kind, 'scenario');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a valid map envelope with typed tracks and marker lattice declarations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map-typed.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-foundation-typed',
          kind: 'map',
          payload: {
            spaces: [
              {
                id: 'hue:none',
                category: 'city',
                attributes: { population: 1, econ: 1, terrainTags: ['urban'], country: 'south-vietnam', coastal: true },
                adjacentTo: [],
              },
            ],
            tracks: [{ id: 'aid', scope: 'global', min: 0, max: 80, initial: 12 }],
            markerLattices: [
              {
                id: 'support-opposition',
                states: ['neutral', 'passive-support'],
                defaultState: 'neutral',
                constraints: [{ category: ['city'], allowedStates: ['neutral', 'passive-support'] }],
              },
            ],
            spaceMarkers: [{ spaceId: 'hue:none', markerId: 'support-opposition', state: 'passive-support' }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath, {
        expectedKinds: ['map', 'scenario', 'pieceCatalog'],
      });

      assert.equal(result.asset?.kind, 'map');
      assertNoDiagnostics(result);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates embedded envelopes without requiring filesystem paths', () => {
    const result = validateDataAssetEnvelope(
      {
        id: 'fitl-map-foundation',
        kind: 'map',
        payload: { spaces: [] },
      },
      {
        expectedKinds: ['map', 'scenario'],
        pathPrefix: 'doc.dataAssets.0',
      },
    );

    assert.notEqual(result.asset, null);
    assert.equal(result.diagnostics.length, 0);
  });

  it('rejects legacy eventCardSet data-asset kind when expectedKinds is constrained', () => {
    const result = validateDataAssetEnvelope(
      {
        id: 'fitl-event-cards-initial',
        kind: 'eventCardSet',
        payload: { cards: [] },
      },
      {
        expectedKinds: ['map', 'scenario', 'pieceCatalog'],
        pathPrefix: 'doc.dataAssets.0',
      },
    );

    assert.equal(result.asset, null);
    assert.equal(result.diagnostics.some((diag) => diag.code === 'DATA_ASSET_KIND_UNSUPPORTED'), true);
  });

  it('rejects unsupported kinds when expectedKinds is constrained', () => {
    const result = validateDataAssetEnvelope(
      {
        id: 'fitl-scenario',
        kind: 'scenario',
        payload: {},
      },
      {
        expectedKinds: ['map', 'pieceCatalog'],
        pathPrefix: 'doc.dataAssets.0',
      },
    );

    assert.equal(result.asset, null);
    assert.equal(result.diagnostics.some((diag) => diag.code === 'DATA_ASSET_KIND_UNSUPPORTED'), true);
  });

  it('accepts custom data-asset kinds when expectedKinds is unconstrained', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'bad-kind.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-invalid-kind',
          kind: 'invalid',
          payload: {},
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.diagnostics.length, 0);
      assert.equal(result.asset?.id, 'fitl-invalid-kind');
      assert.equal(result.asset?.kind, 'invalid');
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
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'vc' }],
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
      });

      assert.equal(result.diagnostics.length, 0);
      assert.notEqual(result.asset, null);
      assert.equal(result.asset?.kind, 'pieceCatalog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects piece-catalog payloads that omit required factions', () => {
    const result = validateDataAssetEnvelope(
      {
        id: 'fitl-piece-catalog-missing-factions',
        kind: 'pieceCatalog',
        payload: {
          pieceTypes: [],
          inventory: [],
        },
      },
      { pathPrefix: 'doc.dataAssets.0' },
    );

    assert.equal(result.asset, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID' && diagnostic.path === 'asset.payload.factions',
      ),
      true,
    );
  });

  it('rejects map tracks with out-of-bounds defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map-track-bounds.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-track-bounds-invalid',
          kind: 'map',
          payload: {
            spaces: [],
            tracks: [{ id: 'trail', scope: 'global', min: 0, max: 4, initial: 6 }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'MAP_TRACK_BOUNDS_INVALID');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.assetPath, assetPath);
      assert.equal(diag?.entityId, 'fitl-map-track-bounds-invalid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects map marker values that are not declared by their lattice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map-marker-state-invalid.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-marker-state-invalid',
          kind: 'map',
          payload: {
            spaces: [
              {
                id: 'hue:none',
                category: 'city',
                attributes: { population: 1, econ: 1, terrainTags: ['urban'], country: 'south-vietnam', coastal: true },
                adjacentTo: [],
              },
            ],
            markerLattices: [
              { id: 'support-opposition', states: ['neutral', 'passive-support'], defaultState: 'neutral' },
            ],
            spaceMarkers: [{ spaceId: 'hue:none', markerId: 'support-opposition', state: 'active-opposition' }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'MAP_SPACE_MARKER_STATE_UNKNOWN');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.path, 'asset.payload.spaceMarkers[0].state');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects map lattice constraints that reference unknown spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map-marker-constraint-space-invalid.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-marker-constraint-space-invalid',
          kind: 'map',
          payload: {
            spaces: [],
            markerLattices: [
              {
                id: 'support-opposition',
                states: ['neutral'],
                defaultState: 'neutral',
                constraints: [{ spaceIds: ['missing:none'], allowedStates: ['neutral'] }],
              },
            ],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'MAP_MARKER_CONSTRAINT_SPACE_UNKNOWN');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.path, 'asset.payload.markerLattices[0].constraints[0].spaceIds[0]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces array-valued attributeEquals in marker constraints by value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-map-marker-constraint-array-attrs.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-map-marker-constraint-array-attrs',
          kind: 'map',
          payload: {
            spaces: [
              {
                id: 'hue:none',
                category: 'city',
                attributes: { terrainTags: ['urban', 'coastal'] },
                adjacentTo: [],
              },
            ],
            markerLattices: [
              {
                id: 'support-opposition',
                states: ['neutral', 'passive-support'],
                defaultState: 'neutral',
                constraints: [
                  {
                    attributeEquals: { terrainTags: ['urban', 'coastal'] },
                    allowedStates: ['neutral'],
                  },
                ],
              },
            ],
            spaceMarkers: [{ spaceId: 'hue:none', markerId: 'support-opposition', state: 'passive-support' }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const diag = result.diagnostics.find((entry) => entry.code === 'MAP_MARKER_CONSTRAINT_VIOLATION');
      assert.notEqual(diag, undefined);
      assert.equal(diag?.path, 'asset.payload.spaces[0].id');
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
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'vc' }],
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
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'vc' }],
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
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'vc' }],
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

  it('rejects piece-catalog pieceTypes that reference undeclared factions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ludoforge-assets-'));
    try {
      const assetPath = join(dir, 'foundation-pieces-faction-undeclared.v1.json');
      writeFileSync(
        assetPath,
        JSON.stringify({
          id: 'fitl-piece-catalog-faction-undeclared',
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'us' }],
            pieceTypes: [
              {
                id: 'vc-guerrilla',
                faction: 'vc',
                statusDimensions: ['activity'],
                transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
              },
            ],
            inventory: [{ pieceTypeId: 'vc-guerrilla', faction: 'vc', total: 10 }],
          },
        }),
        'utf8',
      );

      const result = loadDataAssetEnvelopeFromFile(assetPath);
      assert.equal(result.asset, null);
      const pieceTypeDiag = result.diagnostics.find((entry) => entry.code === 'PIECE_CATALOG_PIECE_TYPE_FACTION_UNDECLARED');
      const inventoryDiag = result.diagnostics.find((entry) => entry.code === 'PIECE_CATALOG_INVENTORY_FACTION_UNDECLARED');
      assert.notEqual(pieceTypeDiag, undefined);
      assert.notEqual(inventoryDiag, undefined);
      assert.equal(pieceTypeDiag?.path, 'asset.payload.pieceTypes[0].faction');
      assert.equal(inventoryDiag?.path, 'asset.payload.inventory[0].faction');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
