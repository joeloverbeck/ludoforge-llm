import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasUpdater } from '../../src/canvas/canvas-updater';
import { createRuntimeLayoutStore } from '../../src/canvas/runtime-layout-store';
import { VisualConfigTokenRenderStyleProvider } from '../../src/canvas/renderers/token-render-style-provider';
import type {
  AdjacencyRenderer,
  ConnectionRouteRenderer,
  TableOverlayRenderer,
  TokenRenderer,
  ZoneRenderer,
} from '../../src/canvas/renderers/renderer-types';
import type { ViewportResult } from '../../src/canvas/viewport-setup';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import type { WorldLayoutModel } from '../../src/layout/world-layout-model.js';
import type { RenderModel, RenderToken, RenderZone } from '../../src/model/render-model';
import type { RunnerFrame, RunnerProjectionBundle } from '../../src/model/runner-frame.js';
import type { GameStore } from '../../src/store/game-store';

interface ProjectionVarsFixture {
  readonly globalVars: readonly { name: string; value: number | boolean }[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly { name: string; value: number | boolean }[]>;
}

interface CanvasTestStoreState {
  readonly runnerProjection: RunnerProjectionBundle | null;
  readonly runnerFrame: RunnerFrame | null;
  readonly renderModel: RenderModel | null;
  readonly worldLayout: WorldLayoutModel | null;
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
    visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null },
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
    adjacencies: [{ from: 'zone:a', to: 'zone:b', category: null, isHighlighted: false }],
    tokens: [makeToken()],
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
    hiddenActionsByClass: new Map(),
    choiceBreadcrumb: [],
    choiceContext: null,
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    runtimeEligible: [],
    surfaces: {
      tableOverlays: [],
      showdown: null,
    },
    victoryStandings: null,
    terminal: null,
    ...overrides,
  };
}

function asVar(name: string, value: number | boolean) {
  return {
    name,
    value,
    displayName: name,
  } as const;
}

function makeWorldLayout(zoneIds: readonly string[]): WorldLayoutModel {
  const positions = new Map<string, { x: number; y: number }>();
  for (const [index, zoneId] of zoneIds.entries()) {
    positions.set(zoneId, { x: index * 100, y: index * 40 });
  }
  return {
    positions,
    bounds: { minX: -80, minY: -80, maxX: 320, maxY: 220 },
    boardBounds: { minX: -40, minY: -20, maxX: 240, maxY: 140 },
  };
}

function makeProjectionVars(overrides: Partial<ProjectionVarsFixture> = {}): ProjectionVarsFixture {
  return {
    globalVars: [],
    playerVars: new Map(),
    ...overrides,
  };
}

function createCanvasTestStore(initial: Omit<CanvasTestStoreState, 'runnerProjection' | 'runnerFrame' | 'worldLayout'> & {
  worldLayout?: WorldLayoutModel | null;
  runnerProjection?: RunnerProjectionBundle | null;
  runnerFrame?: RunnerFrame | null;
  projectionVars?: ProjectionVarsFixture;
}): StoreApi<CanvasTestStoreState> {
  const derivedZoneIds = initial.renderModel?.zones.map((zone) => zone.id) ?? [];
  const projectionVars = initial.projectionVars ?? makeProjectionVars();
  const snapshot: CanvasTestStoreState = {
    runnerProjection: initial.runnerProjection ?? (initial.renderModel === null ? null : toRunnerProjection(initial.renderModel, projectionVars)),
    runnerFrame: initial.runnerFrame ?? (initial.renderModel === null ? null : toRunnerFrame(initial.renderModel)),
    renderModel: initial.renderModel,
    worldLayout: initial.worldLayout ?? makeWorldLayout(derivedZoneIds),
    animationPlaying: initial.animationPlaying,
  };
  const store = createStore<CanvasTestStoreState>()(
    subscribeWithSelector(() => snapshot),
  );
  const baseSetState = store.setState.bind(store);

  const materializeState = (
    state: CanvasTestStoreState,
    next: Partial<CanvasTestStoreState>,
  ): CanvasTestStoreState => ({
    ...state,
    ...next,
    runnerProjection: 'runnerProjection' in next
      ? (next.runnerProjection ?? null)
      : 'renderModel' in next
      ? (next.renderModel === null ? null : toRunnerProjection(next.renderModel, projectionVars))
      : state.runnerProjection,
    runnerFrame: 'runnerFrame' in next
      ? (next.runnerFrame ?? null)
      : 'renderModel' in next
      ? (next.renderModel === null ? null : toRunnerFrame(next.renderModel))
      : state.runnerFrame,
  });

  store.setState = ((partial, replace) => {
    if (typeof partial === 'function') {
      if (replace === true) {
        return baseSetState((state) => {
          const next = partial(state);
          if (next === null || typeof next !== 'object') {
            return state;
          }
          return materializeState(state, next as Partial<CanvasTestStoreState>);
        }, true);
      }

      return baseSetState((state) => {
        const next = partial(state);
        if (next === null || typeof next !== 'object') {
          return state;
        }
        return materializeState(state, next as Partial<CanvasTestStoreState>);
      });
    }
    const next = partial as Partial<CanvasTestStoreState>;

    if (replace === true) {
      return baseSetState(materializeState(store.getState(), next), true);
    }

    return baseSetState(materializeState(store.getState(), next));
  }) as typeof store.setState;
  return store;
}

