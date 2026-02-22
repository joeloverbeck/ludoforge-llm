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

function isTexturePoolError(message: string): boolean {
  return message.includes('returnTexture')
    || message.includes('TexturePool')
    || (message.includes('Cannot read properties of undefined') && message.includes('push'));
}

function installTexturePoolErrorGuard(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: ErrorEvent): void => {
    if (event.error instanceof TypeError && isTexturePoolError(event.message)) {
      event.preventDefault();
      console.warn('[LudoForge] PixiJS TexturePool error suppressed.', event.error);
    }
  };
  window.addEventListener('error', handler);
  return () => window.removeEventListener('error', handler);
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
  const removeErrorGuard = installTexturePoolErrorGuard();

  return {
    app,
    layers,
    destroy(): void {
      removeErrorGuard();
      app.destroy(true, { children: true, texture: true });
    },
  };
}
