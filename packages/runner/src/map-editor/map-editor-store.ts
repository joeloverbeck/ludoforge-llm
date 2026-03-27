import type { GameDef } from '@ludoforge/engine/runtime';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { deriveCurvatureControl } from '../canvas/geometry/bezier-utils.js';
import {
  cloneConnectionRouteDefinition,
  cloneConnectionRouteSegment,
  connectionRouteControlsEqual,
  connectionRouteSegmentsEqual,
} from '../config/connection-route-utils.js';
import { VisualConfigProvider } from '../config/visual-config-provider.js';
import type {
  ConnectionEndpoint,
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
  EditorDragPreview,
  EditorSnapshot,
  MapEditorDocumentState,
  Position,
  VisualConfig,
} from './map-editor-types.js';
import {
  resolveEndpointPosition as resolveRouteEndpointPosition,
  type EditorRouteZoneVisual,
} from './map-editor-route-geometry.js';
import { resolveMapEditorZoneVisuals } from './map-editor-zone-visuals.js';

const DEFAULT_GRID_SIZE = 20;
const UNDO_STACK_LIMIT = 50;

interface MapEditorStoreState extends MapEditorDocumentState {
  readonly gameDef: GameDef;
  readonly originalVisualConfig: VisualConfig;
  readonly savedSnapshot: EditorSnapshot;
  readonly selectedZoneId: string | null;
  readonly selectedRouteId: string | null;
  readonly isDragging: boolean;
  readonly dragPreview: EditorDragPreview;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly gridSize: number;
  readonly undoStack: readonly EditorSnapshot[];
  readonly redoStack: readonly EditorSnapshot[];
  readonly dirty: boolean;
}

interface MapEditorStoreActions {
  moveZone(zoneId: string, position: Position): void;
  moveAnchor(anchorId: string, position: Position): void;
  moveControlPoint(routeId: string, segmentIndex: number, position: Position): void;
  setEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
  previewEndpointAnchor(routeId: string, pointIndex: number, anchor: number): void;
  detachEndpointToAnchor(routeId: string, pointIndex: number, position: Position): string | null;
  insertWaypoint(routeId: string, segmentIndex: number, position: Position): void;
  removeWaypoint(routeId: string, pointIndex: number): void;
  convertSegment(routeId: string, segmentIndex: number, kind: 'straight' | 'quadratic'): void;
  selectZone(zoneId: string | null): void;
  selectRoute(routeId: string | null): void;
  setDragging(value: boolean): void;
  setDragPreview(preview: EditorDragPreview): void;
  clearDragPreview(): void;
  toggleGrid(): void;
  setGridSize(value: number): void;
  setSnapToGrid(value: boolean): void;
  beginInteraction(): void;
  previewZoneMove(zoneId: string, position: Position): void;
  previewAnchorMove(anchorId: string, position: Position): void;
  previewControlPointMove(routeId: string, segmentIndex: number, position: Position): void;
  commitInteraction(): void;
  cancelInteraction(): void;
  markSaved(): void;
  undo(): void;
  redo(): void;
}

export type MapEditorStore = MapEditorStoreState & MapEditorStoreActions;
export type MapEditorStoreApi = UseBoundStore<StoreApi<MapEditorStore>>;

