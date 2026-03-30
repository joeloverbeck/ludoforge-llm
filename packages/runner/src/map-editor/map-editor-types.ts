import type { Viewport } from 'pixi-viewport';
import type { Application, Container } from 'pixi.js';

import type { ConnectionRouteDefinition } from '../config/visual-config-types.js';
import type { Position } from '../spatial/position-types.js';

export type { Position } from '../spatial/position-types.js';
export type {
  AnchorConnectionEndpoint,
  ConnectionEndpoint,
  ConnectionRouteControl,
  ConnectionRouteDefinition,
  ConnectionRouteSegment,
  QuadraticConnectionRouteSegment,
  StraightConnectionRouteSegment,
  VisualConfig,
  ZoneConnectionEndpoint,
} from '../config/visual-config-types.js';

export interface MapEditorDocumentState {
  readonly zonePositions: ReadonlyMap<string, Position>;
  readonly zoneVertices: ReadonlyMap<string, readonly number[]>;
  readonly connectionAnchors: ReadonlyMap<string, Position>;
  readonly connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>;
}

export interface ZoneEdgeAnchorDragPreview {
  readonly kind: 'zone-edge-anchor';
  readonly routeId: string;
  readonly pointIndex: number;
  readonly handlePosition: Position;
  readonly angle: number | null;
}

export type EditorDragPreview = ZoneEdgeAnchorDragPreview | null;

export interface EditorLayerSet {
  readonly backgroundLayer: Container;
  readonly regionLayer: Container;
  readonly provinceZoneLayer: Container;
  readonly connectionRouteLayer: Container;
  readonly cityZoneLayer: Container;
  readonly adjacencyLayer: Container;
  readonly tableOverlayLayer: Container;
  readonly handleLayer: Container;
}

export interface EditorCanvas {
  readonly app: Application;
  readonly viewport: Viewport;
  readonly layers: EditorLayerSet;
  resize(width: number, height: number): void;
  centerOnContent(): void;
  destroy(): void;
}

export type EditorSnapshot = MapEditorDocumentState;
