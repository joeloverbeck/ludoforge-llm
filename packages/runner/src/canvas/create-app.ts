// Side-effect import: must be first to patch TexturePool before any Application construction.
// See pixi-patches.ts for upstream bug details (PixiJS #11735).
import './pixi-patches.js';

import { Application, TexturePool } from 'pixi.js';

import { createLayerHierarchy, type LayerHierarchy } from './layers';
import { installLabelBitmapFonts } from './text/bitmap-font-registry.js';

function getResolution(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  return window.devicePixelRatio;
}

export interface GameCanvas {
  readonly app: Application;
  readonly layers: LayerHierarchy;
  destroy(): void;
}

export interface GameCanvasConfig {
  readonly backgroundColor: number;
}

export async function createGameCanvas(
  container: HTMLElement,
  config: GameCanvasConfig,
): Promise<GameCanvas> {
  const app = new Application();

  await app.init({
    preference: 'webgl',
    antialias: true,
    resolution: getResolution(),
    autoDensity: true,
    backgroundColor: config.backgroundColor,
    resizeTo: container,
  });

  installLabelBitmapFonts(getResolution());
  container.appendChild(app.canvas);
  const layers = createLayerHierarchy();

  return {
    app,
    layers,
    destroy(): void {
      // Clear the pool first: empties _texturePool so any returnTexture calls
      // during app.destroy() find no buckets (the patch silently skips them).
      TexturePool.clear();
      app.destroy(true, { children: true, texture: true });
    },
  };
}