export function createMapEditorStore(
  gameDef: GameDef,
  visualConfig: VisualConfig,
  initialPositions: ReadonlyMap<string, Position>,
): MapEditorStoreApi {
  return create<MapEditorStore>()((set, get) => {
    let interactionSnapshot: EditorSnapshot | null = null;
    let interactionChanged = false;
    const zoneVisuals = resolveMapEditorZoneVisuals(gameDef, new VisualConfigProvider(visualConfig));
    const initialDocumentState: EditorSnapshot = {
      zonePositions: clonePositionMap(initialPositions),
      connectionAnchors: cloneAnchorMap(visualConfig),
      connectionRoutes: cloneRouteMap(visualConfig),
    };

    const ensureInteraction = (): void => {
      if (interactionSnapshot !== null) {
        return;
      }
      interactionSnapshot = snapshotFromState(get());
      interactionChanged = false;
    };

    const clearInteraction = (): void => {
      interactionSnapshot = null;
      interactionChanged = false;
    };

    const applyCommittedEdit = (
      recipe: (state: MapEditorStoreState) => MapEditorDocumentState | null,
    ): void => {
      clearInteraction();
      set((state) => {
        const nextDocument = recipe(state);
        if (nextDocument === null) {
          return {};
        }

        return {
          ...nextDocument,
          dirty: !documentMatchesSnapshot(nextDocument, state.savedSnapshot),
          undoStack: pushUndoSnapshot(state.undoStack, snapshotFromState(state)),
          redoStack: [],
        };
      });
    };

    const applyPreviewEdit = (
      recipe: (state: MapEditorStoreState) => MapEditorDocumentState | null,
    ): void => {
      ensureInteraction();
      set((state) => {
        const nextDocument = recipe(state);
        if (nextDocument === null) {
          return {};
        }
        interactionChanged = true;
        return {
          ...nextDocument,
          dirty: !documentMatchesSnapshot(nextDocument, state.savedSnapshot),
        };
      });
    };

    return {
      gameDef,
      originalVisualConfig: cloneVisualConfig(visualConfig),
      savedSnapshot: cloneSnapshot(initialDocumentState),
      ...cloneSnapshot(initialDocumentState),
      selectedZoneId: null,
      selectedRouteId: null,
      isDragging: false,
      dragPreview: null,
      showGrid: false,
      snapToGrid: false,
      gridSize: DEFAULT_GRID_SIZE,
      undoStack: [],
      redoStack: [],
      dirty: false,

      moveZone(zoneId, position) {
        applyCommittedEdit((state) => moveZoneInDocument(state, zoneId, position));
      },

      moveAnchor(anchorId, position) {
        applyCommittedEdit((state) => moveAnchorInDocument(state, anchorId, position));
      },

      moveControlPoint(routeId, segmentIndex, position) {
        applyCommittedEdit((state) => moveControlPointInDocument(state, zoneVisuals, routeId, segmentIndex, position));
      },

      setEndpointAnchor(routeId, pointIndex, anchor) {
        applyCommittedEdit((state) => setEndpointAnchorInDocument(state, routeId, pointIndex, anchor));
      },

      previewEndpointAnchor(routeId, pointIndex, anchor) {
        applyPreviewEdit((state) => setEndpointAnchorInDocument(state, routeId, pointIndex, anchor));
      },

      detachEndpointToAnchor(routeId, pointIndex, position) {
        let anchorId: string | null = null;
        applyPreviewEdit((state) => {
          const converted = detachEndpointToAnchorInDocument(state, routeId, pointIndex, position);
          if (converted === null) {
            return null;
          }

          anchorId = converted.anchorId;
          return converted.document;
        });
        return anchorId;
      },

      insertWaypoint(routeId, segmentIndex, position) {
        applyCommittedEdit((state) => insertWaypointInDocument(state, routeId, segmentIndex, position));
      },

      removeWaypoint(routeId, pointIndex) {
        applyCommittedEdit((state) => removeWaypointInDocument(state, routeId, pointIndex));
      },

      convertSegment(routeId, segmentIndex, kind) {
        applyCommittedEdit((state) => convertSegmentInDocument(state, zoneVisuals, routeId, segmentIndex, kind));
      },

      selectZone(zoneId) {
        set({ selectedZoneId: zoneId });
      },

      selectRoute(routeId) {
        set({ selectedRouteId: routeId });
      },

      setDragging(value) {
        set({ isDragging: value });
      },

      setDragPreview(preview) {
        set({ dragPreview: preview });
      },

      clearDragPreview() {
        set({ dragPreview: null });
      },

      toggleGrid() {
        set((state) => ({ showGrid: !state.showGrid }));
      },

      setGridSize(value) {
        if (!Number.isFinite(value) || value <= 0) {
          return;
        }
        set({ gridSize: Math.round(value) });
      },

      setSnapToGrid(value) {
        set({ snapToGrid: value });
      },

      beginInteraction() {
        ensureInteraction();
      },

      previewZoneMove(zoneId, position) {
        applyPreviewEdit((state) => moveZoneInDocument(state, zoneId, position));
      },

      previewAnchorMove(anchorId, position) {
        applyPreviewEdit((state) => moveAnchorInDocument(state, anchorId, position));
      },

      previewControlPointMove(routeId, segmentIndex, position) {
        applyPreviewEdit((state) => moveControlPointInDocument(state, zoneVisuals, routeId, segmentIndex, position));
      },

      commitInteraction() {
        if (interactionSnapshot === null) {
          return;
        }
        if (!interactionChanged) {
          clearInteraction();
          return;
        }

        const snapshot = cloneSnapshot(interactionSnapshot);
        clearInteraction();
        set((state) => ({
          undoStack: pushUndoSnapshot(state.undoStack, snapshot),
          redoStack: [],
          dirty: true,
        }));
      },

      cancelInteraction() {
        if (interactionSnapshot === null) {
          return;
        }

        const snapshot = cloneSnapshot(interactionSnapshot);
        clearInteraction();
        set((state) => ({
          ...snapshot,
          dirty: !snapshotsEqual(snapshot, state.savedSnapshot),
        }));
      },

      markSaved() {
        clearInteraction();
        set((state) => {
          const savedSnapshot = snapshotFromState(state);
          return {
            savedSnapshot,
            dirty: false,
          };
        });
      },

      undo() {
        clearInteraction();
        set((state) => {
          const previous = state.undoStack[state.undoStack.length - 1];
          if (previous === undefined) {
            return {};
          }

          return {
            ...cloneSnapshot(previous),
            dirty: !snapshotsEqual(previous, state.savedSnapshot),
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, snapshotFromState(state)],
          };
        });
      },

      redo() {
        clearInteraction();
        set((state) => {
          const next = state.redoStack[state.redoStack.length - 1];
          if (next === undefined) {
            return {};
          }

          return {
            ...cloneSnapshot(next),
            dirty: !snapshotsEqual(next, state.savedSnapshot),
            undoStack: pushUndoSnapshot(state.undoStack, snapshotFromState(state)),
            redoStack: state.redoStack.slice(0, -1),
          };
        });
      },
    };
  });
}

