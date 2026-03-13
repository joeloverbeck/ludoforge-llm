import { describe, it, expect, vi } from 'vitest';
import type { Point } from '../../../src/canvas/geometry/convex-hull.js';
import { drawDashedPolygon } from '../../../src/canvas/geometry/dashed-polygon.js';

function createMockGraphics(): { moveTo: ReturnType<typeof vi.fn>; lineTo: ReturnType<typeof vi.fn> } {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  };
}

describe('drawDashedPolygon', () => {
  it('does nothing for empty points', () => {
    const g = createMockGraphics();
    drawDashedPolygon(g as never, [], 10, 5);
    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.lineTo).not.toHaveBeenCalled();
  });

  it('does nothing for single point', () => {
    const g = createMockGraphics();
    drawDashedPolygon(g as never, [{ x: 0, y: 0 }], 10, 5);
    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.lineTo).not.toHaveBeenCalled();
  });

  it('draws dashes along a square', () => {
    const g = createMockGraphics();
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    drawDashedPolygon(g as never, square, 10, 5);
    // Should have drawn multiple dash segments
    expect(g.moveTo.mock.calls.length).toBeGreaterThan(0);
    expect(g.lineTo.mock.calls.length).toBeGreaterThan(0);
    // Each moveTo should be paired with a lineTo
    expect(g.moveTo.mock.calls.length).toBe(g.lineTo.mock.calls.length);
  });

  it('handles very small polygons without crashing', () => {
    const g = createMockGraphics();
    const tiny: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ];
    expect(() => drawDashedPolygon(g as never, tiny, 10, 5)).not.toThrow();
  });
});
