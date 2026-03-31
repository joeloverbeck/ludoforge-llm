import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAuthoredPolicySurfaceRef,
  getPolicySurfaceVisibility,
} from '../../../src/agents/policy-surface.js';
import type {
  CompiledSurfaceCatalog,
  CompiledSurfaceVisibility,
} from '../../../src/kernel/index.js';

const hiddenVis: CompiledSurfaceVisibility = {
  current: 'hidden',
  preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
};

const publicVis: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: true },
};

function createCatalog(overrides?: Partial<CompiledSurfaceCatalog>): CompiledSurfaceCatalog {
  return {
    globalVars: { score: publicVis },
    perPlayerVars: { tempo: publicVis },
    derivedMetrics: { aggro: publicVis },
    victory: {
      currentMargin: hiddenVis,
      currentRank: hiddenVis,
    },
    activeCardIdentity: publicVis,
    activeCardTag: publicVis,
    activeCardMetadata: publicVis,
    activeCardAnnotation: publicVis,
    ...overrides,
  };
}

describe('parseAuthoredPolicySurfaceRef', () => {
  describe('activeCard.id', () => {
    it('parses activeCard.id as activeCardIdentity with id "id"', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.id', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardIdentity',
        id: 'id',
        visibility: publicVis,
      });
    });

    it('parses activeCard.id in preview scope', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.id', 'preview');
      assert.equal(result?.kind, 'previewSurface');
      assert.equal(result?.family, 'activeCardIdentity');
      assert.equal(result?.id, 'id');
    });
  });

  describe('activeCard.deckId', () => {
    it('parses activeCard.deckId as activeCardIdentity with id "deckId"', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.deckId', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardIdentity',
        id: 'deckId',
        visibility: publicVis,
      });
    });
  });

  describe('activeCard.hasTag.<TAG>', () => {
    it('parses activeCard.hasTag.pivotal as activeCardTag with id "pivotal"', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.hasTag.pivotal', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardTag',
        id: 'pivotal',
        visibility: publicVis,
      });
    });

    it('parses activeCard.hasTag.momentum as activeCardTag', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.hasTag.momentum', 'current');
      assert.equal(result?.family, 'activeCardTag');
      assert.equal(result?.id, 'momentum');
    });

    it('returns null for malformed activeCard.hasTag (no tag name)', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.hasTag.', 'current');
      assert.equal(result, null);
    });
  });

  describe('activeCard.metadata.<KEY>', () => {
    it('parses activeCard.metadata.period as activeCardMetadata with id "period"', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.metadata.period', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardMetadata',
        id: 'period',
        visibility: publicVis,
      });
    });

    it('parses activeCard.metadata.vcFavorability', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.metadata.vcFavorability', 'current');
      assert.equal(result?.family, 'activeCardMetadata');
      assert.equal(result?.id, 'vcFavorability');
    });

    it('returns null for malformed activeCard.metadata (no key)', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.metadata.', 'current');
      assert.equal(result, null);
    });
  });

  describe('malformed activeCard paths', () => {
    it('returns null for activeCard.unknown', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.unknown', 'current');
      assert.equal(result, null);
    });

    it('returns null for bare activeCard', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard', 'current');
      assert.equal(result, null);
    });
  });

  describe('existing ref paths still work', () => {
    it('parses var.global.score', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'var.global.score', 'current');
      assert.equal(result?.family, 'globalVar');
      assert.equal(result?.id, 'score');
    });

    it('parses metric.aggro', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'metric.aggro', 'current');
      assert.equal(result?.family, 'derivedMetric');
      assert.equal(result?.id, 'aggro');
    });
  });
});

describe('getPolicySurfaceVisibility', () => {
  it('returns visibility for activeCardIdentity', () => {
    const catalog = createCatalog();
    const result = getPolicySurfaceVisibility(catalog, {
      kind: 'currentSurface',
      family: 'activeCardIdentity',
      id: 'id',
    });
    assert.deepStrictEqual(result, publicVis);
  });

  it('returns visibility for activeCardTag', () => {
    const catalog = createCatalog();
    const result = getPolicySurfaceVisibility(catalog, {
      kind: 'currentSurface',
      family: 'activeCardTag',
      id: 'pivotal',
    });
    assert.deepStrictEqual(result, publicVis);
  });

  it('returns visibility for activeCardMetadata', () => {
    const catalog = createCatalog();
    const result = getPolicySurfaceVisibility(catalog, {
      kind: 'currentSurface',
      family: 'activeCardMetadata',
      id: 'period',
    });
    assert.deepStrictEqual(result, publicVis);
  });
});
