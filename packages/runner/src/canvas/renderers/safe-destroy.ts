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
  renderable?: boolean;
  visible?: boolean;
}

/**
 * Neutralizes a PixiJS display object without calling destroy().
 * Removes from parent, hides, disables interaction, and nulls internal
 * texture references so PixiJS's render loop cannot access dangling state.
 * Children remain attached for deferred destroy paths.
 */
export function neutralizeDisplayObject(displayObject: Container): void {
  displayObject.removeFromParent();
  displayObject.visible = false;
  displayObject.renderable = false;
  if ('eventMode' in displayObject) {
    (displayObject as { eventMode: string }).eventMode = 'none';
  }
  if ('interactiveChildren' in displayObject) {
    (displayObject as { interactiveChildren: boolean }).interactiveChildren = false;
  }
  if ('_texture' in displayObject) {
    (displayObject as { _texture: unknown })._texture = null;
  }
}

/**
 * Safely destroys a PixiJS container, catching errors from PixiJS v8's
 * TexturePoolClass.returnTexture bug triggered during React StrictMode.
 * Falls back to full neutralization if destroy() throws.
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
    fallbackDestroyChildren(displayObject, options);
    if ('renderable' in displayObject) {
      displayObject.renderable = false;
    }
    if ('visible' in displayObject) {
      displayObject.visible = false;
    }
    if ('eventMode' in displayObject) {
      (displayObject as { eventMode: string }).eventMode = 'none';
    }
    if ('interactiveChildren' in displayObject) {
      (displayObject as { interactiveChildren: boolean }).interactiveChildren = false;
    }
    if ('_texture' in displayObject) {
      (displayObject as { _texture: unknown })._texture = null;
    }
  }
}

function fallbackDestroyChildren(displayObject: DestroyableDisplayObject, options?: unknown): void {
  if (!('removeChildren' in displayObject) || typeof displayObject.removeChildren !== 'function') {
    return;
  }
  const removed = displayObject.removeChildren();
  if (!Array.isArray(removed)) {
    return;
  }
  for (const child of removed) {
    safeDestroyDisplayObject(child as DestroyableDisplayObject, options);
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
