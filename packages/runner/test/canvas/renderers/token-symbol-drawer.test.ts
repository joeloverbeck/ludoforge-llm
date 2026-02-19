import { describe, expect, it } from 'vitest';

import {
  drawTokenSymbol,
  getTokenSymbolDrawerRegistry,
} from '../../../src/canvas/renderers/token-symbol-drawer.js';

class MockGraphics {
  clearCount = 0;

  circleArgs: [number, number, number] | null = null;

  polyArgs: number[] | null = null;

  fillCalls: Array<{ color: number; alpha?: number }> = [];

  clear(): this {
    this.clearCount += 1;
    this.circleArgs = null;
    this.polyArgs = null;
    this.fillCalls = [];
    return this;
  }

  circle(x: number, y: number, radius: number): this {
    this.circleArgs = [x, y, radius];
    return this;
  }

  poly(points: number[]): this {
    this.polyArgs = points;
    return this;
  }

  fill(style: { color: number; alpha?: number }): this {
    this.fillCalls.push(style);
    return this;
  }
}

describe('token-symbol-drawer', () => {
  it('registers all expected symbol drawers', () => {
    const registry = getTokenSymbolDrawerRegistry();
    expect(Object.keys(registry).sort()).toEqual(['circle-dot', 'cross', 'diamond', 'star']);
  });

  it('draws each registered symbol without throwing', () => {
    for (const symbolId of Object.keys(getTokenSymbolDrawerRegistry())) {
      const graphics = new MockGraphics();
      expect(() => drawTokenSymbol(graphics, symbolId, 18)).not.toThrow();
      expect(graphics.fillCalls.length).toBeGreaterThan(0);
    }
  });

  it('draws star with 10 vertices', () => {
    const graphics = new MockGraphics();

    drawTokenSymbol(graphics, 'star', 20);

    expect(graphics.polyArgs).toHaveLength(20);
  });

  it('draws nothing for null/undefined/empty/unknown symbols', () => {
    const candidates: Array<string | null | undefined> = [null, undefined, '', '   ', 'unknown'];
    for (const candidate of candidates) {
      const graphics = new MockGraphics();
      drawTokenSymbol(graphics, candidate, 20);
      expect(graphics.clearCount).toBe(1);
      expect(graphics.polyArgs).toBeNull();
      expect(graphics.circleArgs).toBeNull();
      expect(graphics.fillCalls).toHaveLength(0);
    }
  });
});
