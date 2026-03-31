import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAuthoredPolicySurfaceRef,
  getPolicySurfaceVisibility,
} from '../../../src/agents/policy-surface.js';
import type {
  CompiledAgentPolicySurfaceCatalog,
  CompiledAgentPolicySurfaceVisibility,
} from '../../../src/kernel/index.js';

const hiddenVis: CompiledAgentPolicySurfaceVisibility = {
  current: 'hidden',
  preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
};

const publicVis: CompiledAgentPolicySurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: true },
};

function createCatalog(overrides?: Partial<CompiledAgentPolicySurfaceCatalog>): CompiledAgentPolicySurfaceCatalog {
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

describe('parseAuthoredPolicySurfaceRef — activeCard.annotation.*', () => {
  describe('annotation with seat segment', () => {
    it('parses activeCard.annotation.unshaded.tokenPlacements.us', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.tokenPlacements.us', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'unshaded.tokenPlacements.us',
        selector: { kind: 'role', seatToken: 'us' },
        visibility: publicVis,
      });
    });

    it('parses activeCard.annotation.shaded.tokenRemovals.nva', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.shaded.tokenRemovals.nva', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'shaded.tokenRemovals.nva',
        selector: { kind: 'role', seatToken: 'nva' },
        visibility: publicVis,
      });
    });

    it('parses self seat as player selector', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.tokenPlacements.self', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'unshaded.tokenPlacements.self',
        selector: { kind: 'player', player: 'self' },
        visibility: publicVis,
      });
    });

    it('parses active seat as player selector', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.shaded.tokenCreations.active', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'shaded.tokenCreations.active',
        selector: { kind: 'player', player: 'active' },
        visibility: publicVis,
      });
    });
  });

  describe('annotation without seat segment', () => {
    it('parses activeCard.annotation.shaded.markerModifications', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.shaded.markerModifications', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'shaded.markerModifications',
        visibility: publicVis,
      });
    });

    it('parses activeCard.annotation.unshaded.grantsOperation (boolean metric)', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.grantsOperation', 'current');
      assert.deepStrictEqual(result, {
        kind: 'currentSurface',
        family: 'activeCardAnnotation',
        id: 'unshaded.grantsOperation',
        visibility: publicVis,
      });
    });

    it('parses activeCard.annotation.unshaded.effectNodeCount', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.effectNodeCount', 'current');
      assert.equal(result?.family, 'activeCardAnnotation');
      assert.equal(result?.id, 'unshaded.effectNodeCount');
    });
  });

  describe('preview scope', () => {
    it('parses annotation ref in preview scope', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.tokenPlacements.us', 'preview');
      assert.equal(result?.kind, 'previewSurface');
      assert.equal(result?.family, 'activeCardAnnotation');
      assert.equal(result?.id, 'unshaded.tokenPlacements.us');
    });
  });

  describe('invalid paths', () => {
    it('returns null for missing side segment', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.', 'current');
      assert.equal(result, null);
    });

    it('returns null for unknown side', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.both.tokenPlacements', 'current');
      assert.equal(result, null);
    });

    it('returns null for missing metric segment', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded', 'current');
      assert.equal(result, null);
    });

    it('returns null for too many segments', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation.unshaded.tokenPlacements.us.extra', 'current');
      assert.equal(result, null);
    });

    it('returns null for bare activeCard.annotation', () => {
      const catalog = createCatalog();
      const result = parseAuthoredPolicySurfaceRef(catalog, 'activeCard.annotation', 'current');
      assert.equal(result, null);
    });
  });
});

describe('getPolicySurfaceVisibility — activeCardAnnotation', () => {
  it('returns visibility for activeCardAnnotation family', () => {
    const catalog = createCatalog();
    const result = getPolicySurfaceVisibility(catalog, {
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements',
    });
    assert.deepStrictEqual(result, publicVis);
  });

  it('returns custom visibility when overridden', () => {
    const customVis: CompiledAgentPolicySurfaceVisibility = {
      current: 'seatVisible',
      preview: { visibility: 'seatVisible', allowWhenHiddenSampling: false },
    };
    const catalog = createCatalog({ activeCardAnnotation: customVis });
    const result = getPolicySurfaceVisibility(catalog, {
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'shaded.markerModifications',
    });
    assert.deepStrictEqual(result, customVis);
  });
});
