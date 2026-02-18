import { asPlayerId } from '@ludoforge/engine/runtime';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasUpdater } from '../../src/canvas/canvas-updater';
import { createPositionStore } from '../../src/canvas/position-store';
import type { AdjacencyRenderer, TokenRenderer, ZoneRenderer } from '../../src/canvas/renderers/renderer-types';
import type { ViewportResult } from '../../src/canvas/viewport-setup';
import type { RenderModel, RenderToken, RenderZone } from '../../src/model/render-model';
import type { GameStore } from '../../src/store/game-store';

interface CanvasTestStoreState {
  readonly renderModel: RenderModel | null;
  readonly animationPlaying: boolean;
}

function makeZone(overrides: Partial<RenderZone> = {}): RenderZone {
  return {
    id: 'zone:a',
    displayName: 'Zone A',
    ordering: 'set',
    tokenIDs: ['token:1'],
    hiddenTokenCount: 0,
    markers: [],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category: null,
    attributes: {},
    visual: null,
    metadata: {},
    ...overrides,
  };
}

function makeToken(overrides: Partial<RenderToken> = {}): RenderToken {
  return {
    id: 'token:1',
    type: 'unit',
    zoneID: 'zone:a',
    ownerID: asPlayerId(0),
    factionId: 'faction:a',
    faceUp: true,
    properties: {},
    isSelectable: false,
    isSelected: false,
    ...overrides,
  };
}

function makeRenderModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    zones: [makeZone()],
    adjacencies: [{ from: 'zone:a', to: 'zone:b', isHighlighted: false }],
    tokens: [makeToken()],
    globalVars: [],
    playerVars: new Map(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'Player 1',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function createCanvasTestStore(initial: CanvasTestStoreState): StoreApi<CanvasTestStoreState> {
  return createStore<CanvasTestStoreState>()(
    subscribeWithSelector(() => initial),
  );
}

function createRendererMocks() {
  const zoneContainerMap = new Map();

  const zoneRenderer: ZoneRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => zoneContainerMap),
    destroy: vi.fn(),
  };

  const adjacencyRenderer: AdjacencyRenderer = {
    update: vi.fn(),
    destroy: vi.fn(),
  };

  const tokenRenderer: TokenRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => new Map()),
    destroy: vi.fn(),
  };

  return {
    zoneRenderer,
    adjacencyRenderer,
    tokenRenderer,
  };
}

function createViewportMock(): ViewportResult {
  return {
    viewport: {} as ViewportResult['viewport'],
    worldLayers: [],
    updateWorldBounds: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('createCanvasUpdater', () => {
  it('start subscribes to store and position store', () => {
    const store = createCanvasTestStore({
      renderModel: makeRenderModel(),
      animationPlaying: false,
    });
    const positionStore = createPositionStore(['zone:a']);
    const storeSubscribeSpy = vi.spyOn(store, 'subscribe');
    const positionSubscribeSpy = vi.spyOn(positionStore, 'subscribe');

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(storeSubscribeSpy).toHaveBeenCalledTimes(2);
    expect(positionSubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('start performs an initial sync from current store and position snapshots', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);
    const snapshot = positionStore.getSnapshot();

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(viewport.updateWorldBounds).toHaveBeenCalledWith(snapshot.bounds);
    expect(renderers.zoneRenderer.update).toHaveBeenCalledWith(model.zones, snapshot.positions);
    expect(renderers.adjacencyRenderer.update).toHaveBeenCalledWith(model.adjacencies, snapshot.positions);
    expect(renderers.tokenRenderer.update).toHaveBeenCalledWith(
      model.tokens,
      renderers.zoneRenderer.getContainerMap(),
    );
  });

  it('updates renderers when zones change and ignores visually equal changes', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:b' })],
      }),
    });

    expect(renderers.zoneRenderer.update).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:b', metadata: { debug: true } })],
      }),
    });

    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
  });

  it('updates token and adjacency renderers when their slices change', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel({
        tokens: [makeToken({ id: 'token:2' })],
      }),
    });

    expect(renderers.tokenRenderer.update).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel({
        adjacencies: [{ from: 'zone:a', to: 'zone:c', isHighlighted: false }],
      }),
    });

    expect(renderers.adjacencyRenderer.update).toHaveBeenCalledTimes(1);
  });

  it('updates viewport bounds and re-renders with new position data when position store changes', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    positionStore.setPositions({
      positions: new Map([['zone:a', { x: 10, y: 20 }]]),
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 200,
        maxY: 200,
      },
    }, ['zone:a']);

    const latestSnapshot = positionStore.getSnapshot();

    expect(viewport.updateWorldBounds).toHaveBeenCalledWith(latestSnapshot.bounds);
    expect(renderers.zoneRenderer.update).toHaveBeenCalledWith(model.zones, latestSnapshot.positions);
  });

  it('gates renderer updates while animation is playing', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    store.setState({ animationPlaying: true });
    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:queued' })],
      }),
    });

    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
  });

  it('applies the latest queued snapshot when animation transitions to false', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    store.setState({ animationPlaying: true });

    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:intermediate' })],
      }),
    });

    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:latest' })],
      }),
    });

    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();

    store.setState({ animationPlaying: false });

    expect(renderers.zoneRenderer.update).toHaveBeenCalledTimes(1);
    const firstArg = vi.mocked(renderers.zoneRenderer.update).mock.calls[0]?.[0]?.[0]?.id;
    expect(firstArg).toBe('zone:latest');
  });

  it('destroy unsubscribes listeners so further changes do not trigger updates', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const positionStore = createPositionStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      positionStore,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    updater.destroy();

    store.setState({
      renderModel: makeRenderModel({
        zones: [makeZone({ id: 'zone:after-destroy' })],
      }),
    });

    positionStore.setZoneIDs(['zone:a', 'zone:b']);

    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
  });
});
