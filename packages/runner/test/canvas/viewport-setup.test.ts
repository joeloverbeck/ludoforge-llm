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

  it('updates clamp bounds using updateWorldBounds', () => {
    const viewport = createMockViewport();
    viewportCtorMock.mockImplementation(() => viewport);

    const config = createConfig();
    const result = setupViewport(config);

    expect(viewport.clamp).toHaveBeenCalledWith({
      left: 0,
      top: 0,
      right: config.worldWidth,
      bottom: config.worldHeight,
    });

    result.updateWorldBounds({ minX: 10, minY: 20, maxX: 300, maxY: 500 });

    expect(viewport.clamp).toHaveBeenLastCalledWith({
      left: 10,
      top: 20,
      right: 300,
      bottom: 500,
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
