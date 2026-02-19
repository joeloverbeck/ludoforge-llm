import { describe, expect, it } from 'vitest';

import type { TokenShape } from '../../../src/config/visual-config-defaults';
import {
  drawTokenShape,
  getTokenShapeDrawerRegistry,
} from '../../../src/canvas/renderers/token-shape-drawer';

class MockGraphics {
  clearCalls = 0;

  fillCalls = 0;

  strokeCalls = 0;

  circles: Array<[number, number, number]> = [];

  roundRects: Array<[number, number, number, number, number]> = [];

  polys: number[][] = [];

  clear(): this {
    this.clearCalls += 1;
    return this;
  }

  roundRect(x: number, y: number, width: number, height: number, radius: number): this {
    this.roundRects.push([x, y, width, height, radius]);
    return this;
  }

  circle(x: number, y: number, radius: number): this {
    this.circles.push([x, y, radius]);
    return this;
  }

  poly(points: number[]): this {
    this.polys.push(points);
    return this;
  }

  fill(): this {
    this.fillCalls += 1;
    return this;
  }

  stroke(): this {
    this.strokeCalls += 1;
    return this;
  }
}

function allTokenShapes(): readonly TokenShape[] {
  return [
    'circle',
    'square',
    'triangle',
    'diamond',
    'hexagon',
    'beveled-cylinder',
    'meeple',
    'card',
    'cube',
    'round-disk',
  ];
}

describe('token-shape-drawer', () => {
  it('has a registry entry for every TokenShape value', () => {
    const registry = getTokenShapeDrawerRegistry();
    const keys = Object.keys(registry).sort();
    expect(keys).toEqual([...allTokenShapes()].sort());
  });

  it('drawTokenShape clears and draws each shape without throwing', () => {
    for (const shape of allTokenShapes()) {
      const graphics = new MockGraphics();
      expect(() => {
        drawTokenShape(graphics, shape, { width: 28, height: 28 }, 0xe63946, {
          color: 0x0f172a,
          width: 1.5,
          alpha: 0.9,
        });
      }).not.toThrow();
      expect(graphics.clearCalls).toBe(1);
      expect(graphics.fillCalls).toBeGreaterThan(0);
      expect(graphics.strokeCalls).toBeGreaterThan(0);
    }
  });

  it('draws beveled-cylinder as octagon with inner bevel geometry', () => {
    const graphics = new MockGraphics();
    drawTokenShape(graphics, 'beveled-cylinder', { width: 30, height: 30 }, 0xe63946, {
      color: 0x111111,
      width: 2,
      alpha: 1,
    });

    expect(graphics.polys.length).toBeGreaterThanOrEqual(2);
    expect(graphics.polys[0]).toHaveLength(16);
    expect(graphics.polys[1]).toHaveLength(16);
  });

  it('draws cube with base and top-face geometry', () => {
    const graphics = new MockGraphics();
    drawTokenShape(graphics, 'cube', { width: 30, height: 30 }, 0xe63946, {
      color: 0x111111,
      width: 2,
      alpha: 1,
    });

    expect(graphics.roundRects.length).toBeGreaterThan(0);
    expect(graphics.polys.length).toBeGreaterThan(0);
  });

  it('draws round-disk with concentric circles', () => {
    const graphics = new MockGraphics();
    drawTokenShape(graphics, 'round-disk', { width: 30, height: 30 }, 0xe63946, {
      color: 0x111111,
      width: 2,
      alpha: 1,
    });

    expect(graphics.circles).toHaveLength(2);
    expect(graphics.circles[0]?.[2]).toBeGreaterThan(graphics.circles[1]?.[2] ?? 0);
  });
});