function snapshotFromState(state: MapEditorDocumentState): EditorSnapshot {
  return {
    zonePositions: clonePositionMap(state.zonePositions),
    connectionAnchors: clonePositionMap(state.connectionAnchors),
    connectionRoutes: cloneRouteDefinitions(state.connectionRoutes),
  };
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    zonePositions: clonePositionMap(snapshot.zonePositions),
    connectionAnchors: clonePositionMap(snapshot.connectionAnchors),
    connectionRoutes: cloneRouteDefinitions(snapshot.connectionRoutes),
  };
}

function documentMatchesSnapshot(
  documentState: MapEditorDocumentState,
  savedSnapshot: EditorSnapshot,
): boolean {
  return snapshotsEqual(snapshotFromState(documentState), savedSnapshot);
}

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return positionMapsEqual(left.zonePositions, right.zonePositions)
    && positionMapsEqual(left.connectionAnchors, right.connectionAnchors)
    && routeMapsEqual(left.connectionRoutes, right.connectionRoutes);
}

function cloneVisualConfig(visualConfig: VisualConfig): VisualConfig {
  return {
    ...visualConfig,
    layout: visualConfig.layout === undefined
      ? undefined
      : {
          ...visualConfig.layout,
          hints: visualConfig.layout.hints === undefined
            ? undefined
            : {
                ...visualConfig.layout.hints,
                regions: visualConfig.layout.hints.regions?.map((region) => ({
                  ...region,
                  zones: [...region.zones],
                })),
                fixed: visualConfig.layout.hints.fixed?.map((entry) => ({ ...entry })),
              },
        },
    zones: visualConfig.zones === undefined
      ? undefined
      : {
          ...visualConfig.zones,
          connectionAnchors: visualConfig.zones.connectionAnchors === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(visualConfig.zones.connectionAnchors).map(([anchorId, anchor]) => [
                  anchorId,
                  { ...anchor },
                ]),
              ),
          connectionRoutes: visualConfig.zones.connectionRoutes === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(visualConfig.zones.connectionRoutes).map(([routeId, route]) => [
                  routeId,
                  cloneRouteDefinition(route),
                ]),
              ),
        },
  };
}

