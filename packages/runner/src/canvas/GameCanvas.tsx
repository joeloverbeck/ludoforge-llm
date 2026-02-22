import { useEffect, useRef, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';

import type { KeyboardCoordinator } from '../input/keyboard-coordinator.js';
import type { AnimationPlaybackSpeed } from '../animation/animation-types.js';
import type { DiagnosticBuffer } from '../animation/diagnostic-buffer.js';
import type { GameStore } from '../store/game-store';
import { createAnimationController, type AnimationController } from '../animation/animation-controller.js';
import { createAiPlaybackController, type AiPlaybackController } from '../animation/ai-playback.js';
import { createReducedMotionObserver, type ReducedMotionObserver } from '../animation/reduced-motion.js';
import type { CoordinateBridge } from './coordinate-bridge';
import { createCoordinateBridge } from './coordinate-bridge';
import type { CanvasWorldBounds, HoverAnchor, HoveredCanvasTarget } from './hover-anchor-contract';
import { createGameCanvas, type GameCanvas as PixiGameCanvas } from './create-app';
import { attachTokenSelectHandlers } from './interactions/token-select';
import { attachZoneSelectHandlers } from './interactions/zone-select';
import { createAriaAnnouncer } from './interactions/aria-announcer';
import { attachKeyboardSelect, handleKeyboardSelectKeyDown } from './interactions/keyboard-select';
import { createCanvasInteractionController } from './interactions/canvas-interaction-controller';
import { createHoverTargetController } from './interactions/hover-target-controller';
import { createPositionStore, type PositionStore } from './position-store';
import { createAdjacencyRenderer } from './renderers/adjacency-renderer';
import { ContainerPool } from './renderers/container-pool';
import { VisualConfigFactionColorProvider } from './renderers/faction-colors';
import type { AdjacencyRenderer, TableOverlayRenderer, TokenRenderer, ZoneRenderer } from './renderers/renderer-types';
import { createTableOverlayRenderer } from './renderers/table-overlay-renderer.js';
import { createTokenRenderer } from './renderers/token-renderer';
import { drawTableBackground } from './renderers/table-background-renderer.js';
import { createZoneRenderer } from './renderers/zone-renderer';
import {
  createActionAnnouncementRenderer,
  type ActionAnnouncementRenderer,
} from './renderers/action-announcement-renderer.js';
import { createCanvasUpdater, type CanvasUpdater } from './canvas-updater';
import { setupViewport, type ViewportResult } from './viewport-setup';
import { getOrComputeLayout } from '../layout/layout-cache.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { EMPTY_INTERACTION_HIGHLIGHTS, type InteractionHighlights } from './interaction-highlights.js';

const DEFAULT_BACKGROUND_COLOR = 0x0b1020;
const DEFAULT_WORLD_SIZE = 1;
const EMPTY_TABLE_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 } as const;

const ANIMATION_PLAYBACK_SPEED_MULTIPLIERS: Readonly<Record<AnimationPlaybackSpeed, number>> = {
  '1x': 1,
  '2x': 2,
  '4x': 4,
};

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
  readonly visualConfigProvider: VisualConfigProvider;
  readonly backgroundColor?: number;
  readonly keyboardCoordinator?: KeyboardCoordinator;
  readonly interactionHighlights?: InteractionHighlights;
  readonly onHoverAnchorChange?: (anchor: HoverAnchor | null) => void;
  readonly onAnimationDiagnosticBufferChange?: (buffer: DiagnosticBuffer | null) => void;
  readonly onError?: (error: unknown) => void;
}

export interface GameCanvasRuntime {
  readonly coordinateBridge: CoordinateBridge;
  setInteractionHighlights(highlights: InteractionHighlights): void;
  destroy(): void;
}

interface GameCanvasRuntimeOptions {
  readonly container: HTMLElement;
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly backgroundColor: number;
  readonly keyboardCoordinator?: KeyboardCoordinator;
  readonly interactionHighlights?: InteractionHighlights;
  readonly onHoverAnchorChange?: (anchor: HoverAnchor | null) => void;
  readonly onAnimationDiagnosticBufferChange?: (buffer: DiagnosticBuffer | null) => void;
}

