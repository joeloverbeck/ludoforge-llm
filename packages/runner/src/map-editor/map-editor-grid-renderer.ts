import type { Viewport } from 'pixi-viewport';
import { Container, Graphics } from 'pixi.js';

import type { MapEditorStoreApi } from './map-editor-store.js';

const GRID_COLOR = 0x8f7751;
const GRID_ALPHA = 0.18;
const GRID_WIDTH = 1;

export interface EditorGridRenderer {
  destroy(): void;
}

export function createEditorGridRenderer(
  backgroundLayer: Container,
  viewport: Viewport,
  store: MapEditorStoreApi,
): EditorGridRenderer {
  const graphics = new Graphics();
  graphics.eventMode = 'none';
  graphics.interactiveChildren = false;
  backgroundLayer.addChild(graphics);

  const render = (): void => {
    const { showGrid, gridSize } = store.getState();
    graphics.clear();

    if (!showGrid) {
      graphics.visible = false;
      return;
    }

    graphics.visible = true;

    const startX = Math.floor(viewport.left / gridSize) * gridSize;
    const endX = Math.ceil(viewport.right / gridSize) * gridSize;
    const startY = Math.floor(viewport.top / gridSize) * gridSize;
    const endY = Math.ceil(viewport.bottom / gridSize) * gridSize;

    for (let x = startX; x <= endX; x += gridSize) {
      graphics.moveTo(x, startY);
      graphics.lineTo(x, endY);
    }

    for (let y = startY; y <= endY; y += gridSize) {
      graphics.moveTo(startX, y);
      graphics.lineTo(endX, y);
    }

    graphics.stroke({
      color: GRID_COLOR,
      alpha: GRID_ALPHA,
      width: GRID_WIDTH,
    });
  };

  render();

  const unsubscribe = store.subscribe((state, previousState) => {
    if (
      state.showGrid === previousState.showGrid
      && state.gridSize === previousState.gridSize
    ) {
      return;
    }

    render();
  });

  const onViewportMoved = (): void => {
    if (!store.getState().showGrid) {
      return;
    }
    render();
  };

  viewport.on('moved', onViewportMoved);

  return {
    destroy(): void {
      unsubscribe();
      viewport.off('moved', onViewportMoved);
      graphics.removeFromParent();
      graphics.destroy();
    },
  };
}
