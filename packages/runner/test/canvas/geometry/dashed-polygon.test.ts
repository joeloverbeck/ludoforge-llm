import { beforeEach, describe, expect, it, vi } from 'vitest';

import { drawDashedPolygon } from '../../../src/canvas/geometry/dashed-polygon.js';
import { buildDashedSegments } from '../../../src/canvas/geometry/dashed-segments.js';

function createMockGraphics(): { moveTo: ReturnType<typeof vi.fn>; lineTo: ReturnType<typeof vi.fn> } {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  };
}

vi.mock('../../../src/canvas/geometry/dashed-segments.js', () => ({
  buildDashedSegments: vi.fn(),
}));

describe('drawDashedPolygon', () => {
  beforeEach(() => {
    vi.mocked(buildDashedSegments).mockReset();
  });

  it('builds closed-path segments and emits matching Pixi commands', () => {
    const g = createMockGraphics();
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    vi.mocked(buildDashedSegments).mockReturnValue([
      { from: { x: 0, y: 0 }, to: { x: 7, y: 0 } },
      { from: { x: 10, y: 1 }, to: { x: 10, y: 8 } },
    ]);

    drawDashedPolygon(g as never, square, 7, 4);

    expect(buildDashedSegments).toHaveBeenCalledWith(square, 7, 4, { closed: true });
    expect(g.moveTo.mock.calls).toEqual([
      [0, 0],
      [10, 1],
    ]);
    expect(g.lineTo.mock.calls).toEqual([
      [7, 0],
      [10, 8],
    ]);
  });

  it('does nothing when no segments are produced', () => {
    const g = createMockGraphics();
    vi.mocked(buildDashedSegments).mockReturnValue([]);

    drawDashedPolygon(g as never, [], 10, 5);

    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.lineTo).not.toHaveBeenCalled();
  });
});
