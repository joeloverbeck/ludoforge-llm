import { Application } from 'pixi.js';

import { createLayerHierarchy, type LayerHierarchy } from './layers';

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

  container.appendChild(app.canvas);
  const layers = createLayerHierarchy();

  return {
    app,
    layers,
    destroy(): void {
      app.destroy(true, { children: true, texture: true });
    },
  };
}
