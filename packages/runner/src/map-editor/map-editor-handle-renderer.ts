import type { GameDef } from '@ludoforge/engine/runtime';
import { Circle, Container, Graphics, Polygon } from 'pixi.js';

import { quadraticBezierMidpoint } from '../canvas/geometry/bezier-utils.js';
import { safeDestroyChildren, safeDestroyDisplayObject } from '../canvas/renderers/safe-destroy.js';
import { resolveVisualDimensions } from '../canvas/renderers/shape-utils.js';
import { STROKE_LABEL_FONT_NAME } from '../canvas/text/bitmap-font-registry.js';
import { createManagedBitmapText, destroyManagedBitmapText } from '../canvas/text/bitmap-text-runtime.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import {
  ZONE_RENDER_HEIGHT,
  ZONE_RENDER_WIDTH,
} from '../layout/layout-constants.js';
import { createMidpointHandle, DOUBLE_CLICK_MS } from './handle-graphics.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import {
  attachAnchorDragHandlers,
  attachControlPointDragHandlers,
  attachZoneEdgeAnchorDragHandlers,
} from './map-editor-drag.js';
import { resolveRouteGeometry, type ResolvedEditorRouteSegment } from './map-editor-route-geometry.js';
import { resolveMapEditorZoneVisuals } from './map-editor-zone-visuals.js';

