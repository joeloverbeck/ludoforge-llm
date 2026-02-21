import type { Container } from 'pixi.js';

let destroyFallbackCount = 0;

export function getDestroyFallbackCount(): number {
  return destroyFallbackCount;
}

export function resetDestroyFallbackCount(): void {
  destroyFallbackCount = 0;
}

interface DestroyableDisplayObject {
  destroy(options?: unknown): void;
  removeFromParent(): void;
}

/**
 * Safely destroys a PixiJS container, catching errors from PixiJS v8's
 * TexturePoolClass.returnTexture bug triggered during React StrictMode.
 * Falls back to removeFromParent() if destroy() throws.
 */
export function safeDestroyContainer(container: Container): void {
  safeDestroyDisplayObject(container);
}

export function safeDestroyDisplayObject(
  displayObject: DestroyableDisplayObject,
  options?: unknown,
): void {
  try {
    displayObject.destroy(options);
  } catch (error) {
    destroyFallbackCount += 1;
    console.warn('Display object destroy() failed; falling back to removeFromParent().', error);
    displayObject.removeFromParent();
  }
}

export function safeDestroyChildren(container: Container, options?: unknown): void {
  const removed = container.removeChildren();
  if (!Array.isArray(removed)) {
    return;
  }
  for (const child of removed) {
    safeDestroyDisplayObject(child, options);
  }
}
