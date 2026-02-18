import { useEffect, useRef, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';

import type { GameStore } from '../store/game-store';
import type { CoordinateBridge } from './coordinate-bridge';
import { createCoordinateBridge } from './coordinate-bridge';
import { createGameCanvas, type GameCanvas as PixiGameCanvas } from './create-app';
import { attachTokenSelectHandlers } from './interactions/token-select';
import { attachZoneSelectHandlers } from './interactions/zone-select';
import { createAriaAnnouncer } from './interactions/aria-announcer';
import { attachKeyboardSelect } from './interactions/keyboard-select';
import { createCanvasInteractionController } from './interactions/canvas-interaction-controller';
import { createPositionStore, type PositionStore } from './position-store';
import { createAdjacencyRenderer } from './renderers/adjacency-renderer';
import { ContainerPool } from './renderers/container-pool';
import { DefaultFactionColorProvider } from './renderers/faction-colors';
import type { AdjacencyRenderer, TokenRenderer, ZoneRenderer } from './renderers/renderer-types';
import { createTokenRenderer } from './renderers/token-renderer';
import { createZoneRenderer } from './renderers/zone-renderer';
import { createCanvasUpdater, type CanvasUpdater } from './canvas-updater';
import { setupViewport, type ViewportResult } from './viewport-setup';

const DEFAULT_BACKGROUND_COLOR = 0x0b1020;
const DEFAULT_WORLD_SIZE = 1;

interface SelectorSubscribeStore<TState> extends StoreApi<TState> {
  subscribe: {
    (listener: (state: TState, previousState: TState) => void): () => void;
    <TSelected>(
      selector: (state: TState) => TSelected,
      listener: (selectedState: TSelected, previousSelectedState: TSelected) => void,
      options?: {
        readonly equalityFn?: (a: TSelected, b: TSelected) => boolean;
        readonly fireImmediately?: boolean;
      },
    ): () => void;
  };
}

export interface GameCanvasProps {
  readonly store: StoreApi<GameStore>;
  readonly backgroundColor?: number;
  readonly onCoordinateBridgeReady?: (bridge: CoordinateBridge | null) => void;
  readonly onHoverTargetChange?: (target: HoveredCanvasTarget | null) => void;
  readonly onHoverBoundsResolverReady?: (resolver: HoverBoundsResolver | null) => void;
  readonly onError?: (error: unknown) => void;
}

export interface GameCanvasRuntime {
  readonly coordinateBridge: CoordinateBridge;
  destroy(): void;
}

interface GameCanvasRuntimeOptions {
  readonly container: HTMLElement;
  readonly store: StoreApi<GameStore>;
  readonly backgroundColor: number;
  readonly onCoordinateBridgeReady?: (bridge: CoordinateBridge | null) => void;
  readonly onHoverTargetChange?: (target: HoveredCanvasTarget | null) => void;
  readonly onHoverBoundsResolverReady?: (resolver: HoverBoundsResolver | null) => void;
}

interface GameCanvasRuntimeDeps {
  readonly createGameCanvas: typeof createGameCanvas;
  readonly setupViewport: typeof setupViewport;
  readonly createPositionStore: typeof createPositionStore;
  readonly createZoneRenderer: typeof createZoneRenderer;
  readonly createAdjacencyRenderer: typeof createAdjacencyRenderer;
  readonly createTokenRenderer: typeof createTokenRenderer;
  readonly createCanvasUpdater: typeof createCanvasUpdater;
  readonly createCoordinateBridge: typeof createCoordinateBridge;
  readonly createAriaAnnouncer: typeof createAriaAnnouncer;
  readonly attachZoneSelectHandlers: typeof attachZoneSelectHandlers;
  readonly attachTokenSelectHandlers: typeof attachTokenSelectHandlers;
  readonly attachKeyboardSelect: typeof attachKeyboardSelect;
}

const DEFAULT_RUNTIME_DEPS: GameCanvasRuntimeDeps = {
  createGameCanvas,
  setupViewport,
  createPositionStore,
  createZoneRenderer,
  createAdjacencyRenderer,
  createTokenRenderer,
  createCanvasUpdater,
  createCoordinateBridge,
  createAriaAnnouncer,
  attachZoneSelectHandlers,
  attachTokenSelectHandlers,
  attachKeyboardSelect,
};

export type HoveredCanvasTarget =
  | { readonly kind: 'zone'; readonly id: string }
  | { readonly kind: 'token'; readonly id: string };

export interface CanvasWorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type HoverBoundsResolver = (target: HoveredCanvasTarget) => CanvasWorldBounds | null;

const LIVE_REGION_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

export async function createGameCanvasRuntime(
  options: GameCanvasRuntimeOptions,
  deps: GameCanvasRuntimeDeps = DEFAULT_RUNTIME_DEPS,
): Promise<GameCanvasRuntime> {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const initialZoneIDs = selectZoneIDs(selectorStore.getState());
  const positionStore = deps.createPositionStore(initialZoneIDs);

  const gameCanvas = await deps.createGameCanvas(options.container, {
    backgroundColor: options.backgroundColor,
  });
  const accessibilityContainer = options.container.parentElement ?? options.container;
  const ariaAnnouncer = deps.createAriaAnnouncer(accessibilityContainer);
  const interactionController = createCanvasInteractionController(() => selectorStore.getState(), ariaAnnouncer);

  const viewportResult = createViewportResult(deps, gameCanvas, positionStore);
  const zonePool = new ContainerPool();

  const zoneRenderer = deps.createZoneRenderer(gameCanvas.layers.zoneLayer, zonePool, {
    bindSelection: (zoneContainer, zoneId, isSelectable) =>
      deps.attachZoneSelectHandlers(
        zoneContainer,
        zoneId,
        isSelectable,
        (target) => {
          interactionController.onSelectTarget(target);
        },
        {
          onHoverChange: (isHovered) => {
            options.onHoverTargetChange?.(isHovered ? { kind: 'zone', id: zoneId } : null);
          },
        },
      ),
  });

  const adjacencyRenderer = deps.createAdjacencyRenderer(gameCanvas.layers.adjacencyLayer);

  const tokenRenderer = deps.createTokenRenderer(gameCanvas.layers.tokenGroup, new DefaultFactionColorProvider(), {
    bindSelection: (tokenContainer, tokenId, isSelectable) =>
      deps.attachTokenSelectHandlers(
        tokenContainer,
        tokenId,
        isSelectable,
        (target) => {
          interactionController.onSelectTarget(target);
        },
        {
          onHoverChange: (isHovered) => {
            options.onHoverTargetChange?.(isHovered ? { kind: 'token', id: tokenId } : null);
          },
        },
      ),
  });

  const canvasUpdater = deps.createCanvasUpdater({
    store: options.store,
    positionStore,
    zoneRenderer,
    adjacencyRenderer,
    tokenRenderer,
    viewport: viewportResult,
  });

  const unsubscribeZoneIDs = selectorStore.subscribe(selectZoneIDs, (zoneIDs) => {
    positionStore.setZoneIDs(zoneIDs);
  }, { equalityFn: stringArraysEqual });
  const cleanupKeyboardSelect = deps.attachKeyboardSelect({
    getSelectableZoneIDs: () => interactionController.getSelectableZoneIDs(),
    getCurrentFocusedZoneID: () => interactionController.getFocusedZoneID(),
    onSelect: (zoneId) => {
      interactionController.onSelectTarget({ type: 'zone', id: zoneId });
    },
    onFocusChange: (zoneId) => {
      interactionController.onFocusChange(zoneId);
    },
    onFocusAnnounce: (zoneId) => {
      interactionController.onFocusAnnounce(zoneId);
    },
  });

  canvasUpdater.start();

  const coordinateBridge = deps.createCoordinateBridge(viewportResult.viewport, gameCanvas.app.canvas);
  const hoverBoundsResolver: HoverBoundsResolver = (target) => {
    const containers = target.kind === 'zone' ? zoneRenderer.getContainerMap() : tokenRenderer.getContainerMap();
    const container = containers.get(target.id);
    if (container === undefined) {
      return null;
    }
    const bounds = container.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  };

  options.onCoordinateBridgeReady?.(coordinateBridge);
  options.onHoverBoundsResolverReady?.(hoverBoundsResolver);

  let destroyed = false;

  return {
    coordinateBridge,
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;

      options.onCoordinateBridgeReady?.(null);
      options.onHoverTargetChange?.(null);
      options.onHoverBoundsResolverReady?.(null);
      unsubscribeZoneIDs();
      cleanupKeyboardSelect();
      ariaAnnouncer.destroy();
      destroyCanvasPipeline(canvasUpdater, zoneRenderer, adjacencyRenderer, tokenRenderer, zonePool, viewportResult, gameCanvas);
    },
  };
}