const HANDLE_STROKE_COLOR = 0xffffff;
const HANDLE_RADIUS = 8;
const CONTROL_HANDLE_SIZE = 10;
const TANGENT_LINE_ALPHA = 0.5;
const ANGLE_LABEL_OFFSET_X = 18;
const ANGLE_LABEL_OFFSET_Y = -18;
const DEFAULT_ZONE_DIMENSIONS = {
  width: ZONE_RENDER_WIDTH,
  height: ZONE_RENDER_HEIGHT,
} as const;

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
  root.eventMode = 'passive';
  root.interactiveChildren = true;
  handleLayer.addChild(root);
  const overlayRoot = new Container();
  overlayRoot.eventMode = 'none';
  overlayRoot.interactiveChildren = false;
  handleLayer.addChild(overlayRoot);
  const angleLabel = createManagedBitmapText({
    parent: overlayRoot,
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fontSize: 12,
      fill: '#f8fafc',
      stroke: { color: '#000000', width: 3 },
    },
    anchor: { x: 0.5, y: 0.5 },
    visible: false,
    renderable: false,
  });
  let cleanupDisposers: Array<() => void> = [];
  let tangentGraphics: Graphics[] = [];
  let lastWaypointClickTime = 0;

  const releaseInteractionDisposers = (): void => {
    for (const dispose of cleanupDisposers) {
      dispose();
    }
    cleanupDisposers = [];
  };

  const render = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    releaseInteractionDisposers();
    safeDestroyChildren(root, { children: true });
    tangentGraphics = [];

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
      syncTangentGraphic(tangent, segment);
      root.addChild(tangent);
      tangentGraphics.push(tangent);
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
        const zoneCenter = state.zonePositions.get(point.endpoint.zoneId);
        const zoneVisual = zoneVisuals.get(point.endpoint.zoneId);
        if (zoneCenter === undefined || zoneVisual === undefined) {
          continue;
        }

        const zoneDimensions = resolveVisualDimensions(zoneVisual, DEFAULT_ZONE_DIMENSIONS);
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
          attachZoneEdgeAnchorDragHandlers(
            handle,
            routeId,
            pointIndex,
            dragSurface,
            store,
            zoneCenter,
            zoneVisual.shape,
            zoneDimensions,
          ),
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
        // Double-click handler must be registered before drag handler so it
        // can intercept the second click and prevent a drag start.
        const isIntermediate = pointIndex > 0 && pointIndex < geometry.points.length - 1;
        if (isIntermediate) {
          const onWaypointDoubleClick = (event: { button?: number; stopPropagation?(): void; stopImmediatePropagation?(): void }): void => {
            if (event.button !== undefined && event.button !== 0) {
              return;
            }
            const now = Date.now();
            if (now - lastWaypointClickTime < DOUBLE_CLICK_MS) {
              event.stopPropagation?.();
              event.stopImmediatePropagation?.();
              lastWaypointClickTime = 0;
              const state = store.getState();
              state.selectZone(null);
              state.selectRoute(routeId);
              state.removeWaypoint(routeId, pointIndex);
              return;
            }
            lastWaypointClickTime = now;
          };
          handle.on('pointerdown', onWaypointDoubleClick);
          cleanupDisposers.push(() => {
            handle.off('pointerdown', onWaypointDoubleClick);
          });
        }
        cleanupDisposers.push(
          attachAnchorDragHandlers(handle, routeId, point.endpoint.anchorId, dragSurface, store),
        );
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

    // Midpoint handles for inserting waypoints.
    for (let segmentIndex = 0; segmentIndex < geometry.segments.length; segmentIndex += 1) {
      const segment = geometry.segments[segmentIndex];
      if (segment === undefined) {
        continue;
      }

      const midpoint = segment.kind === 'quadratic'
        ? quadraticBezierMidpoint(segment.start, segment.controlPoint.position, segment.end)
        : { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };

      const midHandle = createMidpointHandle(midpoint.x, midpoint.y);
      const capturedSegmentIndex = segmentIndex;
      const onMidpointClick = (event: { stopPropagation?(): void }): void => {
        event.stopPropagation?.();
        store.getState().insertWaypoint(routeId, capturedSegmentIndex, midpoint);
      };
      midHandle.on('pointerdown', onMidpointClick);
      cleanupDisposers.push(() => {
        midHandle.off('pointerdown', onMidpointClick);
      });
      root.addChild(midHandle);
    }
  };

  const syncTangentsDuringDrag = (state: ReturnType<MapEditorStoreApi['getState']>): boolean => {
    const routeId = state.selectedRouteId;
    if (routeId === null) {
      return false;
    }

    const route = state.connectionRoutes.get(routeId);
    if (route === undefined) {
      return false;
    }

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, zoneVisuals);
    if (geometry === null) {
      return false;
    }

    const quadraticSegments = geometry.segments.filter((segment) => segment.kind === 'quadratic');
    if (quadraticSegments.length !== tangentGraphics.length) {
      return false;
    }

    for (let index = 0; index < quadraticSegments.length; index += 1) {
      const segment = quadraticSegments[index];
      const tangent = tangentGraphics[index];
      if (segment === undefined || tangent === undefined) {
        return false;
      }
      syncTangentGraphic(tangent, segment);
    }

    return true;
  };

  const syncAngleIndicator = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    const dragPreview = state.dragPreview;
    if (
      dragPreview?.kind !== 'zone-edge-anchor'
      || dragPreview.routeId !== state.selectedRouteId
      || dragPreview.angle === null
    ) {
      angleLabel.visible = false;
      angleLabel.renderable = false;
      return;
    }

    angleLabel.text = `${Math.round(dragPreview.angle)}deg`;
    angleLabel.position.set(
      dragPreview.handlePosition.x + ANGLE_LABEL_OFFSET_X,
      dragPreview.handlePosition.y + ANGLE_LABEL_OFFSET_Y,
    );
    angleLabel.visible = true;
    angleLabel.renderable = true;
  };

  render(store.getState());
  syncAngleIndicator(store.getState());

  const unsubscribe = store.subscribe((state, previousState) => {
    const routeSelectionChanged = state.selectedRouteId !== previousState.selectedRouteId;
    const documentChanged = state.zonePositions !== previousState.zonePositions
      || state.connectionAnchors !== previousState.connectionAnchors
      || state.connectionRoutes !== previousState.connectionRoutes;
    const dragPreviewChanged = state.dragPreview !== previousState.dragPreview;
    const dragEnded = previousState.isDragging && !state.isDragging;

    if (
      !routeSelectionChanged
      && !documentChanged
      && !dragPreviewChanged
      && !dragEnded
    ) {
      return;
    }

    if (!routeSelectionChanged && state.isDragging) {
      if (!syncTangentsDuringDrag(state)) {
        render(state);
      }
      syncAngleIndicator(state);
      return;
    }

    render(state);
    syncAngleIndicator(state);
  });

  return {
    destroy(): void {
      unsubscribe();
      releaseInteractionDisposers();
      destroyManagedBitmapText(angleLabel);
      safeDestroyDisplayObject(root, { children: true });
      safeDestroyDisplayObject(overlayRoot, { children: true });
    },
  };
}

function syncTangentGraphic(
  tangent: Graphics,
  segment: Extract<ResolvedEditorRouteSegment, { kind: 'quadratic' }>,
): void {
  tangent.clear();
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
}
