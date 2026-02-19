import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { EventSystem } from 'pixi.js';

const viewportCtorMock = vi.hoisted(() => vi.fn());

vi.mock('pixi-viewport', () => ({
  Viewport: viewportCtorMock,
}));

import { setupViewport, type ViewportConfig } from '../../src/canvas/viewport-setup';

interface MockViewport extends Container {
  plugins: {
    removeAll: ReturnType<typeof vi.fn>;
  };
  drag: ReturnType<typeof vi.fn>;
  pinch: ReturnType<typeof vi.fn>;
  wheel: ReturnType<typeof vi.fn>;
  clampZoom: ReturnType<typeof vi.fn>;
  clamp: ReturnType<typeof vi.fn>;
  moveCenter: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  removeFromParent: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockViewport(): MockViewport {
  const viewport = new Container() as MockViewport;
  viewport.plugins = {
    removeAll: vi.fn(),
  };

  viewport.drag = vi.fn(() => viewport);
  viewport.pinch = vi.fn(() => viewport);
  viewport.wheel = vi.fn(() => viewport);
  viewport.clampZoom = vi.fn(() => viewport);
  viewport.clamp = vi.fn(() => viewport);
  viewport.moveCenter = vi.fn(() => viewport);
  viewport.resize = vi.fn(() => viewport);

  viewport.removeFromParent = vi.fn(() => {
    viewport.parent?.removeChild(viewport);
    return viewport;
  });

  viewport.destroy = vi.fn();

  return viewport;
}

function createConfig(): ViewportConfig {
  const stage = new Container();
  const boardGroup = new Container();
  const tokenGroup = new Container();
  const effectsGroup = new Container();
  const interfaceGroup = new Container();
  const hudGroup = new Container();

  return {
    stage,
    layers: {
      boardGroup,
      tokenGroup,
      effectsGroup,
      interfaceGroup,
      hudGroup,
    },
    screenWidth: 1280,
    screenHeight: 720,
    worldWidth: 2048,
    worldHeight: 1024,
    events: { tag: 'events' } as unknown as EventSystem,
    minScale: 0.25,
    maxScale: 4,
  };
}

describe('setupViewport', () => {
  beforeEach(() => {
    viewportCtorMock.mockReset();
  });

  it('creates a viewport with explicit events and enables pan/zoom plugins', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    expect(viewportCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        screenWidth: config.screenWidth,
        screenHeight: config.screenHeight,
        worldWidth: config.worldWidth,
        worldHeight: config.worldHeight,
        events: config.events,
      }),
    );

    expect(viewport.drag).toHaveBeenCalledTimes(1);
    expect(viewport.pinch).toHaveBeenCalledTimes(1);
    expect(viewport.wheel).toHaveBeenCalledTimes(1);
    expect(viewport.clampZoom).toHaveBeenCalledWith({
      minScale: config.minScale,
      maxScale: config.maxScale,
    });

    expect(result.viewport).toBe(viewport);
    expect(result.updateWorldBounds).toEqual(expect.any(Function));
    expect(result.destroy).toEqual(expect.any(Function));
  });

  it('moves world layers into viewport and keeps HUD outside viewport', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    expect(config.layers.hudGroup.parent).toBe(config.stage);
    expect(config.stage.children[0]).toBe(viewport);
    expect(config.stage.children).toContain(config.layers.hudGroup);

    expect(config.layers.boardGroup.parent).toBe(viewport);
    expect(config.layers.tokenGroup.parent).toBe(viewport);
    expect(config.layers.effectsGroup.parent).toBe(viewport);
    expect(config.layers.interfaceGroup.parent).toBe(viewport);
    expect(viewport.children).not.toContain(config.layers.hudGroup);

    expect(result.worldLayers).toEqual([
      config.layers.boardGroup,
      config.layers.tokenGroup,
      config.layers.effectsGroup,
      config.layers.interfaceGroup,
    ]);
  });

  it('updates clamp bounds using updateWorldBounds with zoom-aware overscroll padding', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    // padX = 1280 / 0.25 / 2 = 2560, padY = 720 / 0.25 / 2 = 1440
    const result = setupViewport(config);

    expect(viewport.clamp).toHaveBeenCalledWith({
      left: 0 - 2560,
      top: 0 - 1440,
      right: config.worldWidth + 2560,
      bottom: config.worldHeight + 1440,
      underflow: 'none',
    });

    result.updateWorldBounds({ minX: 10, minY: 20, maxX: 300, maxY: 500 });

    expect(viewport.clamp).toHaveBeenLastCalledWith({
      left: 10 - 2560,
      top: 20 - 1440,
      right: 300 + 2560,
      bottom: 500 + 1440,
      underflow: 'none',
    });
  });

  it('applies zoom-aware overscroll padding to clamp bounds in updateWorldBounds', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    setupViewport(config);

    viewport.clamp.mockClear();

    const result = setupViewport(config);
    result.updateWorldBounds({ minX: -600, minY: -400, maxX: 600, maxY: 400 });

    // padX = 2560, padY = 1440
    expect(viewport.clamp).toHaveBeenLastCalledWith({
      left: -600 - 2560,
      top: -400 - 1440,
      right: 600 + 2560,
      bottom: 400 + 1440,
      underflow: 'none',
    });
  });

  it('centerOnBounds moves viewport to content center', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    result.centerOnBounds({ minX: -600, minY: -400, maxX: 600, maxY: 400 });

    expect(viewport.moveCenter).toHaveBeenCalledWith(0, 0);
  });

  it('centerOnBounds works with asymmetric bounds', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    result.centerOnBounds({ minX: 100, minY: 200, maxX: 500, maxY: 600 });

    expect(viewport.moveCenter).toHaveBeenCalledWith(300, 400);
  });

  it('overscroll padding works with zero-size bounds', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    result.updateWorldBounds({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

    // padX = 2560, padY = 1440
    expect(viewport.clamp).toHaveBeenLastCalledWith({
      left: -2560,
      top: -1440,
      right: 2560,
      bottom: 1440,
      underflow: 'none',
    });
  });

  it('cleans up viewport plugins, detaches layers, and removes viewport from stage on destroy', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    result.destroy();

    expect(viewport.plugins.removeAll).toHaveBeenCalledTimes(1);
    expect(config.layers.boardGroup.parent).toBeNull();
    expect(config.layers.tokenGroup.parent).toBeNull();
    expect(config.layers.effectsGroup.parent).toBeNull();
    expect(config.layers.interfaceGroup.parent).toBeNull();
    expect(config.stage.children).not.toContain(viewport);
    expect(viewport.removeFromParent).toHaveBeenCalledTimes(1);
    expect(viewport.destroy).toHaveBeenCalledTimes(1);
  });

  it('throws when minScale is greater than maxScale', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();

    expect(() => {
      setupViewport({
        ...config,
        minScale: 2,
        maxScale: 1,
      });
    }).toThrow('minScale must be less than or equal to maxScale');
  });

  it('throws when updateWorldBounds receives invalid bounds', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config as never);

    expect(() => {
      result.updateWorldBounds({ minX: 5, minY: 10, maxX: 4, maxY: 9 });
    }).toThrow('viewport world bounds are invalid');
  });
});