export function GameCanvas({
  store,
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  onCoordinateBridgeReady,
  onHoverTargetChange,
  onHoverBoundsResolverReady,
  onError,
}: GameCanvasProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    let cancelled = false;
    let runtime: GameCanvasRuntime | null = null;

    const runtimeOptions: GameCanvasRuntimeOptions = {
      container,
      store,
      backgroundColor,
      ...(onCoordinateBridgeReady === undefined ? {} : { onCoordinateBridgeReady }),
      ...(onHoverTargetChange === undefined ? {} : { onHoverTargetChange }),
      ...(onHoverBoundsResolverReady === undefined ? {} : { onHoverBoundsResolverReady }),
    };

    void createGameCanvasRuntime(runtimeOptions).then((createdRuntime) => {
      if (cancelled) {
        createdRuntime.destroy();
        return;
      }
      runtime = createdRuntime;
    }).catch((error: unknown) => {
      if (!cancelled) {
        onCoordinateBridgeReady?.(null);
        onHoverTargetChange?.(null);
        onHoverBoundsResolverReady?.(null);
        onError?.(error);
      }
    });

    return () => {
      cancelled = true;
      runtime?.destroy();
    };
  }, [
    store,
    backgroundColor,
    onCoordinateBridgeReady,
    onHoverTargetChange,
    onHoverBoundsResolverReady,
    onError,
  ]);

  return (
    <div ref={rootRef}>
      <div ref={containerRef} role="application" aria-label="Game board" />
      <div
        data-ludoforge-live-region="true"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={LIVE_REGION_STYLE}
      />
    </div>
  );
}

