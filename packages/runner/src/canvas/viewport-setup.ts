import { Viewport } from 'pixi-viewport';
import type { Container, EventSystem } from 'pixi.js';

import type { LayerHierarchy } from './layers';

interface WorldBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface ViewportLayers {
  readonly boardGroup: LayerHierarchy['boardGroup'];
  readonly tokenGroup: LayerHierarchy['tokenGroup'];
  readonly effectsGroup: LayerHierarchy['effectsGroup'];
  readonly interfaceGroup: LayerHierarchy['interfaceGroup'];
  readonly hudGroup: LayerHierarchy['hudGroup'];
}

export interface ViewportConfig {
  readonly stage: Container;
  readonly layers: ViewportLayers;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly events: EventSystem;
  readonly minScale: number;
  readonly maxScale: number;
}

export interface ViewportResult {
  readonly viewport: Viewport;
  readonly worldLayers: readonly Container[];
  updateWorldBounds(bounds: WorldBounds): void;
  destroy(): void;
}

export function setupViewport(config: ViewportConfig): ViewportResult {
  if (config.minScale > config.maxScale) {
    throw new Error('minScale must be less than or equal to maxScale');
  }

  const viewport = new Viewport({
    screenWidth: config.screenWidth,
    screenHeight: config.screenHeight,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    events: config.events,
  });

  viewport
    .drag()
    .pinch()
    .wheel()
    .clampZoom({ minScale: config.minScale, maxScale: config.maxScale });

  const worldLayers: readonly Container[] = [
    config.layers.boardGroup,
    config.layers.tokenGroup,
    config.layers.effectsGroup,
    config.layers.interfaceGroup,
  ];

  for (const layer of worldLayers) {
    viewport.addChild(layer);
  }

  config.stage.addChildAt(viewport, 0);
  if (config.layers.hudGroup.parent !== config.stage) {
    config.stage.addChild(config.layers.hudGroup);
  }

  const updateWorldBounds = (bounds: WorldBounds): void => {
    assertBounds(bounds);
    viewport.clamp({
      left: bounds.minX,
      top: bounds.minY,
      right: bounds.maxX,
      bottom: bounds.maxY,
    });
  };

  updateWorldBounds({ minX: 0, minY: 0, maxX: config.worldWidth, maxY: config.worldHeight });

  return {
    viewport,
    worldLayers,
    updateWorldBounds,
    destroy(): void {
      viewport.plugins.removeAll();
      for (const layer of worldLayers) {
        if (layer.parent === viewport) {
          viewport.removeChild(layer);
        }
      }
      viewport.removeFromParent();
      viewport.destroy();
    },
  };
}

function assertBounds(bounds: WorldBounds): void {
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error('viewport world bounds are invalid');
  }
}