function toRunnerFrame(renderModel: RenderModel): RunnerFrame {
  return {
    zones: renderModel.zones.map((zone) => ({
      id: zone.id,
      ordering: zone.ordering,
      tokenIDs: zone.tokenIDs,
      hiddenTokenCount: zone.hiddenTokenCount,
      markers: zone.markers.map((marker) => ({ id: marker.id, state: marker.state, possibleStates: marker.possibleStates })),
      visibility: zone.visibility,
      isSelectable: zone.isSelectable,
      isHighlighted: zone.isHighlighted,
      ownerID: zone.ownerID,
      category: zone.category,
      attributes: zone.attributes,
      metadata: zone.metadata,
    })),
    adjacencies: renderModel.adjacencies,
    tokens: renderModel.tokens,
    activeEffects: renderModel.activeEffects.map((effect) => ({
      id: effect.id,
      sourceCardId: effect.id,
      sourceCardTitle: effect.displayName,
      attributes: effect.attributes.map((attribute) => ({ key: attribute.key, value: attribute.value })),
    })),
    players: renderModel.players.map(({ id, isHuman, isActive, isEliminated, factionId }) => ({ id, isHuman, isActive, isEliminated, factionId })),
    activePlayerID: renderModel.activePlayerID,
    turnOrder: renderModel.turnOrder,
    turnOrderType: renderModel.turnOrderType,
    simultaneousSubmitted: renderModel.simultaneousSubmitted,
    interruptStack: renderModel.interruptStack,
    isInInterrupt: renderModel.isInInterrupt,
    phaseName: renderModel.phaseName,
    eventDecks: renderModel.eventDecks.map(({ id, drawZoneId, discardZoneId, playedCard, lookaheadCard, deckSize, discardSize }) => ({ id, drawZoneId, discardZoneId, playedCard, lookaheadCard, deckSize, discardSize })),
    actionGroups: renderModel.actionGroups.map(({ groupKey, actions }) => ({ groupKey, actions })),
    choiceBreadcrumb: renderModel.choiceBreadcrumb.map((step) => ({
      decisionKey: step.decisionKey,
      name: step.name,
      chosenValueId: step.chosenValueId,
      chosenValue: step.chosenValue,
      iterationGroupId: step.iterationGroupId,
      iterationEntityId: null,
    })),
    choiceContext: null,
    choiceUi: renderModel.choiceUi as RunnerFrame['choiceUi'],
    moveEnumerationWarnings: renderModel.moveEnumerationWarnings,
    runtimeEligible: renderModel.runtimeEligible.map(({ seatId, factionId, seatIndex }) => ({ seatId, factionId, seatIndex })),
    victoryStandings: renderModel.victoryStandings,
    terminal: renderModel.terminal,
  };
}

function toRunnerProjection(
  renderModel: RenderModel,
  projectionVars: ProjectionVarsFixture,
): RunnerProjectionBundle {
  return {
    frame: toRunnerFrame(renderModel),
    source: {
      globalVars: projectionVars.globalVars.map(({ name, value }) => ({ name, value })),
      playerVars: new Map(
        Array.from(projectionVars.playerVars.entries()).map(([playerId, vars]) => [
          playerId,
          vars.map(({ name, value }) => ({ name, value })),
        ]),
      ),
    },
  };
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

  const connectionRouteRenderer: ConnectionRouteRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => new Map()),
    destroy: vi.fn(),
  };

  const tokenRenderer: TokenRenderer = {
    update: vi.fn(),
    getContainerMap: vi.fn(() => new Map()),
    destroy: vi.fn(),
  };

  const tableOverlayRenderer: TableOverlayRenderer = {
    update: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    zoneRenderer,
    adjacencyRenderer,
    connectionRouteRenderer,
    tokenRenderer,
    tableOverlayRenderer,
  };
}

