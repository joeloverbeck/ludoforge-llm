import type { StoreApi } from 'zustand';

import type { RenderAdjacency, RenderToken, RenderZone } from '../model/render-model';
import type { GameStore } from '../store/game-store';
import { adjacenciesVisuallyEqual, tokensVisuallyEqual, zonesVisuallyEqual } from './canvas-equality';
import type { PositionStore } from './position-store';
import type { AdjacencyRenderer, TokenRenderer, ZoneRenderer } from './renderers/renderer-types';
import type { ViewportResult } from './viewport-setup';

interface CanvasSnapshotSelectorResult {
  readonly zones: readonly RenderZone[];
  readonly tokens: readonly RenderToken[];
  readonly adjacencies: readonly RenderAdjacency[];
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
  readonly zoneRenderer: ZoneRenderer;
  readonly adjacencyRenderer: AdjacencyRenderer;
  readonly tokenRenderer: TokenRenderer;
  readonly viewport: ViewportResult;
}

export interface CanvasUpdater {
  start(): void;
  destroy(): void;
}

const EMPTY_ZONES: readonly RenderZone[] = [];
const EMPTY_TOKENS: readonly RenderToken[] = [];
const EMPTY_ADJACENCIES: readonly RenderAdjacency[] = [];

export function createCanvasUpdater(deps: CanvasUpdaterDeps): CanvasUpdater {
  const store = deps.store as SelectorSubscribeStore<GameStore>;
  const unsubscribeCallbacks: Array<() => void> = [];

  let started = false;
  let latestSnapshot = selectCanvasSnapshot(store.getState());
  let latestPositionSnapshot = deps.positionStore.getSnapshot();
  let animationPlaying = store.getState().animationPlaying;
  let queuedSnapshot: CanvasSnapshotSelectorResult | null = null;

  const applySnapshot = (snapshot: CanvasSnapshotSelectorResult): void => {
    deps.zoneRenderer.update(snapshot.zones, latestPositionSnapshot.positions);
    deps.adjacencyRenderer.update(snapshot.adjacencies, latestPositionSnapshot.positions);
    deps.tokenRenderer.update(snapshot.tokens, deps.zoneRenderer.getContainerMap());
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
          maybeApplySnapshot(snapshot);
        }, { equalityFn: canvasSnapshotsEqual }),
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
      latestSnapshot = selectCanvasSnapshot(store.getState());
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
  const renderModel = state.renderModel;
  if (renderModel === null) {
    return {
      zones: EMPTY_ZONES,
      tokens: EMPTY_TOKENS,
      adjacencies: EMPTY_ADJACENCIES,
    };
  }

  return {
    zones: renderModel.zones,
    tokens: renderModel.tokens,
    adjacencies: renderModel.adjacencies,
  };
}

function canvasSnapshotsEqual(prev: CanvasSnapshotSelectorResult, next: CanvasSnapshotSelectorResult): boolean {
  return (
    zonesVisuallyEqual(prev.zones, next.zones)
    && tokensVisuallyEqual(prev.tokens, next.tokens)
    && adjacenciesVisuallyEqual(prev.adjacencies, next.adjacencies)
  );
}
