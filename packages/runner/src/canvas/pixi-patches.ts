/**
 * Targeted monkey-patches for PixiJS v8 bugs.
 *
 * Bug: TexturePoolClass.returnTexture crashes when called with a texture
 * whose uid is not in _poolKeyHash (texture never pool-tracked) or whose
 * pool bucket was cleared (TexturePool.clear() resets _texturePool but not
 * _poolKeyHash).
 *
 * Upstream: https://github.com/pixijs/pixijs/issues/11735
 * Status:  Open, unfixed, no assignee (as of 2026-03-21)
 * Remove:  When PixiJS releases a version that guards returnTexture internally.
 */
import { TexturePoolClass } from 'pixi.js';

type ReturnTextureFn = (renderTexture: { uid: number; source: { style: unknown } }, resetStyle?: boolean) => void;

interface TexturePoolInternals {
  _poolKeyHash: Record<number, number | undefined>;
  _texturePool: Record<number, unknown[] | undefined>;
  textureStyle: unknown;
}

let originalReturnTexture: ReturnTextureFn | null = null;
let patched = false;

function guardedReturnTexture(
  this: TexturePoolInternals,
  renderTexture: { uid: number; source: { style: unknown } },
  resetStyle = false,
): void {
  const key = this._poolKeyHash[renderTexture.uid];
  if (key === undefined) {
    // Texture was never obtained via getOptimalTexture, or the pool was
    // cleared while textures were still in use. Returning it is a no-op.
    return;
  }

  if (resetStyle) {
    renderTexture.source.style = this.textureStyle;
  }

  let bucket = this._texturePool[key];
  if (bucket === undefined) {
    bucket = [];
    this._texturePool[key] = bucket;
  }
  bucket.push(renderTexture);
}

export function applyPixiPatches(): void {
  if (patched) {
    return;
  }

  const proto = TexturePoolClass.prototype as unknown as {
    returnTexture: ReturnTextureFn;
  };
  originalReturnTexture = proto.returnTexture;
  proto.returnTexture = guardedReturnTexture as unknown as ReturnTextureFn;
  patched = true;
}

export function removePixiPatches(): void {
  if (!patched || originalReturnTexture === null) {
    return;
  }

  const proto = TexturePoolClass.prototype as unknown as {
    returnTexture: ReturnTextureFn;
  };
  proto.returnTexture = originalReturnTexture;
  originalReturnTexture = null;
  patched = false;
}

// Auto-apply on module load so the patch is in place before any Application
// construction. Side-effect import in create-app.ts ensures correct ordering.
applyPixiPatches();
