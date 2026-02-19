export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface PositionBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ZonePositionMap {
  readonly positions: ReadonlyMap<string, Position>;
  readonly bounds: PositionBounds;
}
