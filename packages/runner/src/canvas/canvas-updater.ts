import type { StoreApi } from 'zustand';

import type { RenderAdjacency, RenderMapSpace, RenderToken, RenderZone } from '../model/render-model';
import type { GameStore } from '../store/game-store';
import { adjacenciesVisuallyEqual, tokensVisuallyEqual, zonesVisuallyEqual } from './canvas-equality';
import type { PositionStore } from './position-store';
import type { AdjacencyRenderer, TokenRenderer, ZoneRenderer } from './renderers/renderer-types';
import type { ViewportResult } from './viewport-setup';

interface CanvasSnapshotSelectorResult {
  readonly zones: readonly RenderZone[];
  readonly tokens: readonly RenderToken[];
  readonly adjacencies: readonly RenderAdjacency[];
  readonly mapSpaces: readonly RenderMapSpace[];
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
const EMPTY_MAP_SPACES: readonly RenderMapSpace[] = [];

export function createCanvasUpdater(deps: CanvasUpdaterDeps): CanvasUpdater {
  const store = deps.store as SelectorSubscribeStore<GameStore>;
  const unsubscribeCallbacks: Array<() => void> = [];

  let started = false;
  let latestSnapshot = selectCanvasSnapshot(store.getState());
  let latestPositionSnapshot = deps.positionStore.getSnapshot();
  let animationPlaying = store.getState().animationPlaying;
  let queuedSnapshot: CanvasSnapshotSelectorResult | null = null;

  const applySnapshot = (snapshot: CanvasSnapshotSelectorResult): void => {
    deps.zoneRenderer.update(snapshot.zones, snapshot.mapSpaces, latestPositionSnapshot.positions);
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
      mapSpaces: EMPTY_MAP_SPACES,
    };
  }

  return {
    zones: renderModel.zones,
    tokens: renderModel.tokens,
    adjacencies: renderModel.adjacencies,
    mapSpaces: renderModel.mapSpaces,
  };
}

function canvasSnapshotsEqual(prev: CanvasSnapshotSelectorResult, next: CanvasSnapshotSelectorResult): boolean {
  return (
    zonesVisuallyEqual(prev.zones, next.zones)
    && tokensVisuallyEqual(prev.tokens, next.tokens)
    && adjacenciesVisuallyEqual(prev.adjacencies, next.adjacencies)
    && mapSpacesVisuallyEqual(prev.mapSpaces, next.mapSpaces)
  );
}

function mapSpacesVisuallyEqual(prev: readonly RenderMapSpace[], next: readonly RenderMapSpace[]): boolean {
  if (prev === next) {
    return true;
  }

  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const previous = prev[index];
    const current = next[index];

    if (previous === undefined || current === undefined) {
      return false;
    }

    if (
      previous.id !== current.id
      || previous.displayName !== current.displayName
      || previous.spaceType !== current.spaceType
      || previous.population !== current.population
      || previous.econ !== current.econ
      || previous.country !== current.country
      || previous.coastal !== current.coastal
      || !stringArraysEqual(previous.terrainTags, current.terrainTags)
      || !stringArraysEqual(previous.adjacentTo, current.adjacentTo)
    ) {
      return false;
    }
  }

  return true;
}

function stringArraysEqual(prev: readonly string[], next: readonly string[]): boolean {
  if (prev === next) {
    return true;
  }

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
