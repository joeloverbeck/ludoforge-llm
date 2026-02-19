import type { Position, PositionBounds } from '../spatial/position-types.js';

export type LayoutMode = 'graph' | 'table' | 'track' | 'grid';

export type LayoutBounds = PositionBounds;

export interface LayoutResult {
  readonly positions: ReadonlyMap<string, Position>;
  readonly mode: LayoutMode;
  readonly boardBounds: LayoutBounds;
}

export interface AuxZoneGroup {
  readonly label: string;
  readonly zoneIds: readonly string[];
}

export interface AuxLayoutResult {
  readonly positions: ReadonlyMap<string, Position>;
  readonly groups: readonly AuxZoneGroup[];
}