function cloneAnchorMap(visualConfig: VisualConfig): ReadonlyMap<string, Position> {
  return new Map(
    Object.entries(visualConfig.zones?.connectionAnchors ?? {}).map(([anchorId, anchor]) => [
      anchorId,
      { x: anchor.x, y: anchor.y },
    ]),
  );
}

function cloneRouteMap(visualConfig: VisualConfig): ReadonlyMap<string, ConnectionRouteDefinition> {
  return new Map(
    Object.entries(visualConfig.zones?.connectionRoutes ?? {}).map(([routeId, route]) => [
      routeId,
      cloneConnectionRouteDefinition(route),
    ]),
  );
}

function clonePositionMap(positions: ReadonlyMap<string, Position>): ReadonlyMap<string, Position> {
  return new Map(
    [...positions.entries()].map(([id, position]) => [id, { x: position.x, y: position.y }]),
  );
}

function cloneRouteDefinitions(
  routes: ReadonlyMap<string, ConnectionRouteDefinition>,
): ReadonlyMap<string, ConnectionRouteDefinition> {
  return new Map(
    [...routes.entries()].map(([routeId, route]) => [routeId, cloneConnectionRouteDefinition(route)]),
  );
}

function cloneRouteDefinition(route: ConnectionRouteDefinition): ConnectionRouteDefinition {
  return cloneConnectionRouteDefinition(route);
}

function pushUndoSnapshot(
  undoStack: readonly EditorSnapshot[],
  snapshot: EditorSnapshot,
): readonly EditorSnapshot[] {
  return [...undoStack, cloneSnapshot(snapshot)].slice(-UNDO_STACK_LIMIT);
}

function positionMapsEqual(
  left: ReadonlyMap<string, Position>,
  right: ReadonlyMap<string, Position>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [id, position] of left.entries()) {
    const other = right.get(id);
    if (other === undefined || !positionsEqual(position, other)) {
      return false;
    }
  }

  return true;
}

function routeMapsEqual(
  left: ReadonlyMap<string, ConnectionRouteDefinition>,
  right: ReadonlyMap<string, ConnectionRouteDefinition>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [routeId, route] of left.entries()) {
    const other = right.get(routeId);
    if (other === undefined || !routeDefinitionsEqual(route, other)) {
      return false;
    }
  }

  return true;
}

function routeDefinitionsEqual(left: ConnectionRouteDefinition, right: ConnectionRouteDefinition): boolean {
  if (left.points.length !== right.points.length || left.segments.length !== right.segments.length) {
    return false;
  }

  for (let index = 0; index < left.points.length; index += 1) {
    const leftPoint = left.points[index];
    const rightPoint = right.points[index];
    if (leftPoint === undefined || rightPoint === undefined || !endpointsEqual(leftPoint, rightPoint)) {
      return false;
    }
  }

  for (let index = 0; index < left.segments.length; index += 1) {
    const leftSegment = left.segments[index];
    const rightSegment = right.segments[index];
    if (leftSegment === undefined || rightSegment === undefined || !segmentsEqual(leftSegment, rightSegment)) {
      return false;
    }
  }

  return true;
}

