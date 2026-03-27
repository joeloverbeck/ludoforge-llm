import { Graphics, type Container } from 'pixi.js';

import { collectLayoutAdjacencyPairs, partitionZones } from '../layout/build-layout-graph.js';
import type { MapEditorStoreApi } from './map-editor-store.js';

const DEFAULT_LINE_STYLE = {
  color: 0xffffff,
  width: 4,
  alpha: 0.9,
} as const;

export interface EditorAdjacencyRenderer {
  destroy(): void;
}

export function createEditorAdjacencyRenderer(
  adjacencyLayer: Container,
  store: MapEditorStoreApi,
): EditorAdjacencyRenderer {
  const pairs = collectLayoutAdjacencyPairs(partitionZones(store.getState().gameDef).board);
  const graphics = new Graphics();
  graphics.eventMode = 'none';
  graphics.interactiveChildren = false;
  adjacencyLayer.addChild(graphics);

  const render = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    graphics.clear();

    let hasVisibleLines = false;
    for (const pair of pairs) {
      const from = state.zonePositions.get(pair.from);
      const to = state.zonePositions.get(pair.to);
      if (from === undefined || to === undefined) {
        continue;
      }

      graphics.moveTo(from.x, from.y);
      graphics.lineTo(to.x, to.y);
      hasVisibleLines = true;
    }

    if (hasVisibleLines) {
      graphics.stroke(DEFAULT_LINE_STYLE);
    }

    graphics.visible = hasVisibleLines;
    graphics.renderable = hasVisibleLines;
  };

  render(store.getState());

  const unsubscribe = store.subscribe((state, previousState) => {
    if (state.zonePositions === previousState.zonePositions) {
      return;
    }

    render(state);
  });

  return {
    destroy(): void {
      unsubscribe();
      graphics.destroy();
    },
  };
}
