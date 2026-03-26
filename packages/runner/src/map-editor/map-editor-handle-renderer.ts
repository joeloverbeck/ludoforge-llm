import type { GameDef } from '@ludoforge/engine/runtime';
import { Circle, Container, Graphics, Polygon } from 'pixi.js';

import { safeDestroyChildren, safeDestroyDisplayObject } from '../canvas/renderers/safe-destroy.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import {
  attachAnchorDragHandlers,
  attachControlPointDragHandlers,
  attachZoneEndpointConvertDragHandlers,
} from './map-editor-drag.js';
import { resolveRouteGeometry } from './map-editor-route-geometry.js';
import { resolveMapEditorZoneVisuals } from './map-editor-zone-visuals.js';

const HANDLE_STROKE_COLOR = 0xffffff;
const HANDLE_RADIUS = 8;
const CONTROL_HANDLE_SIZE = 10;
const TANGENT_LINE_ALPHA = 0.5;

export interface EditorHandleRenderer {
  destroy(): void;
}

export function createEditorHandleRenderer(
  handleLayer: Container,
  store: MapEditorStoreApi,
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
  options: {
    readonly dragSurface?: Container;
  } = {},
): EditorHandleRenderer {
  const dragSurface = options.dragSurface ?? handleLayer;
  const zoneVisuals = resolveMapEditorZoneVisuals(gameDef, visualConfigProvider);
  const root = new Container();
  root.eventMode = 'none';
  root.interactiveChildren = true;
  handleLayer.addChild(root);
  let cleanupDisposers: Array<() => void> = [];

  const releaseInteractionDisposers = (): void => {
    for (const dispose of cleanupDisposers) {
      dispose();
    }
    cleanupDisposers = [];
  };

  const render = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    releaseInteractionDisposers();
    safeDestroyChildren(root, { children: true });

    const routeId = state.selectedRouteId;
    if (routeId === null) {
      return;
    }

    const route = state.connectionRoutes.get(routeId);
    if (route === undefined) {
      return;
    }

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, zoneVisuals);
    if (geometry === null) {
      return;
    }

    for (const segment of geometry.segments) {
      if (segment.kind !== 'quadratic') {
        continue;
      }

      const tangent = new Graphics();
      tangent
        .moveTo(segment.start.x, segment.start.y)
        .lineTo(segment.controlPoint.position.x, segment.controlPoint.position.y)
        .moveTo(segment.end.x, segment.end.y)
        .lineTo(segment.controlPoint.position.x, segment.controlPoint.position.y)
        .stroke({
          color: HANDLE_STROKE_COLOR,
          width: 1,
          alpha: TANGENT_LINE_ALPHA,
        });
      root.addChild(tangent);
    }

    for (let pointIndex = 0; pointIndex < geometry.points.length; pointIndex += 1) {
      const point = geometry.points[pointIndex];
      if (point === undefined) {
        continue;
      }

      const handle = new Graphics();
      handle.position.set(point.position.x, point.position.y);
      handle.interactiveChildren = false;

      if (point.endpoint.kind === 'zone') {
        handle.eventMode = 'static';
        handle.cursor = 'grab';
        handle.hitArea = new Circle(0, 0, HANDLE_RADIUS);
        handle
          .circle(0, 0, HANDLE_RADIUS)
          .fill({
            color: HANDLE_STROKE_COLOR,
            alpha: 1,
          });
        cleanupDisposers.push(
          attachZoneEndpointConvertDragHandlers(handle, routeId, pointIndex, dragSurface, store),
        );
      } else {
        handle.eventMode = 'static';
        handle.cursor = 'grab';
        handle.hitArea = new Circle(0, 0, HANDLE_RADIUS);
        handle
          .circle(0, 0, HANDLE_RADIUS)
          .fill({
            color: HANDLE_STROKE_COLOR,
            alpha: 1,
          });
        cleanupDisposers.push(
          attachAnchorDragHandlers(handle, routeId, point.endpoint.anchorId, dragSurface, store),
        );
        const removeWaypointOnRightClick = (event: { button?: number; stopPropagation(): void }): void => {
          if (event.button !== 2) {
            return;
          }

          event.stopPropagation();
          if (pointIndex <= 0 || pointIndex >= geometry.points.length - 1) {
            return;
          }

          const state = store.getState();
          state.selectZone(null);
          state.selectRoute(routeId);
          state.removeWaypoint(routeId, pointIndex);
        };
        handle.on('pointerdown', removeWaypointOnRightClick);
        cleanupDisposers.push(() => {
          handle.off('pointerdown', removeWaypointOnRightClick);
        });
      }

      root.addChild(handle);
    }

    for (let segmentIndex = 0; segmentIndex < geometry.segments.length; segmentIndex += 1) {
      const segment = geometry.segments[segmentIndex];
      if (segment === undefined || segment.kind !== 'quadratic') {
        continue;
      }

      const control = new Graphics();
      const { x, y } = segment.controlPoint.position;
      control.position.set(x, y);
      control.eventMode = 'static';
      control.cursor = 'grab';
      control.interactiveChildren = false;
      control.hitArea = new Polygon([
        0,
        -CONTROL_HANDLE_SIZE,
        CONTROL_HANDLE_SIZE,
        0,
        0,
        CONTROL_HANDLE_SIZE,
        -CONTROL_HANDLE_SIZE,
        0,
      ]);
      control
        .poly([
          0,
          -CONTROL_HANDLE_SIZE,
          CONTROL_HANDLE_SIZE,
          0,
          0,
          CONTROL_HANDLE_SIZE,
          -CONTROL_HANDLE_SIZE,
          0,
        ])
        .fill({
          color: HANDLE_STROKE_COLOR,
          alpha: 1,
        });
      cleanupDisposers.push(
        attachControlPointDragHandlers(control, routeId, segmentIndex, dragSurface, store),
      );
      root.addChild(control);
    }
  };

  render(store.getState());

  const unsubscribe = store.subscribe((state, previousState) => {
    const routeSelectionChanged = state.selectedRouteId !== previousState.selectedRouteId;
    const documentChanged = state.zonePositions !== previousState.zonePositions
      || state.connectionAnchors !== previousState.connectionAnchors
      || state.connectionRoutes !== previousState.connectionRoutes;
    const dragEnded = previousState.isDragging && !state.isDragging;

    if (
      !routeSelectionChanged
      && !documentChanged
      && !dragEnded
    ) {
      return;
    }

    if (!routeSelectionChanged && state.isDragging) {
      return;
    }

    render(state);
  });

  return {
    destroy(): void {
      unsubscribe();
      releaseInteractionDisposers();
      safeDestroyDisplayObject(root, { children: true });
    },
  };
}
