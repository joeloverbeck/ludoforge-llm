import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';

import {
  createDraggableHandle,
  createMidpointHandle,
  DOUBLE_CLICK_MS,
} from './handle-graphics.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import type { Position } from './map-editor-types.js';

const MIN_VERTEX_COUNT = 3; // Cannot remove below 3 vertices.

export interface VertexHandleRenderer {
  destroy(): void;
}

export function createVertexHandleRenderer(
  handleLayer: Container,
  store: MapEditorStoreApi,
  options: {
    readonly dragSurface?: Container;
  } = {},
): VertexHandleRenderer {
  const handleContainer = new Container();
  handleContainer.eventMode = 'passive';
  handleContainer.interactiveChildren = true;
  handleContainer.sortableChildren = false;
  handleLayer.addChild(handleContainer);

  const dragSurface = options.dragSurface ?? handleLayer;

  let currentZoneId: string | null = null;
  let handles: Graphics[] = [];
  let midpointHandles: Graphics[] = [];
  let lastClickTime = 0;

  const rebuild = (): void => {
    destroyHandles();

    const state = store.getState();
    const selectedZoneId = state.selectedZoneId;
    if (selectedZoneId === null) {
      currentZoneId = null;
      return;
    }

    const vertices = state.zoneVertices.get(selectedZoneId);
    if (vertices === undefined || vertices.length < 6) {
      currentZoneId = null;
      return;
    }

    currentZoneId = selectedZoneId;
    const zonePos = state.zonePositions.get(selectedZoneId);
    if (zonePos === undefined) {
      return;
    }

    const pointCount = Math.trunc(vertices.length / 2);

    // Create vertex handles.
    for (let i = 0; i < pointCount; i++) {
      const vx = vertices[i * 2]!;
      const vy = vertices[i * 2 + 1]!;
      const handle = createDraggableHandle(vx + zonePos.x, vy + zonePos.y);
      const vertexIndex = i;

      attachDragHandlers(handle, dragSurface, zonePos, {
        onDrag(worldPos) {
          store.getState().moveVertex(currentZoneId!, vertexIndex, {
            x: worldPos.x - zonePos.x,
            y: worldPos.y - zonePos.y,
          });
          rebuild();
        },
        onDoubleClick() {
          if (pointCount > MIN_VERTEX_COUNT) {
            store.getState().removeVertex(currentZoneId!, vertexIndex);
            rebuild();
          }
        },
      });

      handleContainer.addChild(handle);
      handles.push(handle);
    }

    // Create midpoint handles (for adding vertices).
    for (let i = 0; i < pointCount; i++) {
      const nextIndex = (i + 1) % pointCount;
      const ax = vertices[i * 2]! + zonePos.x;
      const ay = vertices[i * 2 + 1]! + zonePos.y;
      const bx = vertices[nextIndex * 2]! + zonePos.x;
      const by = vertices[nextIndex * 2 + 1]! + zonePos.y;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;

      const midHandle = createMidpointHandle(mx, my);
      const afterIndex = i;

      midHandle.on('pointerdown', (event: FederatedPointerEvent) => {
        event.stopPropagation?.();
        store.getState().addVertex(currentZoneId!, afterIndex);
        rebuild();
      });

      handleContainer.addChild(midHandle);
      midpointHandles.push(midHandle);
    }
  };

  const unsubscribe = store.subscribe((state, prevState) => {
    if (
      state.selectedZoneId !== prevState.selectedZoneId ||
      state.zoneVertices !== prevState.zoneVertices ||
      state.zonePositions !== prevState.zonePositions
    ) {
      rebuild();
    }
  });

  // Initial build.
  rebuild();

  return {
    destroy(): void {
      unsubscribe();
      destroyHandles();
      handleContainer.removeFromParent();
      handleContainer.destroy();
    },
  };

  function destroyHandles(): void {
    for (const h of handles) {
      h.removeFromParent();
      h.destroy();
    }
    for (const h of midpointHandles) {
      h.removeFromParent();
      h.destroy();
    }
    handles = [];
    midpointHandles = [];
  }

  function attachDragHandlers(
    handle: Graphics,
    surface: Container,
    _zonePos: Position,
    callbacks: { onDrag: (worldPos: Position) => void; onDoubleClick: () => void },
  ): void {
    let dragging = false;

    const onDragMove = (event: FederatedPointerEvent): void => {
      if (!dragging) {
        return;
      }
      const local = event.getLocalPosition(surface);
      callbacks.onDrag({ x: local.x, y: local.y });
    };

    const onDragEnd = (): void => {
      if (!dragging) {
        return;
      }
      dragging = false;
      surface.off('globalpointermove', onDragMove);
      surface.off('pointerup', onDragEnd);
      surface.off('pointerupoutside', onDragEnd);
    };

    handle.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation?.();
      const now = Date.now();
      if (now - lastClickTime < DOUBLE_CLICK_MS) {
        callbacks.onDoubleClick();
        lastClickTime = 0;
        return;
      }
      lastClickTime = now;

      dragging = true;
      surface.on('globalpointermove', onDragMove);
      surface.on('pointerup', onDragEnd);
      surface.on('pointerupoutside', onDragEnd);
    });
  }
}