interface GameCanvasRuntimeDeps {
  readonly createGameCanvas: typeof createGameCanvas;
  readonly setupViewport: typeof setupViewport;
  readonly createPositionStore: typeof createPositionStore;
  readonly createZoneRenderer: typeof createZoneRenderer;
  readonly createAdjacencyRenderer: typeof createAdjacencyRenderer;
  readonly createTokenRenderer: typeof createTokenRenderer;
  readonly createTableOverlayRenderer: typeof createTableOverlayRenderer;
  readonly createActionAnnouncementRenderer: typeof createActionAnnouncementRenderer;
  readonly createCanvasUpdater: typeof createCanvasUpdater;
  readonly createCoordinateBridge: typeof createCoordinateBridge;
  readonly createAnimationController: typeof createAnimationController;
  readonly createAiPlaybackController: typeof createAiPlaybackController;
  readonly createReducedMotionObserver: typeof createReducedMotionObserver;
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
  createTableOverlayRenderer,
  createActionAnnouncementRenderer,
  createCanvasUpdater,
  createCoordinateBridge,
  createAnimationController,
  createAiPlaybackController,
  createReducedMotionObserver,
  createAriaAnnouncer,
  attachZoneSelectHandlers,
  attachTokenSelectHandlers,
  attachKeyboardSelect,
};

