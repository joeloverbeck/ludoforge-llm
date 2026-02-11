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
});