function endpointsEqual(left: ConnectionEndpoint, right: ConnectionEndpoint): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'zone' && right.kind === 'zone') {
    return left.zoneId === right.zoneId && left.anchor === right.anchor;
  }

  if (left.kind === 'anchor' && right.kind === 'anchor') {
    return left.anchorId === right.anchorId;
  }

  return false;
}

function segmentsEqual(left: ConnectionRouteSegment, right: ConnectionRouteSegment): boolean {
  return connectionRouteSegmentsEqual(left, right);
}

function moveZoneInDocument(
  state: MapEditorDocumentState,
  zoneId: string,
  position: Position,
): MapEditorDocumentState | null {
  const current = state.zonePositions.get(zoneId);
  if (current === undefined || positionsEqual(current, position)) {
    return null;
  }

  const zonePositions = new Map(state.zonePositions);
  zonePositions.set(zoneId, { x: position.x, y: position.y });
  return {
    zonePositions,
    connectionAnchors: state.connectionAnchors,
    connectionRoutes: state.connectionRoutes,
  };
}

function moveAnchorInDocument(
  state: MapEditorDocumentState,
  anchorId: string,
  position: Position,
): MapEditorDocumentState | null {
  const current = state.connectionAnchors.get(anchorId);
  if (current === undefined || positionsEqual(current, position)) {
    return null;
  }

  const connectionAnchors = new Map(state.connectionAnchors);
  connectionAnchors.set(anchorId, { x: position.x, y: position.y });
  return {
    zonePositions: state.zonePositions,
    connectionAnchors,
    connectionRoutes: state.connectionRoutes,
  };
}

function moveControlPointInDocument(
  state: MapEditorDocumentState,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
  routeId: string,
  segmentIndex: number,
  position: Position,
): MapEditorDocumentState | null {
  const route = state.connectionRoutes.get(routeId);
  const segment = route?.segments[segmentIndex];
  if (route === undefined || segment === undefined || segment.kind !== 'quadratic') {
    return null;
  }

  if (segment.control.kind === 'anchor') {
    return moveAnchorInDocument(state, segment.control.anchorId, position);
  }

  const nextControl = resolveMovedControlPoint(segment.control, route, segmentIndex, state, zoneVisuals, position);
  if (nextControl === null || connectionRouteControlsEqual(segment.control, nextControl)) {
    return null;
  }

  const connectionRoutes = new Map(state.connectionRoutes);
  const nextSegments = route.segments.map((entry, index) => (
    index !== segmentIndex || entry.kind !== 'quadratic'
      ? entry
      : {
          kind: 'quadratic' as const,
          control: nextControl,
        }
  ));
  connectionRoutes.set(routeId, {
    points: route.points.map(cloneEndpoint),
    segments: nextSegments,
  });

  return {
    zonePositions: state.zonePositions,
    connectionAnchors: state.connectionAnchors,
    connectionRoutes,
  };
}

function resolveMovedControlPoint(
  control: ConnectionRouteControl,
  route: ConnectionRouteDefinition,
  segmentIndex: number,
  state: MapEditorDocumentState,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
  position: Position,
): ConnectionRouteControl | null {
  if (control.kind === 'position') {
    return { kind: 'position', x: position.x, y: position.y };
  }

  const start = resolveEndpointPosition(route.points[segmentIndex], state, zoneVisuals);
  const end = resolveEndpointPosition(route.points[segmentIndex + 1], state, zoneVisuals);
  if (start === null || end === null) {
    return null;
  }

  const derived = deriveCurvatureControl(start, end, position);
  return derived.angle === undefined
    ? { kind: 'curvature', offset: derived.offset }
    : { kind: 'curvature', offset: derived.offset, angle: derived.angle };
}

