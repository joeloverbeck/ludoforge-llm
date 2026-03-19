import type { StoreApi } from 'zustand';

import type {
  RunnerAdjacency,
  RunnerProjectionBundle,
  RunnerToken,
  RunnerZone,
} from '../model/runner-frame.js';
import type { GameStore } from '../store/game-store';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { adjacenciesVisuallyEqual, tokensVisuallyEqual, zonesVisuallyEqual } from './canvas-equality';
import { EMPTY_INTERACTION_HIGHLIGHTS, type InteractionHighlights } from './interaction-highlights.js';
import type { PositionStore } from './position-store';
import type {
  AdjacencyRenderer,
  RegionBoundaryRenderer,
  TableOverlayRenderer,
  TokenRenderer,
  TokenRenderStyleProvider,
  ZoneRenderer,
} from './renderers/renderer-types';
import type { ViewportResult } from './viewport-setup';
import { buildPresentationScene } from '../presentation/presentation-scene.js';
import {
  projectTableOverlaySurface,
  tableOverlaySurfaceNodesEqual,
} from '../presentation/project-table-overlay-surface.js';

interface CanvasSnapshotSelectorResult {
  readonly zones: readonly RunnerZone[];
  readonly tokens: readonly RunnerToken[];
  readonly adjacencies: readonly RunnerAdjacency[];
}

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

export interface CanvasUpdaterDeps {
  readonly store: StoreApi<GameStore>;
  readonly positionStore: PositionStore;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly tokenRenderStyleProvider: TokenRenderStyleProvider;
  readonly zoneRenderer: ZoneRenderer;
  readonly adjacencyRenderer: AdjacencyRenderer;
  readonly tokenRenderer: TokenRenderer;
  readonly tableOverlayRenderer?: TableOverlayRenderer;
  readonly regionBoundaryRenderer?: RegionBoundaryRenderer;
  readonly viewport: ViewportResult;
  readonly getInteractionHighlights?: () => InteractionHighlights;
}

export interface CanvasUpdater {
  start(): void;
  setInteractionHighlights(highlights: InteractionHighlights): void;
  destroy(): void;
}

const EMPTY_ZONES: readonly RunnerZone[] = [];
const EMPTY_TOKENS: readonly RunnerToken[] = [];
const EMPTY_ADJACENCIES: readonly RunnerAdjacency[] = [];

