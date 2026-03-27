import { Graphics, type Container } from 'pixi.js';

import {
  DEFAULT_EDGE_STYLE,
  type VisualConfigProvider,
} from '../config/visual-config-provider.js';
import { collectLayoutAdjacencyPairs, partitionZones } from '../layout/build-layout-graph.js';
import { resolveEdgeStrokeStyle } from '../rendering/resolve-edge-stroke-style.js';
import type { MapEditorStoreApi } from './map-editor-store.js';

export interface EditorAdjacencyRenderer {
  destroy(): void;
}

export function createEditorAdjacencyRenderer(
  adjacencyLayer: Container,
  store: MapEditorStoreApi,
  visualConfigProvider: VisualConfigProvider,
): EditorAdjacencyRenderer {
  const pairs = collectLayoutAdjacencyPairs(partitionZones(store.getState().gameDef).board);
  const graphics = new Graphics();
  graphics.eventMode = 'none';
  graphics.interactiveChildren = false;
  adjacencyLayer.addChild(graphics);

  const render = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    graphics.clear();
    const strokeStyle = resolveEdgeStrokeStyle(
      visualConfigProvider.resolveEdgeStyle(null, false),
      DEFAULT_EDGE_STYLE,
    );

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
      graphics.stroke(strokeStyle);
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
