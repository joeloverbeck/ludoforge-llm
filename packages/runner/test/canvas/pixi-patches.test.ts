import { describe, expect, it, afterEach } from 'vitest';
import { TexturePoolClass } from 'pixi.js';

import { applyPixiPatches, removePixiPatches } from '../../src/canvas/pixi-patches.js';

/**
 * We test against a fresh TexturePoolClass instance (not the global singleton)
 * to avoid polluting shared state. The patch operates on the prototype, so any
 * instance created after applyPixiPatches() inherits the guarded method.
 *
 * TexturePoolClass internals (_poolKeyHash, _texturePool) are private in TS
 * types but public at runtime. We access them via unknown casts.
 */

interface PoolInternals {
  _poolKeyHash: Record<number, number | undefined>;
  _texturePool: Record<number, unknown[] | undefined>;
  textureStyle: unknown;
  returnTexture(texture: unknown, resetStyle?: boolean): void;
}

function createPool(): PoolInternals {
  return new TexturePoolClass() as unknown as PoolInternals;
}

function makeTexture(uid: number): { uid: number; source: { style: unknown } } {
  return { uid, source: { style: {} } };
}

describe('pixi-patches', () => {
  afterEach(() => {
    // Ensure patches are applied for the next test (auto-applied on module load,
    // but removePixiPatches in a test could leave them removed).
    applyPixiPatches();
  });

  describe('TexturePool.returnTexture guard', () => {
    it('does not throw when texture uid is not in _poolKeyHash (undefined key)', () => {
      const pool = createPool();
      const texture = makeTexture(999);
      // uid 999 was never obtained via getOptimalTexture, so _poolKeyHash[999] is undefined
      expect(() => pool.returnTexture(texture)).not.toThrow();
    });

    it('does not throw when key exists in _poolKeyHash but bucket is missing from _texturePool', () => {
      const pool = createPool();
      const texture = makeTexture(42);
      // Simulate: texture was pool-tracked, then pool.clear() was called
      // (resets _texturePool but not _poolKeyHash)
      pool._poolKeyHash[42] = 7;
      // _texturePool[7] does not exist
      expect(() => pool.returnTexture(texture)).not.toThrow();
      // Bucket should have been lazily created with the texture in it
      expect(pool._texturePool[7]).toEqual([texture]);
    });

    it('works normally for properly tracked textures', () => {
      const pool = createPool();
      const texture = makeTexture(10);
      // Simulate normal pool tracking
      pool._poolKeyHash[10] = 3;
      pool._texturePool[3] = [];
      pool.returnTexture(texture);
      expect(pool._texturePool[3]).toEqual([texture]);
    });

    it('handles resetStyle=true when key is valid', () => {
      const pool = createPool();
      const texture = makeTexture(20);
      pool._poolKeyHash[20] = 5;
      pool._texturePool[5] = [];
      pool.returnTexture(texture, true);
      expect(texture.source.style).toBe(pool.textureStyle);
      expect(pool._texturePool[5]).toEqual([texture]);
    });

    it('silently returns for untracked texture even with resetStyle=true', () => {
      const pool = createPool();
      const texture = makeTexture(777);
      const originalStyle = texture.source.style;
      pool.returnTexture(texture, true);
      // Style should NOT be reset because we bail out before that
      expect(texture.source.style).toBe(originalStyle);
    });
  });

  describe('applyPixiPatches', () => {
    it('is idempotent — calling twice does not double-wrap', () => {
      const methodAfterFirstApply = TexturePoolClass.prototype.returnTexture;
      applyPixiPatches();
      expect(TexturePoolClass.prototype.returnTexture).toBe(methodAfterFirstApply);
    });
  });

  describe('removePixiPatches', () => {
    it('restores the original returnTexture method', () => {
      removePixiPatches();
      const pool = createPool();
      const texture = makeTexture(888);
      // Without the patch, accessing undefined key should throw
      expect(() => pool.returnTexture(texture)).toThrow();
      // Re-apply for cleanup
      applyPixiPatches();
    });

    it('is idempotent — calling twice does not throw', () => {
      removePixiPatches();
      expect(() => removePixiPatches()).not.toThrow();
      applyPixiPatches();
    });
  });
});
