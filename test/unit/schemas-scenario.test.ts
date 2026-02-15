import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ScenarioPayloadSchema } from '../../src/kernel/index.js';

const validScenarioPayload = {
  mapAssetId: 'fitl-map-production',
  pieceCatalogAssetId: 'fitl-piece-catalog-production',
  scenarioName: 'Full',
  yearRange: '1964-1972',
  usPolicy: 'jfk',
  initialPlacements: [{ spaceId: 'saigon:none', pieceTypeId: 'us-troops', faction: 'us', count: 2 }],
  deckComposition: {
    pileCount: 6,
    eventsPerPile: 12,
    coupsPerPile: 1,
  },
  startingCapabilities: [{ capabilityId: 'arc-light', side: 'unshaded' }],
} as const;

describe('scenario payload schema', () => {
  it('parses a valid extended scenario payload', () => {
    const result = ScenarioPayloadSchema.safeParse(validScenarioPayload);
    assert.equal(result.success, true);
  });

  it('rejects missing required fields', () => {
    const requiredFields = [] as const;
    for (const field of requiredFields) {
      const payload: Record<string, unknown> = { ...validScenarioPayload };
      delete payload[field];
      const result = ScenarioPayloadSchema.safeParse(payload);
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((issue) => issue.path[0] === field));
    }
  });

  it('accepts scenarios without mapAssetId, pieceCatalogAssetId, scenarioName, and yearRange', () => {
    const result = ScenarioPayloadSchema.safeParse({
      settings: { mode: 'test' },
    });
    assert.equal(result.success, true);
  });

  it('rejects invalid usPolicy values', () => {
    const result = ScenarioPayloadSchema.safeParse({ ...validScenarioPayload, usPolicy: 'fdr' });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path[0] === 'usPolicy'));
  });

  it('rejects invalid capability side values', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      startingCapabilities: [{ capabilityId: 'arc-light', side: 'both' }],
    });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path[0] === 'startingCapabilities'));
  });

  it('rejects negative placement counts', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      initialPlacements: [{ spaceId: 'saigon:none', pieceTypeId: 'us-troops', faction: 'us', count: -1 }],
    });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'initialPlacements.0.count'));
  });

  it('rejects unknown fields in strict mode', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      unexpected: true,
    });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.code === 'unrecognized_keys'));
  });
});
