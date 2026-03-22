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
  readonly connectionAnchors: ReadonlyMap<string, Position>;
  readonly connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>;
}

export interface EditorLayerSet {
  readonly background: Container;
  readonly route: Container;
  readonly zone: Container;
  readonly handle: Container;
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
