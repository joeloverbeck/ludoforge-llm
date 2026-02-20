import type { Container } from 'pixi.js';

/**
 * Safely destroys a PixiJS container, catching errors from PixiJS v8's
 * TexturePoolClass.returnTexture bug triggered during React StrictMode.
 * Falls back to removeFromParent() if destroy() throws.
 */
export function safeDestroyContainer(container: Container): void {
  try {
    container.destroy();
  } catch (error) {
    console.warn('Container.destroy() failed; falling back to removeFromParent().', error);
    container.removeFromParent();
  }
}