function insertWaypointInDocument(
  state: MapEditorDocumentState,
  routeId: string,
  segmentIndex: number,
  position: Position,
): MapEditorDocumentState | null {
  const route = state.connectionRoutes.get(routeId);
  if (route === undefined || route.segments[segmentIndex] === undefined) {
    return null;
  }

  const anchorId = createWaypointAnchorId(routeId, state.connectionAnchors);
  const connectionAnchors = new Map(state.connectionAnchors);
  connectionAnchors.set(anchorId, { x: position.x, y: position.y });

  const points = [
    ...route.points.slice(0, segmentIndex + 1).map(cloneEndpoint),
    { kind: 'anchor' as const, anchorId },
    ...route.points.slice(segmentIndex + 1).map(cloneEndpoint),
  ];
  const segments = [
    ...route.segments.slice(0, segmentIndex).map(cloneSegment),
    { kind: 'straight' as const },
    { kind: 'straight' as const },
    ...route.segments.slice(segmentIndex + 1).map(cloneSegment),
  ];

  const connectionRoutes = new Map(state.connectionRoutes);
  connectionRoutes.set(routeId, { points, segments });

  return {
    zonePositions: state.zonePositions,
    connectionAnchors,
    connectionRoutes,
  };
}

function detachEndpointToAnchorInDocument(
  state: MapEditorDocumentState,
  routeId: string,
  pointIndex: number,
  position: Position,
): { readonly anchorId: string; readonly document: MapEditorDocumentState } | null {
  const route = state.connectionRoutes.get(routeId);
  const point = route?.points[pointIndex];
  if (route === undefined || point === undefined || point.kind !== 'zone') {
    return null;
  }

  const anchorId = createEndpointAnchorId(routeId, point.zoneId, pointIndex, state.connectionAnchors);
  const connectionAnchors = new Map(state.connectionAnchors);
  connectionAnchors.set(anchorId, { x: position.x, y: position.y });

  const points = route.points.map((entry, index) => (
    index === pointIndex
      ? { kind: 'anchor' as const, anchorId }
      : cloneEndpoint(entry)
  ));

  const connectionRoutes = new Map(state.connectionRoutes);
  connectionRoutes.set(routeId, {
    points,
    segments: route.segments.map(cloneSegment),
  });

  return {
    anchorId,
    document: {
      zonePositions: state.zonePositions,
      connectionAnchors,
      connectionRoutes,
    },
  };
}

function setEndpointAnchorInDocument(
  state: MapEditorDocumentState,
  routeId: string,
  pointIndex: number,
  anchor: number,
): MapEditorDocumentState | null {
  if (!Number.isFinite(anchor)) {
    return null;
  }

  const route = state.connectionRoutes.get(routeId);
  const point = route?.points[pointIndex];
  if (route === undefined || point === undefined || point.kind !== 'zone' || point.anchor === anchor) {
    return null;
  }

  const points = route.points.map((entry, index) => (
    index === pointIndex
      ? { ...entry, anchor }
      : cloneEndpoint(entry)
  ));
  const connectionRoutes = new Map(state.connectionRoutes);
  connectionRoutes.set(routeId, {
    points,
    segments: route.segments.map(cloneSegment),
  });

  return {
    zonePositions: state.zonePositions,
    connectionAnchors: state.connectionAnchors,
    connectionRoutes,
  };
}

function removeWaypointInDocument(
  state: MapEditorDocumentState,
  routeId: string,
  pointIndex: number,
): MapEditorDocumentState | null {
  const route = state.connectionRoutes.get(routeId);
  const point = route?.points[pointIndex];
  if (
    route === undefined
    || point === undefined
    || point.kind !== 'anchor'
    || pointIndex <= 0
    || pointIndex >= route.points.length - 1
  ) {
    return null;
  }

  const points = route.points.filter((_, index) => index !== pointIndex).map(cloneEndpoint);
  const segments = [
    ...route.segments.slice(0, pointIndex - 1).map(cloneSegment),
    { kind: 'straight' as const },
    ...route.segments.slice(pointIndex + 1).map(cloneSegment),
  ];

  const connectionRoutes = new Map(state.connectionRoutes);
  connectionRoutes.set(routeId, { points, segments });

  const connectionAnchors = new Map(state.connectionAnchors);
  if (!isAnchorReferenced(connectionRoutes, point.anchorId)) {
    connectionAnchors.delete(point.anchorId);
  }

  return {
    zonePositions: state.zonePositions,
    connectionAnchors,
    connectionRoutes,
  };
}

