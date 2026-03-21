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

export type EditorSnapshot = MapEditorDocumentState;
