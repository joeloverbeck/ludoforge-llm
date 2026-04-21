import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { GameCanvas } from '../../src/canvas/GameCanvas';
import { createGameCanvasRuntime, createScopedLifecycleCallback } from '../../src/canvas/game-canvas-runtime.js';
import type { CoordinateBridge } from '../../src/canvas/coordinate-bridge';
import type { RenderHealthProbeOptions } from '../../src/canvas/render-health-probe.js';
import type { ViewportResult } from '../../src/canvas/viewport-setup';
import type { GameStore } from '../../src/store/game-store';
import type { DiagnosticBuffer } from '../../src/animation/diagnostic-buffer.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { drawTableBackground } from '../../src/canvas/renderers/table-background-renderer.js';
import type { WorldLayoutModel } from '../../src/layout/world-layout-model.js';

vi.mock('../../src/canvas/renderers/table-background-renderer.js', () => ({
  drawTableBackground: vi.fn(),
}));

interface RuntimeStoreState {
  readonly renderModel: GameStore['renderModel'];
  readonly gameDef: GameDef | null;
  readonly worldLayout: WorldLayoutModel | null;
  readonly animationPlaying: boolean;
  readonly animationPlaybackSpeed: GameStore['animationPlaybackSpeed'];
  readonly animationPaused: boolean;
  readonly animationSkipRequestToken: number;
  submitChoice(choice: string): void;
  setAnimationPlaying(playing: boolean): void;
  setAnimationPlaybackSpeed(speed: GameStore['animationPlaybackSpeed']): void;
  setAnimationPaused(paused: boolean): void;
  requestAnimationSkipCurrent(): void;
}

function createRuntimeStore(
  initialRenderModel: GameStore['renderModel'],
  initialWorldLayout: WorldLayoutModel | null = null,
): StoreApi<RuntimeStoreState> {
  let store!: StoreApi<RuntimeStoreState>;
  store = createStore<RuntimeStoreState>()(
    subscribeWithSelector((): RuntimeStoreState => ({
      renderModel: initialRenderModel,
      gameDef: null,
      worldLayout: initialWorldLayout,
      animationPlaying: false,
      animationPlaybackSpeed: '1x',
      animationPaused: false,
      animationSkipRequestToken: 0,
      submitChoice: (_choice: string) => {},
      setAnimationPlaying: (playing: boolean) => {
        store.setState({ animationPlaying: playing });
      },
      setAnimationPlaybackSpeed: (speed: GameStore['animationPlaybackSpeed']) => {
        store.setState({ animationPlaybackSpeed: speed });
      },
      setAnimationPaused: (paused: boolean) => {
        store.setState({ animationPaused: paused });
      },
      requestAnimationSkipCurrent: () => {
        store.setState((state) => ({ animationSkipRequestToken: state.animationSkipRequestToken + 1 }));
      },
    })),
  );
  return store;
}

function makeRenderModel(zoneIds: readonly string[]): GameStore['renderModel'] {
  return {
    zones: zoneIds.map((id) => ({ id })),
  } as unknown as NonNullable<GameStore['renderModel']>;
}

function makeWorldLayout(zoneIds: readonly string[]): WorldLayoutModel {
  const positions = new Map<string, { x: number; y: number }>();
  for (const [index, zoneId] of zoneIds.entries()) {
    positions.set(zoneId, { x: 40 + index * 100, y: 60 });
  }

  return {
    positions,
    bounds: {
      minX: 0,
      minY: 0,
      maxX: Math.max(320, zoneIds.length * 100 + 20),
      maxY: 120,
    },
    boardBounds: {
      minX: 20,
      minY: 30,
      maxX: Math.max(260, zoneIds.length * 100 - 40),
      maxY: 180,
    },
  };
}

