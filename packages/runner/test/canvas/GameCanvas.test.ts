import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { GameCanvas, createGameCanvasRuntime } from '../../src/canvas/GameCanvas';
import type { CoordinateBridge } from '../../src/canvas/coordinate-bridge';
import type { GameStore } from '../../src/store/game-store';
import { getOrComputeLayout } from '../../src/layout/layout-cache.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';

vi.mock('../../src/layout/layout-cache.js', () => ({
  getOrComputeLayout: vi.fn(),
}));

interface RuntimeStoreState {
  readonly renderModel: GameStore['renderModel'];
  readonly gameDef: GameDef | null;
  readonly animationPlaying: boolean;
  readonly animationPlaybackSpeed: GameStore['animationPlaybackSpeed'];
  readonly animationPaused: boolean;
  readonly animationSkipRequestToken: number;
  chooseOne(choice: string): void;
  setAnimationPlaying(playing: boolean): void;
  setAnimationPlaybackSpeed(speed: GameStore['animationPlaybackSpeed']): void;
  setAnimationPaused(paused: boolean): void;
  requestAnimationSkipCurrent(): void;
}

function createRuntimeStore(initialRenderModel: GameStore['renderModel']): StoreApi<RuntimeStoreState> {
  let store!: StoreApi<RuntimeStoreState>;
  store = createStore<RuntimeStoreState>()(
    subscribeWithSelector((): RuntimeStoreState => ({
      renderModel: initialRenderModel,
      gameDef: null,
      animationPlaying: false,
      animationPlaybackSpeed: '1x',
      animationPaused: false,
      animationSkipRequestToken: 0,
      chooseOne: (_choice: string) => {},
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

function createRuntimeFixture() {
  const lifecycle: string[] = [];
  let movedListener: (() => void) | null = null;

  const positionStore = {
    getSnapshot: vi.fn(() => ({
      zoneIDs: ['zone:a'],
      positions: new Map([['zone:a', { x: 0, y: 0 }]]),
      bounds: { minX: 0, minY: 0, maxX: 400, maxY: 300 },
    })),
    setZoneIDs: vi.fn(),
    setPositions: vi.fn(),
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
  const tokenContainer = {
    getBounds: vi.fn(() => ({ x: 40, y: 60, width: 28, height: 28 })),
  };
  const zoneContainerMap = new Map([['zone:a', zoneContainer]]);
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
    destroy: vi.fn(() => {
      lifecycle.push('adjacency-renderer-destroy');
    }),
  };

  const tokenRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => tokenContainerMap),
    destroy: vi.fn(() => {
      lifecycle.push('token-renderer-destroy');
    }),
  };

  const viewportEvents = {
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'moved') {
        movedListener = listener;
      }
    }),
    off: vi.fn((event: string, listener: () => void) => {
      if (event === 'moved' && movedListener === listener) {
        movedListener = null;
      }
    }),
  };

  const viewportResult = {
    viewport: viewportEvents as never,
    worldLayers: [],
    updateWorldBounds: vi.fn(),
    destroy: vi.fn(() => {
      lifecycle.push('viewport-destroy');
    }),
  };

  const gameCanvas = {
    app: {
      stage: {} as never,
      renderer: {
        screen: { width: 1024, height: 768 },
        events: {} as never,
      },
      canvas: {} as HTMLCanvasElement,
    },
    layers: {
      boardGroup: {} as never,
      adjacencyLayer: {} as never,
      zoneLayer: {} as never,
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
  };
  const aiPlaybackController = {
    start: vi.fn(() => {
      lifecycle.push('ai-playback-controller-start');
    }),
    destroy: vi.fn(() => {
      lifecycle.push('ai-playback-controller-destroy');
    }),
  };

  const attachKeyboardSelect = vi.fn(() => keyboardCleanup);
  const attachZoneSelectHandlers = vi.fn(() => vi.fn());
  const attachTokenSelectHandlers = vi.fn(() => vi.fn());
  const createAnimationController = vi.fn(() => animationController);
  const createAiPlaybackController = vi.fn(() => aiPlaybackController);
  const createReducedMotionObserver = vi.fn(() => reducedMotionObserver);

  const deps = {
    createGameCanvas: vi.fn(async () => gameCanvas),
    setupViewport: vi.fn(() => viewportResult),
    createPositionStore: vi.fn(() => positionStore),
    createZoneRenderer: vi.fn((_parent, _pool, options: { bindSelection?: (zoneContainer: unknown, zoneId: string, isSelectable: () => boolean) => () => void }) => {
      options.bindSelection?.(zoneContainer, 'zone:a', () => true);
      return zoneRenderer;
    }),
    createAdjacencyRenderer: vi.fn(() => adjacencyRenderer),
    createTokenRenderer: vi.fn((_parent, _colors, options: { bindSelection?: (tokenContainer: unknown, tokenId: string, isSelectable: () => boolean) => () => void }) => {
      options.bindSelection?.(tokenContainer, 'token:1', () => true);
      return tokenRenderer;
    }),
    createCanvasUpdater: vi.fn(() => canvasUpdater),
    createCoordinateBridge: vi.fn(() => bridge),
    createAnimationController,
    createAiPlaybackController,
    createReducedMotionObserver,
    createAriaAnnouncer: vi.fn(() => ariaAnnouncer),
    attachZoneSelectHandlers,
    attachTokenSelectHandlers,
    attachKeyboardSelect,
  };

  return {
    lifecycle,
    deps,
    bridge,
    canvasUpdater,
    zoneRenderer,
    adjacencyRenderer,
    tokenRenderer,
    viewportResult,
    gameCanvas,
    positionStore,
    animationController,
    aiPlaybackController,
    createAnimationController,
    createAiPlaybackController,
    createReducedMotionObserver,
    ariaAnnouncer,
    attachZoneSelectHandlers,
    attachTokenSelectHandlers,
    attachKeyboardSelect,
    keyboardCleanup,
    zoneContainerMap,
    tokenContainerMap,
    viewportEvents,
    emitViewportMoved: () => {
      movedListener?.();
    },
    emitReducedMotionChange: (next: boolean) => {
      reducedMotion = next;
      reducedMotionListener?.(next);
    },
    setNextScreenRect: (rect: { x: number; y: number; width: number; height: number }) => {
      nextRect = rect;
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

const mockedGetOrComputeLayout = vi.mocked(getOrComputeLayout);
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
    mockedGetOrComputeLayout.mockReset();
    mockedGetOrComputeLayout.mockReturnValue({
      mode: 'table',
      positionMap: {
        positions: new Map([
          ['zone:deck', { x: 40, y: 60 }],
          ['zone:burn', { x: 140, y: 60 }],
          ['zone:hand:p1', { x: 240, y: 60 }],
        ]),
        bounds: {
          minX: 0,
          minY: 0,
          maxX: 320,
          maxY: 120,
        },
      },
    });
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
    expect(fixture.deps.createTokenRenderer).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createCanvasUpdater).toHaveBeenCalledTimes(1);
    expect(fixture.deps.createAriaAnnouncer).toHaveBeenCalledTimes(1);
    expect(fixture.createAnimationController).toHaveBeenCalledTimes(1);
    expect(fixture.animationController.start).toHaveBeenCalledTimes(1);
    expect(fixture.createReducedMotionObserver).toHaveBeenCalledTimes(1);
    expect(fixture.animationController.setReducedMotion).toHaveBeenCalledWith(false);
    expect(fixture.createAiPlaybackController).toHaveBeenCalledTimes(1);
    expect(fixture.aiPlaybackController.start).toHaveBeenCalledTimes(1);
    expect(fixture.attachKeyboardSelect).toHaveBeenCalledTimes(1);
    expect(fixture.attachZoneSelectHandlers).toHaveBeenCalledTimes(1);
    expect(fixture.attachTokenSelectHandlers).toHaveBeenCalledTimes(1);
    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(1);
    expect(runtime.coordinateBridge).toBe(fixture.bridge);
    expect(fixture.viewportEvents.on).toHaveBeenCalledWith('moved', expect.any(Function));
    expect(onHoverAnchorChange).not.toHaveBeenCalled();

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
      'animation-controller-start',
      'ai-playback-controller-start',
      'updater-start',
      'reduced-motion-destroy',
      'keyboard-cleanup',
      'ai-playback-controller-destroy',
      'animation-controller-destroy',
      'aria-destroy',
      'updater-destroy',
      'zone-renderer-destroy',
      'adjacency-renderer-destroy',
      'token-renderer-destroy',
      'viewport-destroy',
      'game-canvas-destroy',
    ]);
    expect(fixture.keyboardCleanup).toHaveBeenCalledTimes(1);
    expect(fixture.ariaAnnouncer.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.viewportEvents.off).toHaveBeenCalledWith('moved', expect.any(Function));
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
    });

    expect(mockedGetOrComputeLayout).toHaveBeenCalledWith(gameDef, TEST_VISUAL_CONFIG_PROVIDER);
    expect(fixture.positionStore.setPositions).toHaveBeenCalledWith(expect.objectContaining({
      positions: expect.any(Map),
      bounds: expect.any(Object),
    }), [
      'zone:deck',
      'zone:burn',
      'zone:hand:p1',
    ]);
    expect(fixture.positionStore.setZoneIDs).not.toHaveBeenCalled();

    runtime.destroy();
  });

  it('applies layout positions during runtime creation when initial GameDef exists', async () => {
    const fixture = createRuntimeFixture();
    const gameDef = makeGameDefWithZones(['zone:deck', 'zone:burn', 'zone:hand:p1']);
    const store = createRuntimeStore(makeRenderModel(['zone:visible-only']));
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

    expect(mockedGetOrComputeLayout).toHaveBeenCalledWith(gameDef, TEST_VISUAL_CONFIG_PROVIDER);
    expect(fixture.positionStore.setPositions).toHaveBeenCalledWith(expect.objectContaining({
      positions: expect.any(Map),
      bounds: expect.any(Object),
    }), ['zone:deck', 'zone:burn', 'zone:hand:p1']);
    expect(fixture.positionStore.setZoneIDs).not.toHaveBeenCalled();

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

    store.setState({ gameDef: firstDef });
    store.setState({ gameDef: secondDef });

    expect(mockedGetOrComputeLayout).toHaveBeenNthCalledWith(1, firstDef, TEST_VISUAL_CONFIG_PROVIDER);
    expect(mockedGetOrComputeLayout).toHaveBeenNthCalledWith(2, secondDef, TEST_VISUAL_CONFIG_PROVIDER);
    expect(fixture.positionStore.setPositions).toHaveBeenNthCalledWith(1, expect.any(Object), ['zone:deck', 'zone:burn']);
    expect(fixture.positionStore.setPositions).toHaveBeenNthCalledWith(2, expect.any(Object), ['zone:alpha', 'zone:beta', 'zone:gamma']);

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
      renderModel: makeRenderModel(['zone:render-only-a', 'zone:render-only-b']),
    });

    expect(fixture.positionStore.setPositions).toHaveBeenCalledTimes(1);
    expect(fixture.positionStore.setZoneIDs).not.toHaveBeenCalled();

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

    store.setState({ gameDef });
    store.setState({ gameDef: null, renderModel: makeRenderModel(['zone:render-fallback']) });

    expect(fixture.positionStore.setPositions).toHaveBeenCalledTimes(1);
    expect(fixture.positionStore.setZoneIDs).toHaveBeenCalledWith(['zone:render-fallback']);

    runtime.destroy();
  });

  it('unsubscribes GameDef layout listener on destroy', async () => {
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
    store.setState({ gameDef: makeGameDefWithZones(['zone:deck', 'zone:burn']) });

    expect(mockedGetOrComputeLayout).not.toHaveBeenCalled();
    expect(fixture.positionStore.setPositions).not.toHaveBeenCalled();
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

    const second = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x333333,
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    first.destroy();
    second.destroy();

    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(2);
    expect(fixture.canvasUpdater.destroy).toHaveBeenCalledTimes(2);
    expect(fixture.animationController.start).toHaveBeenCalledTimes(2);
    expect(fixture.animationController.destroy).toHaveBeenCalledTimes(2);
    expect(fixture.aiPlaybackController.start).toHaveBeenCalledTimes(2);
    expect(fixture.aiPlaybackController.destroy).toHaveBeenCalledTimes(2);

    store.setState({ renderModel: makeRenderModel(['zone:a', 'zone:b']) });

    expect(fixture.positionStore.setZoneIDs).toHaveBeenCalledTimes(0);
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
});
