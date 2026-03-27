import { describe, expect, it, vi } from 'vitest';

import { drawDashedLine } from '../../../src/canvas/geometry/dashed-line.js';

function createMockGraphics(): { moveTo: ReturnType<typeof vi.fn>; lineTo: ReturnType<typeof vi.fn> } {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  };
}

describe('drawDashedLine', () => {
  it('draws expected dash segments for a horizontal line', () => {
    const g = createMockGraphics();

    drawDashedLine(g as never, { x: 0, y: 0 }, { x: 20, y: 0 }, 6, 4);

    expect(g.moveTo.mock.calls).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(g.lineTo.mock.calls).toEqual([
      [6, 0],
      [16, 0],
    ]);
  });

  it('truncates the first dash when the line is shorter than one dash', () => {
    const g = createMockGraphics();

    drawDashedLine(g as never, { x: 0, y: 0 }, { x: 3, y: 0 }, 6, 4);

    expect(g.moveTo.mock.calls).toEqual([[0, 0]]);
    expect(g.lineTo.mock.calls).toEqual([[3, 0]]);
  });

  it('does nothing for a zero-length line', () => {
    const g = createMockGraphics();

    drawDashedLine(g as never, { x: 5, y: 5 }, { x: 5, y: 5 }, 6, 4);

    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.lineTo).not.toHaveBeenCalled();
  });

  it('keeps vertical and reversed directions on-axis', () => {
    const vertical = createMockGraphics();
    drawDashedLine(vertical as never, { x: 0, y: 20 }, { x: 0, y: 0 }, 6, 4);
    expect(vertical.moveTo.mock.calls).toEqual([
      [0, 20],
      [0, 10],
    ]);
    expect(vertical.lineTo.mock.calls).toEqual([
      [0, 14],
      [0, 4],
    ]);

    const reversed = createMockGraphics();
    drawDashedLine(reversed as never, { x: 20, y: 0 }, { x: 0, y: 0 }, 6, 4);
    expect(reversed.moveTo.mock.calls).toEqual([
      [20, 0],
      [10, 0],
    ]);
    expect(reversed.lineTo.mock.calls).toEqual([
      [14, 0],
      [4, 0],
    ]);
  });

  it('keeps diagonal dash endpoints on the source line', () => {
    const g = createMockGraphics();

    drawDashedLine(g as never, { x: 0, y: 0 }, { x: 12, y: 16 }, 5, 5);

    expect(g.moveTo.mock.calls).toEqual([
      [0, 0],
      [6, 8],
    ]);
    expect(g.lineTo.mock.calls).toEqual([
      [3, 4],
      [9, 12],
    ]);
  });
});
