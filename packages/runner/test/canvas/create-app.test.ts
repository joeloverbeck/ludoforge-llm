import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockApplicationInstance {
  readonly canvas: object;
  readonly stage: object;
  resizeTo: unknown;
  init: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const {
  applicationCtorMock,
  createLayerHierarchyMock,
  layersMock,
} = vi.hoisted(() => {
  const layers = {
    boardGroup: { id: 'board' },
    adjacencyLayer: { id: 'adjacency' },
    zoneLayer: { id: 'zone' },
    tableOverlayLayer: { id: 'table-overlay' },
    tokenGroup: { id: 'token' },
    effectsGroup: { id: 'effects' },
    interfaceGroup: { id: 'interface' },
    hudGroup: { id: 'hud' },
  };

  return {
    applicationCtorMock: vi.fn(),
    createLayerHierarchyMock: vi.fn(() => layers),
    layersMock: layers,
  };
});

vi.mock('pixi.js', () => ({
  Application: applicationCtorMock,
}));

vi.mock('../../src/canvas/layers', () => ({
  createLayerHierarchy: createLayerHierarchyMock,
}));

import { createGameCanvas } from '../../src/canvas/create-app';

const GAME_CANVAS_CONFIG = {
  backgroundColor: 0x102030,
} as const;

function createMockApplication(): MockApplicationInstance {
  return {
    canvas: { tag: 'canvas' },
    stage: { tag: 'stage' },
    resizeTo: undefined,
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
}

describe('createGameCanvas', () => {
  beforeEach(() => {
    applicationCtorMock.mockReset();
    createLayerHierarchyMock.mockClear();
  });

  it('creates an app with webgl configuration and returns app/layers', async () => {
    const app = createMockApplication();
    applicationCtorMock.mockImplementation(function () { return app; } as never);

    const appendChild = vi.fn();
    const container = { appendChild } as unknown as HTMLElement;

    const gameCanvas = await createGameCanvas(container, GAME_CANVAS_CONFIG);

    expect(applicationCtorMock).toHaveBeenCalledTimes(1);
    expect(app.init).toHaveBeenCalledTimes(1);
    expect(app.init).toHaveBeenCalledWith(
      expect.objectContaining({
        preference: 'webgl',
        antialias: true,
        autoDensity: true,
        backgroundColor: GAME_CANVAS_CONFIG.backgroundColor,
        resizeTo: container,
      }),
    );

    const [initOptions] = app.init.mock.calls[0] ?? [];
    expect(typeof initOptions.resolution).toBe('number');
    expect(initOptions.resolution).toBeGreaterThan(0);

    expect(appendChild).toHaveBeenCalledWith(app.canvas);
    expect(createLayerHierarchyMock).toHaveBeenCalledWith();
    expect(gameCanvas.app).toBe(app);
    expect(gameCanvas.layers).toBe(layersMock);
  });

  it('awaits app init before attaching canvas', async () => {
    let resolveInit: (() => void) | undefined;
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });

    const app = createMockApplication();
    app.init = vi.fn(() => initPromise);
    applicationCtorMock.mockImplementation(function () { return app; } as never);

    const appendChild = vi.fn();
    const container = { appendChild } as unknown as HTMLElement;

    const pending = createGameCanvas(container, GAME_CANVAS_CONFIG);
    await Promise.resolve();

    expect(app.init).toHaveBeenCalledTimes(1);
    expect(appendChild).not.toHaveBeenCalled();

    resolveInit?.();
    await pending;

    expect(appendChild).toHaveBeenCalledWith(app.canvas);
  });

  it('destroys the app with deep cleanup flags', async () => {
    const app = createMockApplication();
    applicationCtorMock.mockImplementation(function () { return app; } as never);

    const container = { appendChild: vi.fn() } as unknown as HTMLElement;

    const gameCanvas = await createGameCanvas(container, GAME_CANVAS_CONFIG);
    gameCanvas.destroy();

    expect(app.destroy).toHaveBeenCalledWith(true, {
      children: true,
      texture: true,
    });
  });
});
