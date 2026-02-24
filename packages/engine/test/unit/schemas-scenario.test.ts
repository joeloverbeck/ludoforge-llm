import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ScenarioPayloadSchema } from '../../src/kernel/index.js';

const validScenarioPayload = {
  mapAssetId: 'fitl-map-production',
  pieceCatalogAssetId: 'fitl-piece-catalog-production',
  scenarioName: 'Full',
  yearRange: '1964-1972',
  initialPlacements: [{ spaceId: 'saigon:none', pieceTypeId: 'us-troops', seat: 'us', count: 2 }],
  initializations: [
    { var: 'leaderBoxCardCount', value: 0 },
    { markerId: 'activeLeader', state: 'minh' },
  ],
  deckComposition: {
    materializationStrategy: 'pile-coup-mix-v1',
    pileCount: 6,
    eventsPerPile: 12,
    coupsPerPile: 1,
    excludedCardTags: ['pivotal'],
    pileFilters: [
      { piles: [1], metadataEquals: { period: '1964' } },
      { piles: [2, 3], metadataEquals: { period: '1965' } },
      { piles: [4, 5, 6], metadataEquals: { period: '1968' } },
    ],
  },
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

  it('accepts deckComposition with pileFilters omitted', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      deckComposition: {
        materializationStrategy: 'pile-coup-mix-v1',
        pileCount: 6,
        eventsPerPile: 12,
        coupsPerPile: 1,
        excludedCardTags: ['pivotal'],
      },
    });
    assert.equal(result.success, true);
  });

  it('rejects invalid initialization value types', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      initializations: [{ var: 'leaderBoxCardCount', value: 'zero' }],
    });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'initializations.0'));
  });

  it('rejects invalid global marker initialization shape', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      initializations: [{ markerId: 'activeLeader' }],
    });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'initializations.0'));
  });

  it('rejects negative placement counts', () => {
    const result = ScenarioPayloadSchema.safeParse({
      ...validScenarioPayload,
      initialPlacements: [{ spaceId: 'saigon:none', pieceTypeId: 'us-troops', seat: 'us', count: -1 }],
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