type HoverBoundsResolver = (target: HoveredCanvasTarget) => CanvasWorldBounds | null;

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
  let layersForBackground: PixiGameCanvas['layers'] | null = null;
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const initialState = selectorStore.getState();
  const initialZoneIDs = selectZoneIDs(initialState);
  const initialGameDef = initialState.gameDef;
  const positionStore = deps.createPositionStore(initialGameDef === null ? initialZoneIDs : []);

  const applyGameDefLayout = (gameDef: GameStore['gameDef']): void => {
    if (gameDef === null) {
      positionStore.setZoneIDs(selectZoneIDs(selectorStore.getState()));
      if (layersForBackground !== null) {
        drawTableBackground(layersForBackground.backgroundLayer, null, EMPTY_TABLE_BOUNDS);
      }
      return;
    }

    if (!Array.isArray(gameDef.zones)) {
      positionStore.setZoneIDs(selectZoneIDs(selectorStore.getState()));
      if (layersForBackground !== null) {
        drawTableBackground(layersForBackground.backgroundLayer, null, EMPTY_TABLE_BOUNDS);
      }
      return;
    }

    const layoutResult = getOrComputeLayout(gameDef, options.visualConfigProvider);
    const gameDefZoneIDs = gameDef.zones.map((zone) => zone.id);
    positionStore.setPositions(layoutResult.positionMap, gameDefZoneIDs);
    if (layersForBackground !== null) {
      drawTableBackground(
        layersForBackground.backgroundLayer,
        options.visualConfigProvider.getTableBackground(),
        layoutResult.boardBounds,
      );
    }
  };

  if (initialGameDef !== null) {
    applyGameDefLayout(initialGameDef);
  }

  const gameCanvas = await deps.createGameCanvas(options.container, {
    backgroundColor: options.backgroundColor,
  });
  layersForBackground = gameCanvas.layers;
  const currentGameDef = selectorStore.getState().gameDef;
  if (currentGameDef === null || !Array.isArray(currentGameDef.zones)) {
    drawTableBackground(gameCanvas.layers.backgroundLayer, null, EMPTY_TABLE_BOUNDS);
  } else {
    const layoutResult = getOrComputeLayout(currentGameDef, options.visualConfigProvider);
    drawTableBackground(
      gameCanvas.layers.backgroundLayer,
      options.visualConfigProvider.getTableBackground(),
      layoutResult.boardBounds,
    );
  }
  const accessibilityContainer = options.container.parentElement ?? options.container;
  const ariaAnnouncer = deps.createAriaAnnouncer(accessibilityContainer);
  const interactionController = createCanvasInteractionController(() => selectorStore.getState(), ariaAnnouncer);
  const hoverTargetController = createHoverTargetController({
    onTargetChange: () => {
      publishHoverAnchor();
    },
  });

  const viewportResult = createViewportResult(deps, gameCanvas, positionStore);
  const zonePool = new ContainerPool();
  let publishHoverAnchor: () => void = () => {};

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
          onHoverEnter: (target) => {
            hoverTargetController.onHoverEnter(target);
          },
          onHoverLeave: (target) => {
            hoverTargetController.onHoverLeave(target);
          },
        },
      ),
  });

  const adjacencyRenderer = deps.createAdjacencyRenderer(gameCanvas.layers.adjacencyLayer, options.visualConfigProvider);

  const factionColorProvider = new VisualConfigFactionColorProvider(options.visualConfigProvider);
  const tokenRenderer = deps.createTokenRenderer(gameCanvas.layers.tokenGroup, factionColorProvider, {
    bindSelection: (tokenContainer, tokenId, isSelectable) =>
      deps.attachTokenSelectHandlers(
        tokenContainer,
        tokenId,
        isSelectable,
        (target) => {
          interactionController.onSelectTarget(target);
        },
        {
          onHoverEnter: (target) => {
            hoverTargetController.onHoverEnter(target);
          },
          onHoverLeave: (target) => {
            hoverTargetController.onHoverLeave(target);
          },
        },
      ),
  });
  const tableOverlayRenderer = deps.createTableOverlayRenderer(
    gameCanvas.layers.tableOverlayLayer,
    options.visualConfigProvider,
  );
  const actionAnnouncementRenderer = deps.createActionAnnouncementRenderer({
    store: options.store,
    positionStore,
    parentContainer: gameCanvas.layers.effectsGroup,
  });

  const canvasUpdater = deps.createCanvasUpdater({
    store: options.store,
    positionStore,
    zoneRenderer,
    adjacencyRenderer,
    tokenRenderer,
    tableOverlayRenderer,
    viewport: viewportResult,
    getInteractionHighlights: () => options.interactionHighlights ?? EMPTY_INTERACTION_HIGHLIGHTS,
  });
  canvasUpdater.start();

  let animationController: AnimationController | null = null;
  let aiPlaybackController: AiPlaybackController | null = null;
  let actionAnnouncements: ActionAnnouncementRenderer | null = null;
  let reducedMotionObserver: ReducedMotionObserver | null = null;
  try {
    animationController = deps.createAnimationController({
      store: options.store,
      visualConfigProvider: options.visualConfigProvider,
      tokenContainers: () => tokenRenderer.getContainerMap(),
      tokenFaceControllers: () => tokenRenderer.getFaceControllerMap?.() ?? new Map(),
      zoneContainers: () => zoneRenderer.getContainerMap(),
      zonePositions: () => positionStore.getSnapshot(),
      ephemeralParent: () => gameCanvas.layers.effectsGroup,
    });
    animationController.start();

    reducedMotionObserver = deps.createReducedMotionObserver(options.container.ownerDocument?.defaultView ?? undefined);
    animationController.setReducedMotion(reducedMotionObserver.reduced);
  } catch (error) {
    selectorStore.getState().setAnimationPlaying(false);
    console.warn('Animation controller initialization failed. Continuing without animations.', error);
  }

  const applyAnimationSpeed = (speed: AnimationPlaybackSpeed): void => {
    animationController?.setSpeed(ANIMATION_PLAYBACK_SPEED_MULTIPLIERS[speed]);
  };
  const applyAnimationPaused = (paused: boolean): void => {
    if (paused) {
      animationController?.pause();
      return;
    }
    animationController?.resume();
  };
  applyAnimationSpeed(selectorStore.getState().animationPlaybackSpeed);
  applyAnimationPaused(selectorStore.getState().animationPaused);
  options.onAnimationDiagnosticBufferChange?.(animationController?.getDiagnosticBuffer() ?? null);

  try {
    actionAnnouncementRenderer.start();
    actionAnnouncements = actionAnnouncementRenderer;
  } catch (error) {
    console.warn('Action announcement renderer initialization failed. Continuing without AI action announcements.', error);
  }

  try {
    aiPlaybackController = deps.createAiPlaybackController({
      store: options.store,
      animation: {
        setDetailLevel: (level) => {
          animationController?.setDetailLevel(level);
        },
        skipAll: () => {
          animationController?.skipAll();
        },
      },
      onError: (message) => {
        selectorStore.getState().setPlaybackError(message);
      },
    });
    aiPlaybackController.start();
  } catch (error) {
    console.warn('AI playback controller initialization failed. Continuing without AI playback orchestration.', error);
  }

  const unsubscribeZoneIDs = selectorStore.subscribe(selectZoneIDs, (zoneIDs) => {
    if (selectorStore.getState().gameDef !== null) {
      return;
    }
    positionStore.setZoneIDs(zoneIDs);
  }, { equalityFn: stringArraysEqual });
  const unsubscribeGameDef = selectorStore.subscribe(
    (state) => state.gameDef,
    (gameDef, previousGameDef) => {
      if (gameDef === previousGameDef) {
        return;
      }
      applyGameDefLayout(gameDef);
    },
  );
  const unsubscribeAnimationPlaybackSpeed = selectorStore.subscribe(
    (state) => state.animationPlaybackSpeed,
    (speed, previousSpeed) => {
      if (speed === previousSpeed) {
        return;
      }
      applyAnimationSpeed(speed);
    },
  );
  const unsubscribeAnimationPaused = selectorStore.subscribe(
    (state) => state.animationPaused,
    (paused, previousPaused) => {
      if (paused === previousPaused) {
        return;
      }
      applyAnimationPaused(paused);
    },
  );
  const unsubscribeAnimationSkipRequestToken = selectorStore.subscribe(
    (state) => state.animationSkipRequestToken,
    (token, previousToken) => {
      if (token === previousToken) {
        return;
      }
      animationController?.skipCurrent();
    },
  );
  const unsubscribeReducedMotion = reducedMotionObserver?.subscribe((reduced) => {
    animationController?.setReducedMotion(reduced);
  }) ?? (() => {
    // No-op when reduced-motion observer is unavailable.
  });
  const unsubscribePhaseAnnouncement = selectorStore.subscribe(
    selectPhaseAnnouncementLabel,
    (phaseLabel, previousPhaseLabel) => {
      if (phaseLabel === null || phaseLabel === previousPhaseLabel) {
        return;
      }
      ariaAnnouncer.announce(`Phase: ${phaseLabel}`);
    },
  );
  const keyboardSelectConfig = {
    getSelectableZoneIDs: () => interactionController.getSelectableZoneIDs(),
    getCurrentFocusedZoneID: () => interactionController.getFocusedZoneID(),
    onSelect: (zoneId: string) => {
      interactionController.onSelectTarget({ type: 'zone', id: zoneId });
    },
    onFocusChange: (zoneId: string | null) => {
      interactionController.onFocusChange(zoneId);
    },
    onFocusAnnounce: (zoneId: string) => {
      interactionController.onFocusAnnounce(zoneId);
    },
  };
  const cleanupKeyboardSelect = options.keyboardCoordinator === undefined
    ? deps.attachKeyboardSelect(keyboardSelectConfig)
    : options.keyboardCoordinator.register(
      (event) => handleKeyboardSelectKeyDown(event, keyboardSelectConfig),
      { priority: 10 },
    );

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
  let hoverAnchorVersion = 0;

  publishHoverAnchor = (): void => {
    const hoveredTarget = hoverTargetController.getCurrentTarget();
    if (hoveredTarget === null) {
      options.onHoverAnchorChange?.(null);
      return;
    }
    const worldBounds = hoverBoundsResolver(hoveredTarget);
    if (worldBounds === null) {
      options.onHoverAnchorChange?.(null);
      return;
    }
    hoverAnchorVersion += 1;
    options.onHoverAnchorChange?.({
      target: hoveredTarget,
      rect: coordinateBridge.canvasBoundsToScreenRect(worldBounds),
      space: 'screen',
      version: hoverAnchorVersion,
    });
  };
  const viewport = viewportResult.viewport as unknown as {
    on(event: 'moved', listener: () => void): void;
    off(event: 'moved', listener: () => void): void;
  };
  viewport.on('moved', publishHoverAnchor);

  let destroyed = false;

  return {
    coordinateBridge,
    setInteractionHighlights(highlights): void {
      canvasUpdater.setInteractionHighlights(highlights);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;

      viewport.off('moved', publishHoverAnchor);
      hoverTargetController.destroy();
      options.onHoverAnchorChange?.(null);
      options.onAnimationDiagnosticBufferChange?.(null);
      unsubscribeZoneIDs();
      unsubscribeGameDef();
      unsubscribeAnimationPlaybackSpeed();
      unsubscribeAnimationPaused();
      unsubscribeAnimationSkipRequestToken();
      unsubscribeReducedMotion();
      reducedMotionObserver?.destroy();
      unsubscribePhaseAnnouncement();
      cleanupKeyboardSelect();
      actionAnnouncements?.destroy();
      aiPlaybackController?.destroy();
      animationController?.destroy();
      ariaAnnouncer.destroy();
      destroyCanvasPipeline(
        canvasUpdater,
        zoneRenderer,
        adjacencyRenderer,
        tokenRenderer,
        tableOverlayRenderer,
        zonePool,
        viewportResult,
        gameCanvas,
      );
    },
  };
}

