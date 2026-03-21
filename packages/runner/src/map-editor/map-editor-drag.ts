import type { Container, FederatedPointerEvent } from 'pixi.js';

import type { MapEditorStoreApi } from './map-editor-store.js';
import type { Position } from './map-editor-types.js';

type PointerEventLike = Pick<FederatedPointerEvent, 'getLocalPosition'> & {
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
  let activeDrag: ActiveDrag | null = null;

  const onPointerDown = (event: PointerEventLike): void => {
    event.stopPropagation?.();

    const pointerPosition = getPointerPosition(event, zoneContainer.parent ?? dragSurface);
    activeDrag = {
      offset: {
        x: pointerPosition.x - zoneContainer.position.x,
        y: pointerPosition.y - zoneContainer.position.y,
      },
    };

    zoneContainer.cursor = 'grabbing';
    const state = store.getState();
    state.selectZone(zoneId);
    state.selectRoute(null);
    state.beginInteraction();
    state.setDragging(true);
  };

  const onPointerMove = (event: PointerEventLike): void => {
    if (activeDrag === null) {
      return;
    }

    const pointerPosition = getPointerPosition(event, zoneContainer.parent ?? dragSurface);
    const unsnappedPosition = {
      x: pointerPosition.x - activeDrag.offset.x,
      y: pointerPosition.y - activeDrag.offset.y,
    };
    const state = store.getState();
    const nextPosition = state.snapToGrid
      ? snapToGrid(unsnappedPosition, state.gridSize)
      : unsnappedPosition;
    state.previewZoneMove(zoneId, nextPosition);
  };

  const finishDrag = (): void => {
    if (activeDrag === null) {
      return;
    }

    activeDrag = null;
    zoneContainer.cursor = 'grab';
    const state = store.getState();
    state.commitInteraction();
    state.setDragging(false);
  };

  zoneContainer.on('pointerdown', onPointerDown);
  dragSurface.on('globalpointermove', onPointerMove);
  dragSurface.on('pointerup', finishDrag);
  dragSurface.on('pointerupoutside', finishDrag);

  return (): void => {
    zoneContainer.off('pointerdown', onPointerDown);
    dragSurface.off('globalpointermove', onPointerMove);
    dragSurface.off('pointerup', finishDrag);
    dragSurface.off('pointerupoutside', finishDrag);

    if (activeDrag !== null) {
      activeDrag = null;
      const state = store.getState();
      state.cancelInteraction();
      state.setDragging(false);
    }

    zoneContainer.cursor = 'default';
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
