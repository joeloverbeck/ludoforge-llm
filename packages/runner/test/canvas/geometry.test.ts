import { describe, expectTypeOf, it } from 'vitest';

import type { Position } from '../../src/canvas/geometry';
import type { Position as SpatialPosition } from '../../src/spatial/position-types';

describe('canvas geometry types', () => {
  it('defines Position as a readonly numeric pair', () => {
    expectTypeOf<Position>().toEqualTypeOf<{
      readonly x: number;
      readonly y: number;
    }>();
  });

  it('reuses the shared spatial Position contract', () => {
    expectTypeOf<Position>().toEqualTypeOf<SpatialPosition>();
  });
});
