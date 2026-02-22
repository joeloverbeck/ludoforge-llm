import type { StoreApi } from 'zustand';

import type { RenderAdjacency, RenderModel, RenderToken, RenderVariable, RenderZone } from '../model/render-model';
import type { GameStore } from '../store/game-store';
import { adjacenciesVisuallyEqual, tokensVisuallyEqual, zonesVisuallyEqual } from './canvas-equality';
import { EMPTY_INTERACTION_HIGHLIGHTS, type InteractionHighlights } from './interaction-highlights.js';
import type { PositionStore } from './position-store';
import type { AdjacencyRenderer, TableOverlayRenderer, TokenRenderer, ZoneRenderer } from './renderers/renderer-types';
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
  readonly tableOverlayRenderer?: TableOverlayRenderer;
  readonly viewport: ViewportResult;
  readonly getInteractionHighlights?: () => InteractionHighlights;
}

export interface CanvasUpdater {
  start(): void;
  setInteractionHighlights(highlights: InteractionHighlights): void;
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
  let latestOverlayRenderModel = store.getState().renderModel;
  let latestPositionSnapshot = deps.positionStore.getSnapshot();
  let latestInteractionHighlights = deps.getInteractionHighlights?.() ?? EMPTY_INTERACTION_HIGHLIGHTS;
  let animationPlaying = store.getState().animationPlaying;
  let queuedSnapshot: CanvasSnapshotSelectorResult | null = null;

  const applySnapshot = (snapshot: CanvasSnapshotSelectorResult): void => {
    const highlightedZoneIDs = new Set(latestInteractionHighlights.zoneIDs);
    const highlightedTokenIDs = new Set(latestInteractionHighlights.tokenIDs);
    deps.zoneRenderer.update(snapshot.zones, latestPositionSnapshot.positions, highlightedZoneIDs);
    deps.adjacencyRenderer.update(snapshot.adjacencies, latestPositionSnapshot.positions);
    deps.tokenRenderer.update(snapshot.tokens, deps.zoneRenderer.getContainerMap(), highlightedTokenIDs);
    deps.tableOverlayRenderer?.update(latestOverlayRenderModel, latestPositionSnapshot.positions);
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
        store.subscribe((state) => state.renderModel, (renderModel) => {
          latestOverlayRenderModel = renderModel;
          if (animationPlaying) {
            return;
          }
          deps.tableOverlayRenderer?.update(renderModel, latestPositionSnapshot.positions);
        }, { equalityFn: overlaysVisuallyEqual }),
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
      latestOverlayRenderModel = store.getState().renderModel;
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

function overlaysVisuallyEqual(prev: RenderModel | null, next: RenderModel | null): boolean {
  if (prev === next) {
    return true;
  }
  if (prev === null || next === null) {
    return false;
  }

  return (
    variablesEqual(prev.globalVars, next.globalVars)
    && playerVarsEqual(prev.playerVars, next.playerVars)
    && playersEqual(prev.players, next.players)
  );
}

function variablesEqual(prev: readonly RenderVariable[], next: readonly RenderVariable[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const prevVar = prev[index];
    const nextVar = next[index];
    if (prevVar === undefined || nextVar === undefined) {
      return false;
    }
    if (prevVar.name !== nextVar.name || prevVar.value !== nextVar.value) {
      return false;
    }
  }

  return true;
}

function playerVarsEqual(
  prev: RenderModel['playerVars'],
  next: RenderModel['playerVars'],
): boolean {
  if (prev.size !== next.size) {
    return false;
  }

  for (const [playerId, vars] of prev.entries()) {
    const candidate = next.get(playerId);
    if (candidate === undefined) {
      return false;
    }
    if (!variablesEqual(vars, candidate)) {
      return false;
    }
  }

  return true;
}

function playersEqual(prev: RenderModel['players'], next: RenderModel['players']): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const prevPlayer = prev[index];
    const nextPlayer = next[index];
    if (prevPlayer === undefined || nextPlayer === undefined) {
      return false;
    }
    if (
      prevPlayer.id !== nextPlayer.id
      || prevPlayer.isEliminated !== nextPlayer.isEliminated
    ) {
      return false;
    }
  }

  return true;
}