function convertSegmentInDocument(
  state: MapEditorDocumentState,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
  routeId: string,
  segmentIndex: number,
  kind: 'straight' | 'quadratic',
): MapEditorDocumentState | null {
  const route = state.connectionRoutes.get(routeId);
  const segment = route?.segments[segmentIndex];
  if (route === undefined || segment === undefined || segment.kind === kind) {
    return null;
  }

  const nextSegments = route.segments.map(cloneSegment);
  const connectionAnchors = new Map(state.connectionAnchors);

  if (kind === 'quadratic') {
    if (
      resolveEndpointPosition(route.points[segmentIndex], state, zoneVisuals) === null
      || resolveEndpointPosition(route.points[segmentIndex + 1], state, zoneVisuals) === null
    ) {
      return null;
    }

    nextSegments[segmentIndex] = {
      kind: 'quadratic',
      control: {
        kind: 'curvature',
        offset: 0,
      },
    };
  } else {
    const existing = nextSegments[segmentIndex];
    nextSegments[segmentIndex] = { kind: 'straight' };
    if (
      existing !== undefined
      && existing.kind === 'quadratic'
      && existing.control.kind === 'anchor'
      && !isAnchorReferenced(
        new Map([[routeId, { points: route.points, segments: nextSegments }], ...[...state.connectionRoutes.entries()].filter(([id]) => id !== routeId)]),
        existing.control.anchorId,
      )
    ) {
      connectionAnchors.delete(existing.control.anchorId);
    }
  }

  const connectionRoutes = new Map(state.connectionRoutes);
  connectionRoutes.set(routeId, {
    points: route.points.map(cloneEndpoint),
    segments: nextSegments,
  });

  return {
    zonePositions: state.zonePositions,
    connectionAnchors,
    connectionRoutes,
  };
}

function resolveEndpointPosition(
  endpoint: ConnectionEndpoint | undefined,
  state: MapEditorDocumentState,
  zoneVisuals: ReadonlyMap<string, EditorRouteZoneVisual>,
): Position | null {
  if (endpoint === undefined) {
    return null;
  }

  return resolveRouteEndpointPosition(
    endpoint,
    state.zonePositions,
    state.connectionAnchors,
    zoneVisuals,
  );
}

function createWaypointAnchorId(
  routeId: string,
  anchors: ReadonlyMap<string, Position>,
): string {
  let index = 1;
  while (true) {
    const candidate = `${routeId}:waypoint:${index}`;
    if (!anchors.has(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

function createEndpointAnchorId(
  routeId: string,
  zoneId: string,
  pointIndex: number,
  anchors: ReadonlyMap<string, Position>,
): string {
  const baseId = `${routeId}:endpoint:${zoneId}:${pointIndex}`;
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? baseId : `${baseId}:${suffix + 1}`;
    if (!anchors.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
}

function isAnchorReferenced(
  routes: ReadonlyMap<string, ConnectionRouteDefinition>,
  anchorId: string,
): boolean {
  for (const route of routes.values()) {
    for (const point of route.points) {
      if (point.kind === 'anchor' && point.anchorId === anchorId) {
        return true;
      }
    }
    for (const segment of route.segments) {
      if (segment.kind === 'quadratic' && segment.control.kind === 'anchor' && segment.control.anchorId === anchorId) {
        return true;
      }
    }
  }
  return false;
}

function positionsEqual(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

function cloneEndpoint(endpoint: ConnectionEndpoint): ConnectionEndpoint {
  return { ...endpoint };
}

function cloneSegment(segment: ConnectionRouteSegment): ConnectionRouteSegment {
  return cloneConnectionRouteSegment(segment);
}
