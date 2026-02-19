import { describe, expect, it } from 'vitest';

import {
  ZONE_RENDER_WIDTH,
  ZONE_RENDER_HEIGHT,
  ZONE_HALF_WIDTH,
  ZONE_HALF_HEIGHT,
} from '../../src/layout/layout-constants';

describe('layout-constants', () => {
  it('exports positive zone dimensions', () => {
    expect(ZONE_RENDER_WIDTH).toBeGreaterThan(0);
    expect(ZONE_RENDER_HEIGHT).toBeGreaterThan(0);
  });

  it('half dimensions are exactly half of full dimensions', () => {
    expect(ZONE_HALF_WIDTH).toBe(ZONE_RENDER_WIDTH / 2);
    expect(ZONE_HALF_HEIGHT).toBe(ZONE_RENDER_HEIGHT / 2);
  });

  it('zone width is 180 and height is 110', () => {
    expect(ZONE_RENDER_WIDTH).toBe(180);
    expect(ZONE_RENDER_HEIGHT).toBe(110);
  });
});
