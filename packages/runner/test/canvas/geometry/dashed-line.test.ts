import { beforeEach, describe, expect, it, vi } from 'vitest';

import { drawDashedLine } from '../../../src/canvas/geometry/dashed-line.js';
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

describe('drawDashedLine', () => {
  beforeEach(() => {
    vi.mocked(buildDashedSegments).mockReset();
  });

  it('builds open-path segments and emits matching Pixi commands', () => {
    const g = createMockGraphics();
    vi.mocked(buildDashedSegments).mockReturnValue([
      { from: { x: 0, y: 0 }, to: { x: 6, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 16, y: 0 } },
    ]);

    drawDashedLine(g as never, { x: 0, y: 0 }, { x: 20, y: 0 }, 6, 4);

    expect(buildDashedSegments).toHaveBeenCalledWith(
      [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      6,
      4,
    );
    expect(g.moveTo.mock.calls).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(g.lineTo.mock.calls).toEqual([
      [6, 0],
      [16, 0],
    ]);
  });

  it('does nothing when no segments are produced', () => {
    const g = createMockGraphics();
    vi.mocked(buildDashedSegments).mockReturnValue([]);

    drawDashedLine(g as never, { x: 5, y: 5 }, { x: 5, y: 5 }, 6, 4);

    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.lineTo).not.toHaveBeenCalled();
  });
});
