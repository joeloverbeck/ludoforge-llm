import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

import { GameCanvas, createGameCanvasRuntime } from '../../src/canvas/GameCanvas';
import type { CoordinateBridge } from '../../src/canvas/coordinate-bridge';
import type { GameStore } from '../../src/store/game-store';

interface RuntimeStoreState {
  readonly renderModel: GameStore['renderModel'];
  chooseOne(choice: string): void;
}

function createRuntimeStore(initialRenderModel: GameStore['renderModel']): StoreApi<RuntimeStoreState> {
  return createStore<RuntimeStoreState>()(
    subscribeWithSelector(() => ({
      renderModel: initialRenderModel,
      chooseOne: (_choice: string) => {},
    })),
  );
}

function makeRenderModel(zoneIds: readonly string[]): GameStore['renderModel'] {
  return {
    zones: zoneIds.map((id) => ({ id })),
  } as unknown as NonNullable<GameStore['renderModel']>;
}

function createRuntimeFixture() {
  const lifecycle: string[] = [];

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

  const viewportResult = {
    viewport: {} as never,
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

  const bridge = {
    canvasToScreen: vi.fn(),
    screenToCanvas: vi.fn(),
    worldBoundsToScreenRect: vi.fn(),
  } as CoordinateBridge;

  const ariaAnnouncer = {
    announce: vi.fn((message: string) => {
      lifecycle.push(`announce:${message}`);
    }),
    destroy: vi.fn(() => {
      lifecycle.push('aria-destroy');
    }),
  };

  const keyboardCleanup = vi.fn(() => {
    lifecycle.push('keyboard-cleanup');
  });

  const attachKeyboardSelect = vi.fn(() => keyboardCleanup);
  const attachZoneSelectHandlers = vi.fn(() => vi.fn());
  const attachTokenSelectHandlers = vi.fn(() => vi.fn());

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
    ariaAnnouncer,
    attachZoneSelectHandlers,
    attachTokenSelectHandlers,
    attachKeyboardSelect,
    keyboardCleanup,
    zoneContainerMap,
    tokenContainerMap,
  };
}

describe('GameCanvas', () => {
  it('renders an accessible game board container', () => {
    const html = renderToStaticMarkup(
      createElement(GameCanvas, {
        store: createRuntimeStore(null) as unknown as StoreApi<GameStore>,
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
  it('initializes canvas pipeline and emits coordinate bridge', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a', 'zone:b']));
    const onCoordinateBridgeReady = vi.fn();
    const onHoverBoundsResolverReady = vi.fn();

    await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x000000,
        onCoordinateBridgeReady,
        onHoverBoundsResolverReady,
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
    expect(fixture.attachKeyboardSelect).toHaveBeenCalledTimes(1);
    expect(fixture.attachZoneSelectHandlers).toHaveBeenCalledTimes(1);
    expect(fixture.attachTokenSelectHandlers).toHaveBeenCalledTimes(1);
    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(1);
    expect(onCoordinateBridgeReady).toHaveBeenCalledWith(fixture.bridge);
    expect(onHoverBoundsResolverReady).toHaveBeenCalledWith(expect.any(Function));
  });

  it('tears down in strict order and clears coordinate bridge', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));
    const onCoordinateBridgeReady = vi.fn();
    const onHoverTargetChange = vi.fn();
    const onHoverBoundsResolverReady = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x111111,
        onCoordinateBridgeReady,
        onHoverTargetChange,
        onHoverBoundsResolverReady,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    runtime.destroy();

    expect(fixture.lifecycle).toEqual([
      'updater-start',
      'keyboard-cleanup',
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
    expect(onCoordinateBridgeReady).toHaveBeenLastCalledWith(null);
    expect(onHoverTargetChange).toHaveBeenLastCalledWith(null);
    expect(onHoverBoundsResolverReady).toHaveBeenLastCalledWith(null);
  });

  it('forwards hover enter and leave from zone and token handlers', async () => {
    const fixture = createRuntimeFixture();
    const onHoverTargetChange = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x111111,
        onHoverTargetChange,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const zoneHandlerCall = fixture.attachZoneSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const tokenHandlerCall = fixture.attachTokenSelectHandlers.mock.calls[0] as unknown[] | undefined;
    const zoneHoverOptions = zoneHandlerCall?.[4] as { onHoverChange?: (isHovered: boolean) => void } | undefined;
    const tokenHoverOptions = tokenHandlerCall?.[4] as { onHoverChange?: (isHovered: boolean) => void } | undefined;

    zoneHoverOptions?.onHoverChange?.(true);
    zoneHoverOptions?.onHoverChange?.(false);
    tokenHoverOptions?.onHoverChange?.(true);
    tokenHoverOptions?.onHoverChange?.(false);

    expect(onHoverTargetChange).toHaveBeenNthCalledWith(1, { kind: 'zone', id: 'zone:a' });
    expect(onHoverTargetChange).toHaveBeenNthCalledWith(2, null);
    expect(onHoverTargetChange).toHaveBeenNthCalledWith(3, { kind: 'token', id: 'token:1' });
    expect(onHoverTargetChange).toHaveBeenNthCalledWith(4, null);

    runtime.destroy();
  });

  it('emits a world-bounds resolver for hovered entities', async () => {
    const fixture = createRuntimeFixture();
    const onHoverBoundsResolverReady = vi.fn();

    const runtime = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: createRuntimeStore(makeRenderModel(['zone:a'])) as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
        onHoverBoundsResolverReady,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const resolver = onHoverBoundsResolverReady.mock.calls[0]?.[0] as
      | ((target: { kind: 'zone' | 'token'; id: string }) => { x: number; y: number; width: number; height: number } | null)
      | undefined;

    expect(resolver?.({ kind: 'zone', id: 'zone:a' })).toEqual({ x: 10, y: 20, width: 180, height: 110 });
    expect(resolver?.({ kind: 'token', id: 'token:1' })).toEqual({ x: 40, y: 60, width: 28, height: 28 });
    expect(resolver?.({ kind: 'zone', id: 'zone:missing' })).toBeNull();

    fixture.zoneContainerMap.delete('zone:a');
    expect(resolver?.({ kind: 'zone', id: 'zone:a' })).toBeNull();

    runtime.destroy();
  });

  it('remounts cleanly with paired updater start/destroy and no leaked zone subscriptions', async () => {
    const fixture = createRuntimeFixture();
    const store = createRuntimeStore(makeRenderModel(['zone:a']));

    const first = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x222222,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    const second = await createGameCanvasRuntime(
      {
        container: {} as HTMLElement,
        store: store as unknown as StoreApi<GameStore>,
        backgroundColor: 0x333333,
      },
      fixture.deps as unknown as Parameters<typeof createGameCanvasRuntime>[1],
    );

    first.destroy();
    second.destroy();

    expect(fixture.canvasUpdater.start).toHaveBeenCalledTimes(2);
    expect(fixture.canvasUpdater.destroy).toHaveBeenCalledTimes(2);

    store.setState({ renderModel: makeRenderModel(['zone:a', 'zone:b']) });

    expect(fixture.positionStore.setZoneIDs).toHaveBeenCalledTimes(0);
  });
});