function createViewportMock(): ViewportResult {
  return {
    viewport: {} as ViewportResult['viewport'],
    worldLayers: [],
    updateWorldBounds: vi.fn(),
    centerOnBounds: vi.fn(),
    destroy: vi.fn(),
  };
}

const TEST_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);
const TEST_TABLE_OVERLAY_PROVIDER = new VisualConfigProvider({
  version: 1,
  tableOverlays: {
    items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
  },
});
const TEST_TOKEN_RENDER_STYLE_PROVIDER = new VisualConfigTokenRenderStyleProvider(TEST_VISUAL_CONFIG_PROVIDER);

describe('createCanvasUpdater', () => {
  it('start subscribes to store and runtime layout store', () => {
    const store = createCanvasTestStore({
      renderModel: makeRenderModel(),
      animationPlaying: false,
    });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);
    const storeSubscribeSpy = vi.spyOn(store, 'subscribe');
    const runtimeLayoutSubscribeSpy = vi.spyOn(runtimeLayoutStore, 'subscribe');

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(storeSubscribeSpy).toHaveBeenCalledTimes(4);
    expect(runtimeLayoutSubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('start performs an initial sync from current store and runtime layout snapshots', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);
    const snapshot = runtimeLayoutStore.getSnapshot();

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(viewport.updateWorldBounds).toHaveBeenCalledWith(snapshot.bounds);
    const zoneCall = vi.mocked(renderers.zoneRenderer.update).mock.calls[0];
    expect(zoneCall?.[0]).toMatchObject([
      {
        id: 'zone:a',
        displayName: 'Zone A',
        visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null },
        render: expect.objectContaining({
          fillColor: '#4d5c6d',
        }),
      },
    ]);
    expect(zoneCall?.[1]).toBe(snapshot.positions);
    expect(zoneCall?.[0]).not.toBe(model.zones);
    const adjacencyCall = vi.mocked(renderers.adjacencyRenderer.update).mock.calls[0];
    expect(adjacencyCall?.[0]).toEqual([]);
    expect(adjacencyCall?.[1]).toBe(snapshot.positions);
    const tokenCall = vi.mocked(renderers.tokenRenderer.update).mock.calls[0];
    expect(tokenCall?.[0]).toMatchObject([
      {
        renderId: 'token:1',
        zoneId: 'zone:a',
        tokenIds: ['token:1'],
        stackCount: 1,
        offset: { x: -90, y: -18 },
        render: expect.objectContaining({
          frontColor: expect.any(String),
        }),
      },
    ]);
    expect(tokenCall?.[1]).toEqual(new Map(renderers.zoneRenderer.getContainerMap()));
  });

  it('builds scene-owned zone nodes from the visual config before calling renderers', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          city: { shape: 'hexagon', width: 120, height: 80, color: '#123456' },
        },
        overrides: {
          'zone:a': { label: 'Configured Zone A' },
        },
      },
    });
    const tokenStyleProvider = new VisualConfigTokenRenderStyleProvider(provider);
    const model = makeRenderModel({
      zones: [
        makeZone({
          category: 'city',
          displayName: 'Mixed Zone A',
          visual: { shape: 'circle', width: 90, height: 90, color: '#ff00ff', connectionStyleKey: null },
        }),
      ],
    });
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: tokenStyleProvider,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    const zoneCall = vi.mocked(renderers.zoneRenderer.update).mock.calls[0];
    expect(zoneCall?.[0]).toMatchObject([
      {
        id: 'zone:a',
        displayName: 'Configured Zone A',
        visual: { shape: 'hexagon', width: 120, height: 80, color: '#123456', connectionStyleKey: null },
      },
    ]);
  });

  it('updates table overlays when projected overlay output changes even if zones/tokens/adjacencies are unchanged', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({
      renderModel: model,
      projectionVars: makeProjectionVars({
        globalVars: [asVar('pot', 10)],
      }),
      animationPlaying: false,
    });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_TABLE_OVERLAY_PROVIDER,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(TEST_TABLE_OVERLAY_PROVIDER),
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      tableOverlayRenderer: renderers.tableOverlayRenderer,
      viewport,
    });

    updater.start();
    expect(renderers.tableOverlayRenderer.update).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel(),
      runnerProjection: toRunnerProjection(makeRenderModel(), makeProjectionVars({
        globalVars: [asVar('pot', 25)],
      })),
    });

    expect(renderers.tableOverlayRenderer.update).toHaveBeenCalledTimes(1);
    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
  });

  it('does not update table overlays when unrelated raw vars change but projected overlay nodes stay the same', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({
      renderModel: model,
      projectionVars: makeProjectionVars({
        globalVars: [asVar('pot', 10), asVar('round', 1)],
      }),
      animationPlaying: false,
    });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_TABLE_OVERLAY_PROVIDER,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(TEST_TABLE_OVERLAY_PROVIDER),
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      tableOverlayRenderer: renderers.tableOverlayRenderer,
      viewport,
    });

    updater.start();
    expect(renderers.tableOverlayRenderer.update).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    store.setState({
      renderModel: makeRenderModel(),
      runnerProjection: toRunnerProjection(makeRenderModel(), makeProjectionVars({
        globalVars: [asVar('pot', 10), asVar('round', 2)],
      })),
    });

    expect(renderers.tableOverlayRenderer.update).not.toHaveBeenCalled();
    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
  });

  it('updates table overlays when world layout changes even if semantic projection is unchanged', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({
      renderModel: model,
      projectionVars: makeProjectionVars({
        globalVars: [asVar('pot', 10)],
      }),
      worldLayout: makeWorldLayout(['zone:a']),
      animationPlaying: false,
    });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_TABLE_OVERLAY_PROVIDER,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(TEST_TABLE_OVERLAY_PROVIDER),
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      tableOverlayRenderer: renderers.tableOverlayRenderer,
      viewport,
    });

    updater.start();
    expect(renderers.tableOverlayRenderer.update).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    store.setState({
      worldLayout: {
        positions: new Map([['zone:a', { x: 200, y: 120 }]]),
        bounds: { minX: 0, minY: 0, maxX: 260, maxY: 160 },
        boardBounds: { minX: 100, minY: 80, maxX: 220, maxY: 140 },
      },
    });

    expect(renderers.tableOverlayRenderer.update).toHaveBeenCalledTimes(1);
    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
    expect(vi.mocked(renderers.tableOverlayRenderer.update).mock.calls[0]?.[0]).toMatchObject([
      {
        type: 'text',
        text: 'Pot: 10',
        point: { x: 160, y: 110 },
      },
    ]);
  });

  it('updates renderers when zones change and ignores metadata-only changes under visual equality gating', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
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
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
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
        adjacencies: [{ from: 'zone:a', to: 'zone:c', category: null, isHighlighted: false }],
      }),
    });

    expect(renderers.adjacencyRenderer.update).toHaveBeenCalledTimes(1);
  });

  it('routes connection zones through the connection-route renderer and merges their token containers', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 120, height: 90, color: '#2a6e3f' },
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355', strokeAlpha: 0.8 },
        },
      },
    });
    const tokenStyleProvider = new VisualConfigTokenRenderStyleProvider(provider);
    const model = makeRenderModel({
      zones: [
        makeZone({ id: 'alpha:none', category: 'province', tokenIDs: [] }),
        makeZone({ id: 'beta:none', category: 'province', tokenIDs: [] }),
        makeZone({ id: 'loc-alpha-beta:none', category: 'loc', tokenIDs: ['token:route'] }),
      ],
      adjacencies: [
        { from: 'loc-alpha-beta:none', to: 'alpha:none', category: null, isHighlighted: false },
        { from: 'loc-alpha-beta:none', to: 'beta:none', category: null, isHighlighted: false },
      ],
      tokens: [makeToken({ id: 'token:route', zoneID: 'loc-alpha-beta:none' })],
    });
    const store = createCanvasTestStore({
      renderModel: model,
      animationPlaying: false,
      worldLayout: {
        positions: new Map([
          ['alpha:none', { x: 0, y: 0 }],
          ['beta:none', { x: 200, y: 0 }],
          ['loc-alpha-beta:none', { x: 100, y: 0 }],
        ]),
        bounds: { minX: -80, minY: -80, maxX: 320, maxY: 220 },
        boardBounds: { minX: -40, minY: -20, maxX: 240, maxY: 140 },
      },
    });
    const runtimeLayoutStore = createRuntimeLayoutStore(['alpha:none', 'beta:none', 'loc-alpha-beta:none']);
    runtimeLayoutStore.setActiveLayout({
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
        ['loc-alpha-beta:none', { x: 100, y: 0 }],
      ]),
      bounds: { minX: -80, minY: -80, maxX: 320, maxY: 220 },
    }, ['alpha:none', 'beta:none', 'loc-alpha-beta:none']);

    const renderers = createRendererMocks();
    const zoneContainer = { id: 'zone-container' } as unknown as Container;
    const routeContainer = { id: 'route-container' } as unknown as Container;
    vi.mocked(renderers.zoneRenderer.getContainerMap).mockReturnValue(new Map([
      ['alpha:none', zoneContainer],
      ['beta:none', zoneContainer],
    ]));
    vi.mocked(renderers.connectionRouteRenderer.getContainerMap).mockReturnValue(new Map([
      ['loc-alpha-beta:none', routeContainer],
    ]));
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: tokenStyleProvider,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(renderers.zoneRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'alpha:none' }),
        expect.objectContaining({ id: 'beta:none' }),
      ]),
      runtimeLayoutStore.getSnapshot().positions,
    );
    expect(renderers.connectionRouteRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          zoneId: 'loc-alpha-beta:none',
          endpointZoneIds: ['alpha:none', 'beta:none'],
        }),
      ]),
      [],
      runtimeLayoutStore.getSnapshot().positions,
    );
    expect(renderers.adjacencyRenderer.update).toHaveBeenCalledWith([], runtimeLayoutStore.getSnapshot().positions);
    expect(renderers.tokenRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          zoneId: 'loc-alpha-beta:none',
        }),
      ]),
      new Map([
        ['alpha:none', zoneContainer],
        ['beta:none', zoneContainer],
        ['loc-alpha-beta:none', routeContainer],
      ]),
    );
  });

  it('start centers the viewport on the initial runtime layout bounds', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);
    const snapshot = runtimeLayoutStore.getSnapshot();

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();

    expect(viewport.centerOnBounds).toHaveBeenCalledWith(snapshot.bounds);
  });

  it('updates viewport bounds and re-renders with new runtime layout data when the runtime layout store changes', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    runtimeLayoutStore.setActiveLayout({
      positions: new Map([['zone:a', { x: 10, y: 20 }]]),
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 200,
        maxY: 200,
      },
    }, ['zone:a']);

    const latestSnapshot = runtimeLayoutStore.getSnapshot();

    expect(viewport.updateWorldBounds).toHaveBeenCalledWith(latestSnapshot.bounds);
    expect(renderers.zoneRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'zone:a',
          displayName: 'Zone A',
          visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null },
          render: expect.objectContaining({
            fillColor: '#4d5c6d',
          }),
        }),
      ]),
      latestSnapshot.positions,
    );
  });

  it('gates renderer updates while animation is playing', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
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
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
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
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
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

    runtimeLayoutStore.setFallbackZoneIDs(['zone:a', 'zone:b']);

    expect(renderers.zoneRenderer.update).not.toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).not.toHaveBeenCalled();
    expect(renderers.tokenRenderer.update).not.toHaveBeenCalled();
  });

  it('applies interaction highlights without requiring store-state changes', () => {
    const model = makeRenderModel();
    const store = createCanvasTestStore({ renderModel: model, animationPlaying: false });
    const runtimeLayoutStore = createRuntimeLayoutStore(['zone:a']);

    const renderers = createRendererMocks();
    const viewport = createViewportMock();

    const updater = createCanvasUpdater({
      store: store as unknown as StoreApi<GameStore>,
      runtimeLayoutStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      tokenRenderStyleProvider: TEST_TOKEN_RENDER_STYLE_PROVIDER,
      zoneRenderer: renderers.zoneRenderer,
      adjacencyRenderer: renderers.adjacencyRenderer,
      connectionRouteRenderer: renderers.connectionRouteRenderer,
      tokenRenderer: renderers.tokenRenderer,
      viewport,
    });

    updater.start();
    vi.clearAllMocks();

    updater.setInteractionHighlights({
      zoneIDs: ['zone:a'],
      tokenIDs: ['token:1'],
    });

    expect(renderers.zoneRenderer.update).toHaveBeenCalledTimes(1);
    expect(renderers.tokenRenderer.update).toHaveBeenCalledTimes(1);
    expect(renderers.zoneRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'zone:a',
          displayName: 'Zone A',
          visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null },
          render: expect.objectContaining({
            stroke: { color: '#60a5fa', width: 3, alpha: 1 },
          }),
        }),
      ]),
      runtimeLayoutStore.getSnapshot().positions,
    );
    expect(renderers.tokenRenderer.update).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          renderId: 'token:1',
          zoneId: 'zone:a',
          tokenIds: ['token:1'],
          stackCount: 1,
          render: expect.objectContaining({
            stroke: { color: '#60a5fa', width: 3, alpha: 1 },
          }),
        }),
      ]),
      new Map(renderers.zoneRenderer.getContainerMap()),
    );
  });
});