export function createCanvasUpdater(deps: CanvasUpdaterDeps): CanvasUpdater {
  const store = deps.store as SelectorSubscribeStore<GameStore>;
  const unsubscribeCallbacks: Array<() => void> = [];

  let started = false;
  let latestSnapshot = selectCanvasSnapshot(store.getState());
  let latestRunnerProjection = store.getState().runnerProjection;
  let latestPositionSnapshot = deps.positionStore.getSnapshot();
  let latestInteractionHighlights = deps.getInteractionHighlights?.() ?? EMPTY_INTERACTION_HIGHLIGHTS;
  let animationPlaying = store.getState().animationPlaying;
  let queuedSnapshot: CanvasSnapshotSelectorResult | null = null;

  const resolveOverlaySurface = (
    runnerProjection: RunnerProjectionBundle | null | undefined = latestRunnerProjection,
  ): ReturnType<typeof projectTableOverlaySurface> => projectTableOverlaySurface({
    projection: runnerProjection ?? null,
    positions: latestPositionSnapshot.positions,
    visualConfigProvider: deps.visualConfigProvider,
  });

  const applySnapshot = (_snapshot: CanvasSnapshotSelectorResult): void => {
    const overlays = resolveOverlaySurface();
    const scene = buildPresentationScene({
      runnerFrame: latestRunnerProjection?.frame ?? null,
      overlays,
      positions: latestPositionSnapshot.positions,
      visualConfigProvider: deps.visualConfigProvider,
      tokenRenderStyleProvider: deps.tokenRenderStyleProvider,
      interactionHighlights: latestInteractionHighlights,
    });
    deps.regionBoundaryRenderer?.update(scene.regions);
    deps.zoneRenderer.update(scene.zones, latestPositionSnapshot.positions);
    deps.adjacencyRenderer.update(scene.adjacencies, latestPositionSnapshot.positions);
    deps.tokenRenderer.update(scene.tokens, deps.zoneRenderer.getContainerMap());
    deps.tableOverlayRenderer?.update(scene.overlays);
  };

  const maybeApplySnapshot = (snapshot: CanvasSnapshotSelectorResult): void => {
    latestSnapshot = snapshot;
    if (animationPlaying) {
      queuedSnapshot = snapshot;
      return;
    }

    applySnapshot(snapshot);
  };

  return {
    start(): void {
      if (started) {
        return;
      }
      started = true;

      unsubscribeCallbacks.push(
        store.subscribe(selectCanvasSnapshot, (snapshot) => {
          latestRunnerProjection = store.getState().runnerProjection;
          maybeApplySnapshot(snapshot);
        }, { equalityFn: canvasSnapshotsEqual }),
      );

      unsubscribeCallbacks.push(
        store.subscribe((state) => state.runnerProjection, (runnerProjection) => {
          latestRunnerProjection = runnerProjection;
          if (animationPlaying) {
            return;
          }
          deps.tableOverlayRenderer?.update(resolveOverlaySurface(runnerProjection));
        }, {
          equalityFn: (prev, next) => tableOverlaySurfaceNodesEqual(
            resolveOverlaySurface(prev),
            resolveOverlaySurface(next),
          ),
        }),
      );

      unsubscribeCallbacks.push(
        store.subscribe((state) => state.animationPlaying, (playing, previousPlaying) => {
          animationPlaying = playing;
          if (!previousPlaying || playing) {
            return;
          }

          const snapshotToApply = queuedSnapshot ?? latestSnapshot;
          queuedSnapshot = null;
          applySnapshot(snapshotToApply);
          deps.tokenRenderer.reconcileFaceState?.(snapshotToApply.tokens);
        }),
      );

      unsubscribeCallbacks.push(
        deps.positionStore.subscribe((positionSnapshot) => {
          latestPositionSnapshot = positionSnapshot;
          deps.viewport.updateWorldBounds(positionSnapshot.bounds);

          if (animationPlaying) {
            return;
          }

          applySnapshot(latestSnapshot);
        }),
      );

      latestPositionSnapshot = deps.positionStore.getSnapshot();
      deps.viewport.updateWorldBounds(latestPositionSnapshot.bounds);
      deps.viewport.centerOnBounds(latestPositionSnapshot.bounds);
      latestRunnerProjection = store.getState().runnerProjection;
      latestSnapshot = selectCanvasSnapshot(store.getState());
      if (animationPlaying) {
        queuedSnapshot = latestSnapshot;
        return;
      }
      applySnapshot(latestSnapshot);
    },

    setInteractionHighlights(highlights): void {
      latestInteractionHighlights = highlights;
      if (animationPlaying) {
        queuedSnapshot = latestSnapshot;
        return;
      }
      applySnapshot(latestSnapshot);
    },

    destroy(): void {
      if (!started) {
        return;
      }

      started = false;
      queuedSnapshot = null;
      while (unsubscribeCallbacks.length > 0) {
        const unsubscribe = unsubscribeCallbacks.pop();
        unsubscribe?.();
      }
    },
  };
}

function selectCanvasSnapshot(state: GameStore): CanvasSnapshotSelectorResult {
  const runnerFrame = state.runnerFrame;
  if (runnerFrame == null) {
    return {
      zones: EMPTY_ZONES,
      tokens: EMPTY_TOKENS,
      adjacencies: EMPTY_ADJACENCIES,
    };
  }

  return {
    zones: runnerFrame.zones,
    tokens: runnerFrame.tokens,
    adjacencies: runnerFrame.adjacencies,
  };
}

function canvasSnapshotsEqual(prev: CanvasSnapshotSelectorResult, next: CanvasSnapshotSelectorResult): boolean {
  return (
    zonesVisuallyEqual(prev.zones, next.zones)
    && tokensVisuallyEqual(prev.tokens, next.tokens)
    && adjacenciesVisuallyEqual(prev.adjacencies, next.adjacencies)
  );
}
