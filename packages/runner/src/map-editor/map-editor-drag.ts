import type { Container, FederatedPointerEvent } from 'pixi.js';

import type { ZoneShape } from '../config/visual-config-defaults.js';
import { getEdgePointAtAngle, type ShapeDimensions } from '../canvas/renderers/shape-utils.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import type { Position } from './map-editor-types.js';

type PointerEventLike = Pick<FederatedPointerEvent, 'getLocalPosition'> & {
  button?: number;
  stopPropagation?(): void;
};

interface ActiveDrag {
  readonly offset: Position;
}

export function snapToGrid(position: Position, gridSize: number): Position {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

export function attachZoneDragHandlers(
  zoneContainer: Container,
  zoneId: string,
  dragSurface: Container,
  store: MapEditorStoreApi,
): () => void {
  return attachPositionDragHandlers(zoneContainer, dragSurface, store, {
    selectTarget(state) {
      state.selectZone(zoneId);
      state.selectRoute(null);
    },
    previewMove(state, position) {
      state.previewZoneMove(zoneId, position);
    },
  });
}

export function attachAnchorDragHandlers(
  handle: Container,
  routeId: string,
  anchorId: string,
  dragSurface: Container,
  store: MapEditorStoreApi,
): () => void {
  return attachPositionDragHandlers(handle, dragSurface, store, {
    selectTarget(state) {
      state.selectZone(null);
      state.selectRoute(routeId);
    },
    previewMove(state, position) {
      state.previewAnchorMove(anchorId, position);
    },
  });
}

export function attachZoneEdgeAnchorDragHandlers(
  handle: Container,
  routeId: string,
  pointIndex: number,
  dragSurface: Container,
  store: MapEditorStoreApi,
  zoneCenter: Position,
  zoneShape: ZoneShape | undefined,
  zoneDimensions: ShapeDimensions,
): () => void {
  let activeDrag: ActiveDrag | null = null;
  let anchorId: string | null = null;
  let detached = false;

  const onPointerDown = (event: PointerEventLike): void => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.stopPropagation?.();

    const pointerPosition = getPointerPosition(event, handle.parent ?? dragSurface);
    activeDrag = {
      offset: {
        x: pointerPosition.x - handle.position.x,
        y: pointerPosition.y - handle.position.y,
      },
    };

    handle.cursor = 'grabbing';
    const state = store.getState();
    state.selectZone(null);
    state.selectRoute(routeId);
    state.beginInteraction();
    state.setDragging(true);

    dragSurface.on('globalpointermove', onPointerMove);
    dragSurface.on('pointerup', finishDrag);
    dragSurface.on('pointerupoutside', finishDrag);
  };

  const onPointerMove = (event: PointerEventLike): void => {
    if (activeDrag === null) {
      return;
    }

    const pointerPosition = getPointerPosition(event, handle.parent ?? dragSurface);
    const unsnappedPosition = {
      x: pointerPosition.x - activeDrag.offset.x,
      y: pointerPosition.y - activeDrag.offset.y,
    };
    const state = store.getState();
    const nextPosition = state.snapToGrid
      ? snapToGrid(unsnappedPosition, state.gridSize)
      : unsnappedPosition;

    if (detached) {
      handle.position.set(nextPosition.x, nextPosition.y);
      if (anchorId !== null) {
        state.previewAnchorMove(anchorId, nextPosition);
      }
      return;
    }

    const angle = normalizeAngleDegrees(
      Math.atan2(-(nextPosition.y - zoneCenter.y), nextPosition.x - zoneCenter.x) * (180 / Math.PI),
    );
    const edgeOffset = getEdgePointAtAngle(zoneShape, zoneDimensions, angle);
    const snappedEdgePosition = {
      x: zoneCenter.x + edgeOffset.x,
      y: zoneCenter.y + edgeOffset.y,
    };
    handle.position.set(snappedEdgePosition.x, snappedEdgePosition.y);

    const detachThreshold = 2 * Math.max(zoneDimensions.width, zoneDimensions.height);
    const distanceFromCenter = Math.hypot(nextPosition.x - zoneCenter.x, nextPosition.y - zoneCenter.y);
    if (distanceFromCenter > detachThreshold) {
      anchorId = state.detachEndpointToAnchor(routeId, pointIndex, snappedEdgePosition);
      if (anchorId === null) {
        return;
      }
      detached = true;
      return;
    }

    state.previewEndpointAnchor(routeId, pointIndex, angle);
  };

  const finishDrag = (): void => {
    if (activeDrag === null) {
      return;
    }

    activeDrag = null;
    anchorId = null;
    detached = false;
    handle.cursor = 'grab';
    dragSurface.off('globalpointermove', onPointerMove);
    dragSurface.off('pointerup', finishDrag);
    dragSurface.off('pointerupoutside', finishDrag);
    const state = store.getState();
    state.commitInteraction();
    state.setDragging(false);
  };

  handle.on('pointerdown', onPointerDown);

  return (): void => {
    handle.off('pointerdown', onPointerDown);
    dragSurface.off('globalpointermove', onPointerMove);
    dragSurface.off('pointerup', finishDrag);
    dragSurface.off('pointerupoutside', finishDrag);

    if (activeDrag !== null) {
      activeDrag = null;
      anchorId = null;
      detached = false;
      const state = store.getState();
      state.cancelInteraction();
      state.setDragging(false);
    }

    handle.cursor = 'default';
  };
}

function normalizeAngleDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function attachControlPointDragHandlers(
  handle: Container,
  routeId: string,
  segmentIndex: number,
  dragSurface: Container,
  store: MapEditorStoreApi,
): () => void {
  return attachPositionDragHandlers(handle, dragSurface, store, {
    selectTarget(state) {
      state.selectZone(null);
      state.selectRoute(routeId);
    },
    previewMove(state, position) {
      state.previewControlPointMove(routeId, segmentIndex, position);
    },
  });
}

interface DragCallbacks {
  readonly selectTarget: (state: ReturnType<MapEditorStoreApi['getState']>) => void;
  readonly previewMove: (
    state: ReturnType<MapEditorStoreApi['getState']>,
    position: Position,
  ) => void;
}

function attachPositionDragHandlers(
  target: Container,
  dragSurface: Container,
  store: MapEditorStoreApi,
  callbacks: DragCallbacks,
): () => void {
  let activeDrag: ActiveDrag | null = null;

  const onPointerDown = (event: PointerEventLike): void => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.stopPropagation?.();

    const pointerPosition = getPointerPosition(event, target.parent ?? dragSurface);
    activeDrag = {
      offset: {
        x: pointerPosition.x - target.position.x,
        y: pointerPosition.y - target.position.y,
      },
    };

    target.cursor = 'grabbing';
    const state = store.getState();
    callbacks.selectTarget(state);
    state.beginInteraction();
    state.setDragging(true);

    dragSurface.on('globalpointermove', onPointerMove);
    dragSurface.on('pointerup', finishDrag);
    dragSurface.on('pointerupoutside', finishDrag);
  };

  const onPointerMove = (event: PointerEventLike): void => {
    if (activeDrag === null) {
      return;
    }

    const pointerPosition = getPointerPosition(event, target.parent ?? dragSurface);
    const unsnappedPosition = {
      x: pointerPosition.x - activeDrag.offset.x,
      y: pointerPosition.y - activeDrag.offset.y,
    };
    const state = store.getState();
    const nextPosition = state.snapToGrid
      ? snapToGrid(unsnappedPosition, state.gridSize)
      : unsnappedPosition;
    target.position.set(nextPosition.x, nextPosition.y);
    callbacks.previewMove(state, nextPosition);
  };

  const finishDrag = (): void => {
    if (activeDrag === null) {
      return;
    }

    activeDrag = null;
    target.cursor = 'grab';
    dragSurface.off('globalpointermove', onPointerMove);
    dragSurface.off('pointerup', finishDrag);
    dragSurface.off('pointerupoutside', finishDrag);
    const state = store.getState();
    state.commitInteraction();
    state.setDragging(false);
  };

  target.on('pointerdown', onPointerDown);

  return (): void => {
    target.off('pointerdown', onPointerDown);
    dragSurface.off('globalpointermove', onPointerMove);
    dragSurface.off('pointerup', finishDrag);
    dragSurface.off('pointerupoutside', finishDrag);

    if (activeDrag !== null) {
      activeDrag = null;
      const state = store.getState();
      state.cancelInteraction();
      state.setDragging(false);
    }

    target.cursor = 'default';
  };
}

function getPointerPosition(
  event: PointerEventLike,
  referenceContainer: Container,
): Position {
  const localPosition = event.getLocalPosition(referenceContainer);
  return {
    x: localPosition.x,
    y: localPosition.y,
  };
}