export function GameCanvas({
  store,
  visualConfigProvider,
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  keyboardCoordinator,
  interactionHighlights = EMPTY_INTERACTION_HIGHLIGHTS,
  onHoverAnchorChange,
  onAnimationDiagnosticBufferChange,
  onError,
}: GameCanvasProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameCanvasRuntime | null>(null);

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
      visualConfigProvider,
      backgroundColor,
      ...(keyboardCoordinator === undefined ? {} : { keyboardCoordinator }),
      interactionHighlights: interactionHighlights ?? EMPTY_INTERACTION_HIGHLIGHTS,
      ...(onHoverAnchorChange === undefined ? {} : { onHoverAnchorChange }),
      ...(onAnimationDiagnosticBufferChange === undefined ? {} : { onAnimationDiagnosticBufferChange }),
    };

    void createGameCanvasRuntime(runtimeOptions).then((createdRuntime) => {
      if (cancelled) {
        createdRuntime.destroy();
        return;
      }
      runtime = createdRuntime;
      runtimeRef.current = createdRuntime;
    }).catch((error: unknown) => {
      if (!cancelled) {
        onHoverAnchorChange?.(null);
        onAnimationDiagnosticBufferChange?.(null);
        onError?.(error);
      }
    });

    return () => {
      cancelled = true;
      runtime?.destroy();
      runtimeRef.current = null;
    };
  }, [
    store,
    visualConfigProvider,
    backgroundColor,
    keyboardCoordinator,
    onHoverAnchorChange,
    onAnimationDiagnosticBufferChange,
    onError,
  ]);

  useEffect(() => {
    runtimeRef.current?.setInteractionHighlights(interactionHighlights);
  }, [interactionHighlights]);

  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%' }}>
      <div ref={containerRef} role="application" aria-label="Game board" style={{ width: '100%', height: '100%' }} />
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
  tableOverlayRenderer: TableOverlayRenderer,
  zonePool: ContainerPool,
  viewportResult: ViewportResult,
  gameCanvas: PixiGameCanvas,
): void {
  canvasUpdater.destroy();
  zoneRenderer.destroy();
  adjacencyRenderer.destroy();
  tokenRenderer.destroy();
  tableOverlayRenderer.destroy();
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
  const gameDefZones = state.gameDef?.zones;
  if (Array.isArray(gameDefZones) && gameDefZones.length > 0) {
    return gameDefZones.map((zone) => zone.id);
  }

  const renderZones = state.renderModel?.zones;
  if (renderZones === undefined || renderZones.length === 0) {
    return [];
  }

  return renderZones.map((zone) => zone.id);
}

function selectPhaseAnnouncementLabel(state: GameStore): string | null {
  const phaseName = state.renderModel?.phaseName?.trim();
  if (phaseName === undefined || phaseName.length === 0) {
    return null;
  }

  const displayName = state.renderModel?.phaseDisplayName?.trim();
  return displayName !== undefined && displayName.length > 0 ? displayName : phaseName;
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
