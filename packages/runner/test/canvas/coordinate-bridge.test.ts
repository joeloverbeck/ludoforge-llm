import { describe, expect, it } from 'vitest';
import type { Viewport } from 'pixi-viewport';

import { createCoordinateBridge } from '../../src/canvas/coordinate-bridge';

interface TransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

describe('createCoordinateBridge', () => {
  it('converts world coordinates to screen coordinates using viewport transform and canvas offset', () => {
    const state: TransformState = { scale: 2, translateX: 50, translateY: -10 };
    let canvasRect = { left: 100, top: 200 };
    const bridge = createCoordinateBridge(
      createMockViewport(state),
      createMockCanvas(() => canvasRect),
    );

    expect(bridge.canvasToScreen({ x: 0, y: 0 })).toEqual({ x: 150, y: 190 });
    expect(bridge.canvasToScreen({ x: 10, y: 15 })).toEqual({ x: 170, y: 220 });

    canvasRect = { left: 400, top: 300 };
    expect(bridge.canvasToScreen({ x: 10, y: 15 })).toEqual({ x: 470, y: 320 });
  });

  it('round-trips from world to screen and back to world', () => {
    const state: TransformState = { scale: 1.25, translateX: 30, translateY: 45 };
    const bridge = createCoordinateBridge(
      createMockViewport(state),
      createMockCanvas(() => ({ left: 240, top: 80 })),
    );

    const points = [
      { x: 0, y: 0 },
      { x: 8, y: -4 },
      { x: 125.5, y: 299.25 },
    ];

    for (const point of points) {
      const screen = bridge.canvasToScreen(point);
      const roundTrip = bridge.screenToCanvas(screen);
      expect(roundTrip.x).toBeCloseTo(point.x);
      expect(roundTrip.y).toBeCloseTo(point.y);
    }
  });

  it('reflects pan and zoom changes from the viewport transform state', () => {
    const state: TransformState = { scale: 1, translateX: 0, translateY: 0 };
    const bridge = createCoordinateBridge(
      createMockViewport(state),
      createMockCanvas(() => ({ left: 10, top: 20 })),
    );

    expect(bridge.canvasToScreen({ x: 10, y: 20 })).toEqual({ x: 20, y: 40 });

    state.translateX = 50;
    state.translateY = -15;
    expect(bridge.canvasToScreen({ x: 10, y: 20 })).toEqual({ x: 70, y: 25 });

    state.scale = 2;
    expect(bridge.canvasToScreen({ x: 10, y: 20 })).toEqual({ x: 80, y: 45 });
  });

  it('returns an enclosing axis-aligned screen rect for world bounds', () => {
    const state: TransformState = { scale: 1.5, translateX: 8, translateY: -2 };
    const bridge = createCoordinateBridge(
      createMockViewport(state),
      createMockCanvas(() => ({ left: 100, top: 200 })),
    );

    const rect = bridge.worldBoundsToScreenRect({
      x: 10,
      y: 20,
      width: 40,
      height: 10,
    });

    expect(rect).toEqual({
      x: 123,
      y: 228,
      width: 60,
      height: 15,
      left: 123,
      top: 228,
      right: 183,
      bottom: 243,
    });
  });

  it('converts canvas-space bounds to screen rect using only canvas offset', () => {
    const state: TransformState = { scale: 2.5, translateX: 99, translateY: -77 };
    const bridge = createCoordinateBridge(
      createMockViewport(state),
      createMockCanvas(() => ({ left: 300, top: 120 })),
    );

    const rect = bridge.canvasBoundsToScreenRect({
      x: 40,
      y: 30,
      width: 28,
      height: 28,
    });

    expect(rect).toEqual({
      x: 340,
      y: 150,
      width: 28,
      height: 28,
      left: 340,
      top: 150,
      right: 368,
      bottom: 178,
    });
  });

  it('throws for invalid world bounds', () => {
    const bridge = createCoordinateBridge(
      createMockViewport({ scale: 1, translateX: 0, translateY: 0 }),
      createMockCanvas(() => ({ left: 0, top: 0 })),
    );

    expect(() => {
      bridge.worldBoundsToScreenRect({ x: 0, y: 0, width: -1, height: 2 });
    }).toThrow('world bounds width/height must be non-negative');

    expect(() => {
      bridge.worldBoundsToScreenRect({ x: Number.NaN, y: 0, width: 1, height: 2 });
    }).toThrow('world bounds must contain finite numbers');

    expect(() => {
      bridge.canvasBoundsToScreenRect({ x: 0, y: 0, width: -1, height: 2 });
    }).toThrow('world bounds width/height must be non-negative');
  });
});

function createMockViewport(state: TransformState): Viewport {
  const viewport = {
    toGlobal: ({ x, y }: { x: number; y: number }) => ({
      x: x * state.scale + state.translateX,
      y: y * state.scale + state.translateY,
    }),
    toLocal: ({ x, y }: { x: number; y: number }) => ({
      x: (x - state.translateX) / state.scale,
      y: (y - state.translateY) / state.scale,
    }),
  };

  return viewport as unknown as Viewport;
}

function createMockCanvas(
  getOffset: () => { left: number; top: number },
): HTMLCanvasElement {
  const canvas = {
    getBoundingClientRect: () => {
      const offset = getOffset();
      return {
        left: offset.left,
        top: offset.top,
        right: offset.left,
        bottom: offset.top,
        width: 0,
        height: 0,
        x: offset.left,
        y: offset.top,
        toJSON: () => ({}),
      };
    },
  };

  return canvas as unknown as HTMLCanvasElement;
}
