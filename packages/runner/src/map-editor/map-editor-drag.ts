import type { Container, FederatedPointerEvent } from 'pixi.js';

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
