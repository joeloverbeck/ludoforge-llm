import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';

import type { MapEditorStoreApi } from './map-editor-store.js';
import type { Position } from './map-editor-types.js';

const VERTEX_HANDLE_RADIUS = 7;
const VERTEX_HANDLE_HOVER_RADIUS = 10;
const VERTEX_GLOW_RADIUS = 14;
const VERTEX_GLOW_ALPHA = 0.3;
const MIDPOINT_HANDLE_RADIUS = 5;
const VERTEX_HANDLE_COLOR = 0xf59e0b; // amber
const MIDPOINT_HANDLE_COLOR = 0x60a5fa; // blue
const MIDPOINT_HANDLE_ALPHA = 0.5;
const MIN_VERTEX_COUNT = 3; // Cannot remove below 3 vertices.
const DOUBLE_CLICK_MS = 300;

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
      const handle = createVertexHandle(vx + zonePos.x, vy + zonePos.y);
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

function drawVertexHandleState(g: Graphics, hovered: boolean): void {
  g.clear();
  if (hovered) {
    g.circle(0, 0, VERTEX_GLOW_RADIUS)
      .fill({ color: VERTEX_HANDLE_COLOR, alpha: VERTEX_GLOW_ALPHA });
    g.circle(0, 0, VERTEX_HANDLE_HOVER_RADIUS)
      .fill({ color: VERTEX_HANDLE_COLOR })
      .stroke({ color: 0x000000, width: 1.5 });
  } else {
    g.circle(0, 0, VERTEX_HANDLE_RADIUS)
      .fill({ color: VERTEX_HANDLE_COLOR })
      .stroke({ color: 0x000000, width: 1.5 });
  }
}

function createVertexHandle(x: number, y: number): Graphics {
  const g = new Graphics();
  drawVertexHandleState(g, false);
  g.position.set(x, y);
  g.eventMode = 'static';
  g.cursor = 'grab';
  g.on('pointerover', () => drawVertexHandleState(g, true));
  g.on('pointerout', () => drawVertexHandleState(g, false));
  return g;
}

function createMidpointHandle(x: number, y: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, MIDPOINT_HANDLE_RADIUS)
    .fill({ color: MIDPOINT_HANDLE_COLOR, alpha: MIDPOINT_HANDLE_ALPHA })
    .stroke({ color: 0x000000, width: 1, alpha: 0.3 });
  g.position.set(x, y);
  g.eventMode = 'static';
  g.cursor = 'pointer';
  return g;
}