function destroyCanvasPipeline(
  canvasUpdater: CanvasUpdater,
  zoneRenderer: ZoneRenderer,
  adjacencyRenderer: AdjacencyRenderer,
  tokenRenderer: TokenRenderer,
  zonePool: ContainerPool,
  viewportResult: ViewportResult,
  gameCanvas: PixiGameCanvas,
): void {
  canvasUpdater.destroy();
  zoneRenderer.destroy();
  adjacencyRenderer.destroy();
  tokenRenderer.destroy();
  zonePool.destroyAll();
  viewportResult.destroy();
  gameCanvas.destroy();
}

function createViewportResult(
  deps: GameCanvasRuntimeDeps,
  gameCanvas: PixiGameCanvas,
  positionStore: PositionStore,
): ViewportResult {
  const snapshot = positionStore.getSnapshot();
  const worldWidth = Math.max(DEFAULT_WORLD_SIZE, snapshot.bounds.maxX - snapshot.bounds.minX);
  const worldHeight = Math.max(DEFAULT_WORLD_SIZE, snapshot.bounds.maxY - snapshot.bounds.minY);

  return deps.setupViewport({
    stage: gameCanvas.app.stage,
    layers: gameCanvas.layers,
    screenWidth: gameCanvas.app.renderer.screen.width,
    screenHeight: gameCanvas.app.renderer.screen.height,
    worldWidth,
    worldHeight,
    events: gameCanvas.app.renderer.events,
    minScale: 0.2,
    maxScale: 4,
  });
}

function selectZoneIDs(state: GameStore): readonly string[] {
  const zones = state.renderModel?.zones;
  if (zones === undefined || zones.length === 0) {
    return [];
  }

  return zones.map((zone) => zone.id);
}

function stringArraysEqual(prev: readonly string[], next: readonly string[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) {
      return false;
    }
  }

  return true;
}
