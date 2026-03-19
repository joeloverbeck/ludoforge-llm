import type { PositionBounds, ZonePositionMap } from '../spatial/position-types.js';

export interface WorldLayoutModel extends ZonePositionMap {
  readonly boardBounds: PositionBounds;
}