function createRuntimeFixture() {
  const lifecycle: string[] = [];
  let movedListener: (() => void) | null = null;
  const canvasListeners = new Map<string, Set<EventListener>>();
  let canvasBounds = {
    left: 0,
    top: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  };

  const runtimeLayoutStore = {
    getSnapshot: vi.fn(() => ({
      zoneIDs: ['zone:a'],
      positions: new Map([['zone:a', { x: 0, y: 0 }]]),
      bounds: { minX: 0, minY: 0, maxX: 400, maxY: 300 },
    })),
    setFallbackZoneIDs: vi.fn(),
    setActiveLayout: vi.fn(),
    subscribe: vi.fn(() => {
      lifecycle.push('position-unsubscribe-registered');
      return () => {
        lifecycle.push('position-unsubscribed');
      };
    }),
  };

  const canvasUpdater = {
    start: vi.fn(() => {
      lifecycle.push('updater-start');
    }),
    setInteractionHighlights: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('updater-destroy');
    }),
  };

  const zoneContainer = {
    getBounds: vi.fn(() => ({ x: 10, y: 20, width: 180, height: 110 })),
  };
  const connectionRouteContainer = {
    getBounds: vi.fn(() => ({ x: 120, y: 140, width: 140, height: 36 })),
  };
  const tokenContainer = {
    getBounds: vi.fn(() => ({ x: 40, y: 60, width: 28, height: 28 })),
  };
  const zoneContainerMap = new Map([['zone:a', zoneContainer]]);
  const connectionRouteContainerMap = new Map([['loc-alpha-beta:none', connectionRouteContainer]]);
  const tokenContainerMap = new Map([['token:1', tokenContainer]]);

  const zoneRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => zoneContainerMap),
    destroy: vi.fn(() => {
      lifecycle.push('zone-renderer-destroy');
    }),
  };

  const adjacencyRenderer = {
    update: vi.fn(),
    showForZone: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('adjacency-renderer-destroy');
    }),
  };

  const connectionRouteRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => connectionRouteContainerMap),
    destroy: vi.fn(() => {
      lifecycle.push('connection-route-renderer-destroy');
    }),
  };

  const tokenRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => tokenContainerMap),
    destroy: vi.fn(() => {
      lifecycle.push('token-renderer-destroy');
    }),
  };

  const tableOverlayRenderer = {
    update: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('table-overlay-renderer-destroy');
    }),
  };

  type RuntimeViewportFixture = Pick<ViewportResult['viewport'], 'x' | 'y' | 'scale' | 'moving'> & {
    on(event: 'moved', listener: () => void): ViewportResult['viewport'];
    off(event: 'moved', listener: () => void): ViewportResult['viewport'];
  };

  const viewportEvents: RuntimeViewportFixture = {
    x: 0,
    y: 0,
    scale: { x: 1, y: 1 } as ViewportResult['viewport']['scale'],
    moving: false,
    on: vi.fn((event: 'moved', listener: () => void) => {
      if (event === 'moved') {
        movedListener = listener;
      }
      return viewportEvents as ViewportResult['viewport'];
    }),
    off: vi.fn((event: 'moved', listener: () => void) => {
      if (event === 'moved' && movedListener === listener) {
        movedListener = null;
      }
      return viewportEvents as ViewportResult['viewport'];
    }),
  };

  const viewportResult = {
    viewport: viewportEvents as ViewportResult['viewport'],
    worldLayers: [],
    updateWorldBounds: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('viewport-destroy');
    }),
  };

  const gameCanvas = {
    app: {
      stage: { children: [] } as never,
      ticker: {
        _tick: vi.fn(),
        stop: vi.fn(),
        started: true,
        addOnce: vi.fn(),
        remove: vi.fn(),
      },
      renderer: {
        screen: { width: 1024, height: 768 },
        events: {} as never,
      },
      canvas: {
        isConnected: true,
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          const listeners = canvasListeners.get(type) ?? new Set<EventListener>();
          listeners.add(listener);
          canvasListeners.set(type, listeners);
        }),
        removeEventListener: vi.fn((type: string, listener: EventListener) => {
          canvasListeners.get(type)?.delete(listener);
        }),
        getBoundingClientRect: vi.fn(() => canvasBounds),
      } as unknown as HTMLCanvasElement,
    },
    layers: {
      boardGroup: {} as never,
      backgroundLayer: {} as never,
      adjacencyLayer: {} as never,
      connectionRouteLayer: {} as never,
      provinceZoneLayer: {} as never,
      cityZoneLayer: {} as never,
      tableOverlayLayer: {} as never,
      tokenGroup: {} as never,
      effectsGroup: {} as never,
      interfaceGroup: {} as never,
      hudGroup: {} as never,
    },
    destroy: vi.fn(() => {
      lifecycle.push('game-canvas-destroy');
    }),
  };

  let nextRect = { x: 100, y: 200, width: 180, height: 110 };
  const bridge = {
    canvasToScreen: vi.fn(),
    screenToCanvas: vi.fn(),
    canvasBoundsToScreenRect: vi.fn(() => ({
      ...nextRect,
      left: nextRect.x,
      top: nextRect.y,
      right: nextRect.x + nextRect.width,
      bottom: nextRect.y + nextRect.height,
    })),
    worldBoundsToScreenRect: vi.fn(() => ({
      ...nextRect,
      left: nextRect.x,
      top: nextRect.y,
      right: nextRect.x + nextRect.width,
      bottom: nextRect.y + nextRect.height,
    })),
  } as CoordinateBridge;

  const ariaAnnouncer = {
    announce: vi.fn((message: string) => {
      lifecycle.push(`announce:${message}`);
    }),
    destroy: vi.fn(() => {
      lifecycle.push('aria-destroy');
    }),
  };
  let reducedMotion = false;
  let reducedMotionListener: ((value: boolean) => void) | null = null;
  const reducedMotionObserver = {
    get reduced() {
      return reducedMotion;
    },
    subscribe: vi.fn((listener: (value: boolean) => void) => {
      reducedMotionListener = listener;
      return () => {
        if (reducedMotionListener === listener) {
          reducedMotionListener = null;
        }
      };
    }),
    destroy: vi.fn(() => {
      lifecycle.push('reduced-motion-destroy');
      reducedMotionListener = null;
    }),
  };

  const keyboardCleanup = vi.fn(() => {
    lifecycle.push('keyboard-cleanup');
  });
  const animationController = {
    start: vi.fn(() => {
      lifecycle.push('animation-controller-start');
    }),
    destroy: vi.fn(() => {
      lifecycle.push('animation-controller-destroy');
    }),
    setDetailLevel: vi.fn(),
    setReducedMotion: vi.fn(),
    setSpeed: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skipCurrent: vi.fn(),
    skipAll: vi.fn(),
    getDiagnosticBuffer: vi.fn(),
  };
  const aiPlaybackController = {
    start: vi.fn(() => {
      lifecycle.push('ai-playback-controller-start');
    }),
    destroy: vi.fn(() => {
      lifecycle.push('ai-playback-controller-destroy');
    }),
  };
  const actionAnnouncementRenderer = {
    enqueue: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('action-announcement-renderer-destroy');
    }),
  };
  const actionAnnouncementPresenter = {
    start: vi.fn(() => {
      lifecycle.push('action-announcement-presenter-start');
    }),
    destroy: vi.fn(() => {
      lifecycle.push('action-announcement-presenter-destroy');
    }),
  };

  const attachKeyboardSelect = vi.fn(() => keyboardCleanup);
  const attachZoneSelectHandlers = vi.fn(() => vi.fn());
  const attachTokenSelectHandlers = vi.fn(() => vi.fn());
  const createAnimationController = vi.fn(() => animationController);
  const createAiPlaybackController = vi.fn(() => aiPlaybackController);
  const createReducedMotionObserver = vi.fn(() => reducedMotionObserver);
  const renderHealthProbe = {
    scheduleVerification: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('render-health-probe-destroy');
    }),
  };
  const createRenderHealthProbe = vi.fn((_: RenderHealthProbeOptions) => renderHealthProbe);

  const deps = {
    createGameCanvas: vi.fn(async () => gameCanvas),
    setupViewport: vi.fn(() => viewportResult),
    createRuntimeLayoutStore: vi.fn(() => runtimeLayoutStore),
    createZoneRenderer: vi.fn((_parent, _pool, options: { bindSelection?: (zoneContainer: unknown, zoneId: string, isSelectable: () => boolean) => () => void }) => {
      options.bindSelection?.(zoneContainer, 'zone:a', () => true);
      return zoneRenderer;
    }),
    createAdjacencyRenderer: vi.fn(() => adjacencyRenderer),
    createConnectionRouteRenderer: vi.fn((_parent, _provider, options: {
      bindSelection?: (zoneContainer: unknown, zoneId: string, isSelectable: () => boolean) => () => void;
    } = {}) => {
      options.bindSelection?.(connectionRouteContainer, 'loc-alpha-beta:none', () => true);
      return connectionRouteRenderer;
    }),
    createTokenRenderer: vi.fn((_parent, options: {
      bindSelection?: (tokenContainer: unknown, tokenId: string, isSelectable: () => boolean) => () => void;
      disposalQueue: unknown;
    }) => {
      options.bindSelection?.(tokenContainer, 'token:1', () => true);
      return tokenRenderer;
    }),
    createTableOverlayRenderer: vi.fn(() => tableOverlayRenderer),
    createActionAnnouncementRenderer: vi.fn(() => actionAnnouncementRenderer),
    createActionAnnouncementPresenter: vi.fn(() => actionAnnouncementPresenter),
    createCanvasUpdater: vi.fn(() => canvasUpdater),
    createCoordinateBridge: vi.fn(() => bridge),
    createAnimationController,
    createAiPlaybackController,
    createReducedMotionObserver,
    createAriaAnnouncer: vi.fn(() => ariaAnnouncer),
    attachZoneSelectHandlers,
    attachTokenSelectHandlers,
    attachKeyboardSelect,
    createRenderHealthProbe,
  };

  return {
    lifecycle,
    deps,
    bridge,
    canvasUpdater,
    zoneRenderer,
    adjacencyRenderer,
    connectionRouteRenderer,
    tokenRenderer,
    tableOverlayRenderer,
    viewportResult,
    gameCanvas,
    runtimeLayoutStore,
    animationController,
    aiPlaybackController,
    actionAnnouncementRenderer,
    actionAnnouncementPresenter,
    createAnimationController,
    createAiPlaybackController,
    createReducedMotionObserver,
    ariaAnnouncer,
    attachZoneSelectHandlers,
    attachTokenSelectHandlers,
    attachKeyboardSelect,
    renderHealthProbe,
    createRenderHealthProbe,
    keyboardCleanup,
    zoneContainerMap,
    tokenContainerMap,
    connectionRouteContainerMap,
    viewportEvents,
    emitViewportMoved: () => {
      movedListener?.();
    },
    emitCanvasPointerMove: (clientX: number, clientY: number) => {
      const event = { clientX, clientY } as PointerEvent;
      for (const listener of canvasListeners.get('pointermove') ?? []) {
        listener(event);
      }
    },
    emitCanvasPointerLeave: () => {
      const event = {} as PointerEvent;
      for (const listener of canvasListeners.get('pointerleave') ?? []) {
        listener(event);
      }
    },
    emitReducedMotionChange: (next: boolean) => {
      reducedMotion = next;
      reducedMotionListener?.(next);
    },
    setCanvasBounds: (nextBounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      canvasBounds = nextBounds;
    },
    setNextScreenRect: (rect: { x: number; y: number; width: number; height: number }) => {
      nextRect = rect;
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

const mockedDrawTableBackground = vi.mocked(drawTableBackground);
const TEST_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);

function makeGameDefWithZones(zoneIDs: readonly string[]): GameDef {
  return {
    metadata: {
      id: 'test-game',
    },
    zones: zoneIDs.map((zoneID) => ({ id: zoneID })),
  } as unknown as GameDef;
}

describe('GameCanvas', () => {
  it('createScopedLifecycleCallback ignores values after deactivation', () => {
    const callback = vi.fn();
    const scoped = createScopedLifecycleCallback(callback);

    scoped.invoke('first');
    scoped.deactivate();
    scoped.invoke('second');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');
  });

  it('createScopedLifecycleCallback safely handles undefined callbacks', () => {
    const scoped = createScopedLifecycleCallback<string>();

    expect(() => {
      scoped.invoke('value');
      scoped.deactivate();
      scoped.invoke('ignored');
    }).not.toThrow();
  });

  it('renders an accessible game board container', () => {
    const html = renderToStaticMarkup(
      createElement(GameCanvas, {
        store: createRuntimeStore(null) as unknown as StoreApi<GameStore>,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('role="application"');
    expect(html).toContain('aria-label="Game board"');
    expect(html).toContain('data-ludoforge-live-region="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });
});

describe('createGameCanvasRuntime', () => {
  beforeEach(() => {
    mockedDrawTableBackground.mockReset();
  });

  it('initializes canvas pipeline and wires hover-anchor publishing', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a', 'zone:b']));
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x000000,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.deps.createGameCanvas).toHaveBeenCalledWith(
      expect.anything(),
      { backgroundColor: 0x000000 },
    );
    expect(fixture.deps.setupViewport).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createZoneRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createAdjacencyRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createConnectionRouteRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createTokenRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createTableOverlayRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createActionAnnouncementRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createActionAnnouncementPresenter).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createTableOverlayRenderer).toHaveBeenCalledWith(
      fixture.gameCanvas.layers.tableOverlayLayer,
      TEST_VISUAL_CONFIG_PROVIDER,
    );
    expect(fixture.deps.createActionAnnouncementRenderer).toHaveBeenCalledWith({
      parentContainer: fixture.gameCanvas.layers.effectsGroup,
    });
    expect(fixture.deps.createActionAnnouncementPresenter).toHaveBeenCalledWith({
      store: store as unknown as StoreApi<GameStore>,
      onAnnouncement: expect.any(Function),
    });
    expect(fixture.deps.createCanvasUpdater).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createAriaAnnouncer).toHaveBeenCalledTimes(1);
    expect(fixture.createAnimationController).toHaveBeenCalledTimes(1);
    expect(fixture.animationController.start).toHaveBeenCalledTimes(1);
    expect(fixture.createReducedMotionObserver).toHaveBeenCalledTimes(1);
    expect(fixture.animationController.setReducedMotion).toHaveBeenCalledWith(false);
    expect(fixture.actionAnnouncementPresenter.start).toHaveBeenCalledTimes(1);
    expect(fixture.createAiPlaybackController).toHaveBeenCalledTimes(1);
    expect(fixture.aiPlaybackController.start).toHaveBeenCalledTimes(1);
    expect(fixture.attachKeyboardSelect).toHaveBeenCalledTimes(1);
    expect(fixture.attachZoneSelectHandlers).toHaveBeenCalledTimes(2);
    expect(fixture.attachTokenSelectHandlers).toHaveBeenCalledTimes(1);
    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(1);
    expect(runtime.coordinateBridge).toBe(fixture.bridge);
    expect(fixture.viewportEvents.on).toHaveBeenCalledWith('moved', expect.any(Function));
    expect(onHoverAnchorChange).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('passes merged zone and connection-route containers to animation and hover systems', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a', 'loc-alpha-beta:none'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x010101,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const animationControllerCalls = fixture.createAnimationController.mock.calls as unknown[][];
    const animationControllerOptions = animationControllerCalls[0]?.[0] as {
      zoneContainers: () => ReadonlyMap<string, unknown>;
    } | undefined;
    expect(animationControllerOptions?.zoneContainers()).toEqual(new Map([
      ['zone:a', fixture.zoneContainerMap.get('zone:a')],
      ['loc-alpha-beta:none', fixture.connectionRouteContainerMap.get('loc-alpha-beta:none')],
    ]));

    const routeHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[1] as unknown[] | undefined;
    const routeHoverOptions = routeHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
      onHoverLeave?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;

    routeHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'loc-alpha-beta:none' });
    await flushMicrotasks();
    routeHoverOptions?.onHoverLeave?.({ kind: 'zone', id: 'loc-alpha-beta:none' });
    await flushMicrotasks();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, {
      target: { kind: 'zone', id: 'loc-alpha-beta:none' },
      rect: {
        x: 100,
        y: 200,
        width: 180,
        height: 110,
        left: 100,
        top: 200,
        right: 280,
        bottom: 310,
      },
      space: 'screen',
      version: 1,
    });
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(2, null);

    runtime.destroy();
  });

  it('forwards interaction highlights to canvas updater', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    runtime.setInteractionHighlights({
      zoneIDs: ['zone:a'],
      tokenIDs: ['token:1'],
    });

    expect(fixture.canvasUpdater.setInteractionHighlights).toHaveBeenCalledWith({
      zoneIDs: ['zone:a'],
      tokenIDs: ['token:1'],
    });

    runtime.destroy();
  });

  it('returns viewport and health snapshots while active, then null after destroy', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    fixture.viewportResult.viewport.x = 64;
    fixture.viewportResult.viewport.y = 96;
    fixture.viewportResult.viewport.scale.x = 1.25;
    fixture.viewportResult.viewport.scale.y = 1.5;

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(runtime.getViewportSnapshot()).toEqual({
      x: 64,
      y: 96,
      scaleX: 1.25,
      scaleY: 1.5,
    });
    expect(runtime.getHealthStatus()).toEqual({
      tickerStarted: true,
      canvasConnected: true,
      renderCorruptionSuspected: false,
    });

    runtime.destroy();

    expect(runtime.getViewportSnapshot()).toBeNull();
    expect(runtime.getHealthStatus()).toBeNull();
  });

  it('schedules render-health verification after contained ticker errors and reports confirmed corruption through onError', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const onError = vi.fn();
    const originalTick = fixture.gameCanvas.app.ticker._tick as ReturnType<typeof vi.fn>;
    originalTick.mockImplementation(() => {
      throw new Error('contained');
    });

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onError,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.createRenderHealthProbe).toHaveBeenCalledTimes(1);
    const probeOptions = fixture.createRenderHealthProbe.mock.calls[0]![0];
    expect(probeOptions.stage).toBe(fixture.gameCanvas.app.stage);
    expect(probeOptions.ticker).toBe(fixture.gameCanvas.app.ticker);

    fixture.gameCanvas.app.ticker._tick();

    expect(fixture.renderHealthProbe.scheduleVerification).toHaveBeenCalledTimes(1);

    probeOptions.onCorruption();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Render health probe detected non-functional rendering after a contained ticker error.',
      }),
    );

    runtime.destroy();
    expect(fixture.renderHealthProbe.destroy).toHaveBeenCalled();
  });

  it('restores an initial viewport snapshot when provided', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        initialViewport: {
          x: 140,
          y: 220,
          scaleX: 2,
          scaleY: 2.5,
        },
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.viewportResult.viewport.x).toBe(140);
    expect(fixture.viewportResult.viewport.y).toBe(220);
    expect(fixture.viewportResult.viewport.scale.x).toBe(2);
    expect(fixture.viewportResult.viewport.scale.y).toBe(2.5);

    runtime.destroy();
  });

  it('draws background from board bounds and clears it when gameDef is removed', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const provider = new VisualConfigProvider({
      version: 1,
      layout: {
        mode: 'table',
        tableBackground: {
          color: '#0a5c2e',
          shape: 'ellipse',
          paddingX: 100,
          paddingY: 80,
        },
      },
    });
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn', 'zone:hand:p1']);

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: provider,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    store.setState({ gameDef, worldLayout: makeWorldLayout(['zone:deck', 'zone:burn', 'zone:hand:p1']) });
    await flushMicrotasks();

    expect(mockedDrawTableBackground).toHaveBeenCalledWith(
      fixture.gameCanvas.layers.backgroundLayer,
      provider.getTableBackground(),
      {
        minX: 20,
        minY: 30,
        maxX: 260,
        maxY: 180,
      },
    );

    store.setState({ gameDef: null, worldLayout: null });
    await flushMicrotasks();

    expect(mockedDrawTableBackground).toHaveBeenCalledWith(
      fixture.gameCanvas.layers.backgroundLayer,
      null,
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    );

    runtime.destroy();
  });

  it('consumes store-owned world layout during init when gameDef already exists in store state', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(
      makeRenderModel(['zone:deck', 'zone:burn', 'zone:hand:p1']),
      makeWorldLayout(['zone:deck', 'zone:burn', 'zone:hand:p1']),
    );
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn', 'zone:hand:p1']);
    store.setState({ gameDef });

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenCalledWith(
      store.getState().worldLayout,
      ['zone:deck', 'zone:burn', 'zone:hand:p1'],
    );

    runtime.destroy();
  });

  it('routes animation control state to animation controller', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.animationController.setSpeed).toHaveBeenCalledWith(1);
    expect(fixture.animationController.resume).toHaveBeenCalledTimes(1);

    store.getState().setAnimationPlaybackSpeed('4x');
    store.getState().setAnimationPaused(true);
    store.getState().requestAnimationSkipCurrent();
    await flushMicrotasks();

    expect(fixture.animationController.setSpeed).toHaveBeenLastCalledWith(4);
    expect(fixture.animationController.pause).toHaveBeenCalledTimes(1);
    expect(fixture.animationController.skipCurrent).toHaveBeenCalledTimes(1);

    runtime.destroy();
  });

  it('publishes diagnostic buffer at runtime init', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const onAnimationDiagnosticBufferChange = vi.fn();
    const diagnosticBuffer = {
      downloadAsJson: vi.fn(),
    } as unknown as DiagnosticBuffer;
    fixture.animationController.getDiagnosticBuffer.mockReturnValue(diagnosticBuffer);

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onAnimationDiagnosticBufferChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.animationController.getDiagnosticBuffer).toHaveBeenCalledTimes(1);
    expect(onAnimationDiagnosticBufferChange).toHaveBeenNthCalledWith(1, diagnosticBuffer);

    runtime.destroy();
    expect(onAnimationDiagnosticBufferChange).toHaveBeenCalledTimes(1);
  });

  it('routes reduced-motion updates to animation controller', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x0,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    fixture.emitReducedMotionChange(true);
    fixture.emitReducedMotionChange(false);

    expect(fixture.animationController.setReducedMotion).toHaveBeenNthCalledWith(1, false);
    expect(fixture.animationController.setReducedMotion).toHaveBeenNthCalledWith(2, true);
    expect(fixture.animationController.setReducedMotion).toHaveBeenNthCalledWith(3, false);

    runtime.destroy();
  });

  it('announces phase label changes through aria live region text', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    store.setState({
      renderModel: {
        ...makeRenderModel(['zone:a']),
        phaseName: 'setup',
        phaseDisplayName: 'Setup',
      } as unknown as NonNullable<GameStore['renderModel']>,
    });
    store.setState({
      renderModel: {
        ...makeRenderModel(['zone:a']),
        phaseName: 'setup',
        phaseDisplayName: 'Setup',
      } as unknown as NonNullable<GameStore['renderModel']>,
    });
    store.setState({
      renderModel: {
        ...makeRenderModel(['zone:a']),
        phaseName: 'action-round',
        phaseDisplayName: '',
      } as unknown as NonNullable<GameStore['renderModel']>,
    });

    expect(fixture.ariaAnnouncer.announce).toHaveBeenNthCalledWith(1, 'Phase: Setup');
    expect(fixture.ariaAnnouncer.announce).toHaveBeenNthCalledWith(2, 'Phase: action-round');
    expect(fixture.ariaAnnouncer.announce).toHaveBeenCalledTimes(2);

    runtime.destroy();
  });

  it('tears down in strict order and clears hover anchor', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x111111,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    runtime.destroy();

    expect(fixture.lifecycle).toEqual([
      'updater-start',
      'animation-controller-start',
      'action-announcement-presenter-start',
      'ai-playback-controller-start',
      'reduced-motion-destroy',
      'keyboard-cleanup',
      'action-announcement-presenter-destroy',
      'action-announcement-renderer-destroy',
      'ai-playback-controller-destroy',
      'animation-controller-destroy',
      'aria-destroy',
      'updater-destroy',
      'zone-renderer-destroy',
      'adjacency-renderer-destroy',
      'connection-route-renderer-destroy',
      'token-renderer-destroy',
      'table-overlay-renderer-destroy',
      'viewport-destroy',
      'render-health-probe-destroy',
      'game-canvas-destroy',
    ]);
    expect(fixture.keyboardCleanup).toHaveBeenCalledTimes(1);
    expect(fixture.ariaAnnouncer.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.viewportEvents.off).toHaveBeenCalledWith('moved', expect.any(Function));
    expect(fixture.gameCanvas.app.canvas.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(fixture.gameCanvas.app.canvas.addEventListener).toHaveBeenCalledWith('pointerleave', expect.any(Function));
    expect(fixture.gameCanvas.app.canvas.removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(fixture.gameCanvas.app.canvas.removeEventListener).toHaveBeenCalledWith('pointerleave', expect.any(Function));
    expect(onHoverAnchorChange).toHaveBeenLastCalledWith(null);
  });

  it('uses provided keyboard coordinator instead of attaching a second document listener', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const coordinatorCleanup = vi.fn(() => {
      fixture.lifecycle.push('keyboard-cleanup');
    });
    const register = vi.fn(() => coordinatorCleanup);
    const keyboardCoordinator = {
      register,
      destroy: vi.fn(),
    };

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x111111,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        keyboardCoordinator,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(register).toHaveBeenCalledTimes(1);
    expect(fixture.attachKeyboardSelect).not.toHaveBeenCalled();

    runtime.destroy();
    expect(coordinatorCleanup).toHaveBeenCalledTimes(1);
  });

  it('emits explicit screen-space hover anchors on enter/leave', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x111111,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const tokenHandlerCall = fixture.attachTokenSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
      onHoverLeave?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;
    const tokenHoverOptions = tokenHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'token'; id: string }) => void;
      onHoverLeave?: (target: { kind: 'token'; id: string }) => void;
    } | undefined;

    zoneHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    zoneHoverOptions?.onHoverLeave?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    tokenHoverOptions?.onHoverEnter?.({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();
    tokenHoverOptions?.onHoverLeave?.({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, {
      target: { kind: 'zone', id: 'zone:a' },
      rect: {
        x: 100,
        y: 200,
        width: 180,
        height: 110,
        left: 100,
        top: 200,
        right: 280,
        bottom: 310,
      },
      space: 'screen',
      version: 1,
    });
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(2, null);
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(3, {
      target: { kind: 'token', id: 'token:1' },
      rect: {
        x: 100,
        y: 200,
        width: 180,
        height: 110,
        left: 100,
        top: 200,
        right: 280,
        bottom: 310,
      },
      space: 'screen',
      version: 2,
    });
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(4, null);

    runtime.destroy();
  });

  it('refreshes anchor while viewport transform changes with stable hover target', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;

    zoneHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    fixture.setNextScreenRect({ x: 160, y: 260, width: 180, height: 110 });
    fixture.emitViewportMoved();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      space: 'screen',
      version: 1,
    }));
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(2, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      rect: expect.objectContaining({
        x: 160,
        y: 260,
        width: 180,
        height: 110,
      }),
      space: 'screen',
      version: 2,
    }));

    runtime.destroy();
  });

  it('clears hover anchor when the pointer leaves the canvas element', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x1,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;

    zoneHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    fixture.emitCanvasPointerLeave();
    await flushMicrotasks();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      version: 1,
    }));
    expect(onHoverAnchorChange).toHaveBeenLastCalledWith(null);

    runtime.destroy();
  });

  it('clears hover state when the viewport moves while dragging', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x2,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;

    zoneHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    fixture.viewportEvents.moving = true;
    fixture.emitViewportMoved();
    await flushMicrotasks();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      version: 1,
    }));
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(2, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      version: 2,
    }));
    expect(onHoverAnchorChange).toHaveBeenLastCalledWith(null);

    runtime.destroy();
  });

  it('keeps hover anchor stable across overlapping zone/token leave ordering', async () => {
    const fixture = createRuntimeFixture();
    const onHoverAnchorChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x232323,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onHoverAnchorChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const tokenHandlerCall = fixture.attachTokenSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'zone'; id: string }) => void;
      onHoverLeave?: (target: { kind: 'zone'; id: string }) => void;
    } | undefined;
    const tokenHoverOptions = tokenHandlerCall?.[4] as {
      onHoverEnter?: (target: { kind: 'token'; id: string }) => void;
      onHoverLeave?: (target: { kind: 'token'; id: string }) => void;
    } | undefined;

    zoneHoverOptions?.onHoverEnter?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    tokenHoverOptions?.onHoverEnter?.({ kind: 'token', id: 'token:1' });
    zoneHoverOptions?.onHoverLeave?.({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();

    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(1, expect.objectContaining({
      target: { kind: 'zone', id: 'zone:a' },
      version: 1,
    }));
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(2, expect.objectContaining({
      target: { kind: 'token', id: 'token:1' },
      version: 2,
    }));
    expect(onHoverAnchorChange).toHaveBeenCalledTimes(2);

    tokenHoverOptions?.onHoverLeave?.({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();
    expect(onHoverAnchorChange).toHaveBeenNthCalledWith(3, null);

    runtime.destroy();
  });

  it('does not refresh token rendering for GameDef faction color changes', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x232323,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    vi.clearAllMocks();

    store.setState({
      gameDef: {
        factions: [{ id: 'us', color: '#e63946', displayName: 'United States' }],
      } as unknown as GameDef,
    });

    expect(fixture.tokenRenderer.update).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('applies layout engine positions when GameDef zones become available', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:visible-only']));
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn', 'zone:hand:p1']);

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    store.setState({
      gameDef,
      worldLayout: makeWorldLayout(['zone:deck', 'zone:burn', 'zone:hand:p1']),
    });

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenCalledWith(expect.objectContaining({
      positions: expect.any(Map),
      bounds: expect.any(Object),
    }), [
      'zone:deck',
      'zone:burn',
      'zone:hand:p1',
    ]);
    expect(fixture.runtimeLayoutStore.setFallbackZoneIDs).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('applies layout positions during runtime creation when initial GameDef exists', async () => {
    const fixture = createRuntimeFixture();
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn', 'zone:hand:p1']);
    const store = createRuntimeStore(
      makeRenderModel(['zone:visible-only']),
      makeWorldLayout(['zone:deck', 'zone:burn', 'zone:hand:p1']),
    );
    store.setState({ gameDef });

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenCalledWith(expect.objectContaining({
      positions: expect.any(Map),
      bounds: expect.any(Object),
    }), ['zone:deck', 'zone:burn', 'zone:hand:p1']);
    expect(fixture.runtimeLayoutStore.setFallbackZoneIDs).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('recomputes and reapplies layout when GameDef changes', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const firstDef = makeGameDefWithZones(['zone:deck', 'zone:burn']);
    const secondDef = makeGameDefWithZones(['zone:alpha', 'zone:beta', 'zone:gamma']);

    store.setState({ gameDef: firstDef, worldLayout: makeWorldLayout(['zone:deck', 'zone:burn']) });
    store.setState({ gameDef: secondDef, worldLayout: makeWorldLayout(['zone:alpha', 'zone:beta', 'zone:gamma']) });

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenNthCalledWith(1, expect.any(Object), ['zone:deck', 'zone:burn']);
    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenNthCalledWith(2, expect.any(Object), ['zone:alpha', 'zone:beta', 'zone:gamma']);

    runtime.destroy();
  });

  it('keeps grid fallback from overriding layout while GameDef is active', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    store.setState({
      gameDef: makeGameDefWithZones(['zone:deck', 'zone:burn']),
      worldLayout: makeWorldLayout(['zone:deck', 'zone:burn']),
      renderModel: makeRenderModel(['zone:render-only-a', 'zone:render-only-b']),
    });

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenCalledTimes(1);
    expect(fixture.runtimeLayoutStore.setFallbackZoneIDs).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('restores grid fallback when GameDef is cleared', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn']);

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    store.setState({ gameDef, worldLayout: makeWorldLayout(['zone:deck', 'zone:burn']) });
    store.setState({ gameDef: null, worldLayout: null, renderModel: makeRenderModel(['zone:render-fallback']) });

    expect(fixture.runtimeLayoutStore.setActiveLayout).toHaveBeenCalledTimes(1);
    expect(fixture.runtimeLayoutStore.setFallbackZoneIDs).toHaveBeenCalledWith(['zone:render-fallback']);

    runtime.destroy();
  });

  it('unsubscribes world layout listener on destroy', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x454545,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    runtime.destroy();
    store.setState({
      gameDef: makeGameDefWithZones(['zone:deck', 'zone:burn']),
      worldLayout: makeWorldLayout(['zone:deck', 'zone:burn']),
    });

    expect(fixture.runtimeLayoutStore.setActiveLayout).not.toHaveBeenCalled();
  });

  it('remounts cleanly with paired updater start/destroy and no leaked zone subscriptions', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const first = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    first.destroy();

    const second = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x333333,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    second.destroy();

    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(2);
    expect(fixture.canvasUpdater.destroy).toHaveBeenCalledTimes(2);
    expect(fixture.animationController.start).toHaveBeenCalledTimes(2);
    expect(fixture.animationController.destroy).toHaveBeenCalledTimes(2);
    expect(fixture.aiPlaybackController.start).toHaveBeenCalledTimes(2);
    expect(fixture.aiPlaybackController.destroy).toHaveBeenCalledTimes(2);

    store.setState({ renderModel: makeRenderModel(['zone:a', 'zone:b']) });

    expect(fixture.runtimeLayoutStore.setFallbackZoneIDs).toHaveBeenCalledTimes(0);
  });

  it('continues runtime initialization when animation controller setup fails', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const failure = new Error('controller init failure');
    fixture.createAnimationController.mockImplementation(() => {
      throw failure;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // noop
    });

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x121212,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(runtime.coordinateBridge).toBe(fixture.bridge);
    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(1);
    expect(fixture.createAiPlaybackController).toHaveBeenCalledTimes(1);
    expect(fixture.aiPlaybackController.start).toHaveBeenCalledTimes(1);
    expect(store.getState().animationPlaying).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Animation controller initialization failed');

    runtime.destroy();
  });

  it('installs a ticker error fence and restores the original ticker callback on destroy', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const originalTick = fixture.gameCanvas.app.ticker._tick;

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    expect(fixture.gameCanvas.app.ticker._tick).not.toBe(originalTick);

    runtime.destroy();

    expect(fixture.gameCanvas.app.ticker._tick).toBe(originalTick);
  });

  it('forwards fatal ticker failures to onError after the crash threshold is reached', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const onError = vi.fn();
    const failure = new Error('ticker exploded');
    const originalTick = fixture.gameCanvas.app.ticker._tick;
    originalTick.mockImplementation(() => {
      throw failure;
    });

    await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x333333,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onError,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const wrappedTick = fixture.gameCanvas.app.ticker._tick as (...args: unknown[]) => unknown;

    expect(() => {
      wrappedTick();
      wrappedTick();
      wrappedTick();
    }).not.toThrow();

    expect(fixture.gameCanvas.app.ticker.stop).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
