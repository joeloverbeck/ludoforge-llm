// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  resolveRunnerBootstrapByGameId: vi.fn(),
  getOrComputeLayout: vi.fn(),
  createMapEditorStore: vi.fn(),
  exportVisualConfig: vi.fn(),
  triggerDownload: vi.fn(),
  createEditorCanvas: vi.fn(),
  createZoneRenderer: vi.fn(),
  createAdjacencyRenderer: vi.fn(),
  createConnectionRouteRenderer: vi.fn(),
  createRegionBoundaryRenderer: vi.fn(),
  drawTableBackground: vi.fn(),
  createEditorHandleRenderer: vi.fn(),
  createVertexHandleRenderer: vi.fn(),
  buildEditorPresentationScene: vi.fn(),
  computeProvinceBorders: vi.fn(),
  attachZoneDragHandlers: vi.fn(),
  resolveMapEditorZoneVisuals: vi.fn(),
}));

vi.mock('../../src/bootstrap/runner-bootstrap.js', () => ({
  resolveRunnerBootstrapByGameId: testDoubles.resolveRunnerBootstrapByGameId,
}));

vi.mock('../../src/layout/layout-cache.js', () => ({
  getOrComputeLayout: testDoubles.getOrComputeLayout,
}));

vi.mock('../../src/map-editor/map-editor-store.js', () => ({
  createMapEditorStore: testDoubles.createMapEditorStore,
}));

vi.mock('../../src/map-editor/map-editor-export.js', () => ({
  exportVisualConfig: testDoubles.exportVisualConfig,
  triggerDownload: testDoubles.triggerDownload,
}));

vi.mock('../../src/map-editor/map-editor-canvas.js', () => ({
  createEditorCanvas: testDoubles.createEditorCanvas,
}));

vi.mock('../../src/canvas/renderers/zone-renderer.js', () => ({
  createZoneRenderer: testDoubles.createZoneRenderer,
}));

vi.mock('../../src/canvas/renderers/adjacency-renderer.js', () => ({
  createAdjacencyRenderer: testDoubles.createAdjacencyRenderer,
}));

vi.mock('../../src/canvas/renderers/connection-route-renderer.js', () => ({
  createConnectionRouteRenderer: testDoubles.createConnectionRouteRenderer,
}));

vi.mock('../../src/canvas/renderers/region-boundary-renderer.js', () => ({
  createRegionBoundaryRenderer: testDoubles.createRegionBoundaryRenderer,
}));

vi.mock('../../src/canvas/renderers/table-background-renderer.js', () => ({
  drawTableBackground: testDoubles.drawTableBackground,
}));

vi.mock('../../src/canvas/renderers/province-border-utils.js', () => ({
  computeProvinceBorders: testDoubles.computeProvinceBorders,
}));

vi.mock('../../src/map-editor/map-editor-drag.js', () => ({
  attachZoneDragHandlers: testDoubles.attachZoneDragHandlers,
}));

vi.mock('../../src/map-editor/map-editor-handle-renderer.js', () => ({
  createEditorHandleRenderer: testDoubles.createEditorHandleRenderer,
}));

vi.mock('../../src/map-editor/vertex-handle-renderer.js', () => ({
  createVertexHandleRenderer: testDoubles.createVertexHandleRenderer,
}));

vi.mock('../../src/map-editor/map-editor-presentation-adapter.js', () => ({
  buildEditorPresentationScene: testDoubles.buildEditorPresentationScene,
}));

vi.mock('../../src/map-editor/map-editor-zone-visuals.js', () => ({
  resolveMapEditorZoneVisuals: testDoubles.resolveMapEditorZoneVisuals,
}));

vi.mock('../../src/map-editor/map-editor-route-geometry.js', () => ({
  findNearestRouteSegment: vi.fn(),
  resolveRouteGeometry: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MOCK_SCENE = {
  zones: [{ id: 'zone:a', displayName: 'A', ownerID: null, isSelectable: true, category: null, attributes: {}, visual: { shape: 'circle', width: 40, height: 40, color: '#aaa', vertices: null }, render: { fillColor: '#aaa', stroke: { color: '#111', width: 1, alpha: 0.7 }, hiddenStackCount: 0, nameLabel: { text: 'A', x: 0, y: 0, visible: true }, markersLabel: { text: '', x: 0, y: 0, visible: false }, badge: null } }],
  adjacencies: [],
  connectionRoutes: [],
  junctions: [],
  tokens: [],
  overlays: [],
  regions: [],
};

describe('MapEditorScreen', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const double of Object.values(testDoubles)) {
      double.mockReset();
    }

    testDoubles.getOrComputeLayout.mockReturnValue({
      worldLayout: {
        positions: new Map([['zone:a', { x: 10, y: 20 }]]),
      },
      mode: 'graph',
    });

    testDoubles.buildEditorPresentationScene.mockReturnValue(MOCK_SCENE);
    testDoubles.computeProvinceBorders.mockReturnValue(new Map());
    testDoubles.resolveMapEditorZoneVisuals.mockReturnValue(new Map());
    testDoubles.attachZoneDragHandlers.mockReturnValue(() => {});
  });

  function createMockRenderers() {
    const zoneRenderer = { update: vi.fn(), getContainerMap: vi.fn(() => new Map()), destroy: vi.fn() };
    const adjacencyRenderer = { update: vi.fn(), destroy: vi.fn() };
    const routeRenderer = { update: vi.fn(), getContainerMap: vi.fn(() => new Map()), destroy: vi.fn() };
    const regionRenderer = { update: vi.fn(), destroy: vi.fn() };
    const handleRenderer = { destroy: vi.fn() };
    const vertexHandleRenderer = { destroy: vi.fn() };

    testDoubles.createZoneRenderer.mockReturnValue(zoneRenderer);
    testDoubles.createAdjacencyRenderer.mockReturnValue(adjacencyRenderer);
    testDoubles.createConnectionRouteRenderer.mockReturnValue(routeRenderer);
    testDoubles.createRegionBoundaryRenderer.mockReturnValue(regionRenderer);
    testDoubles.createEditorHandleRenderer.mockReturnValue(handleRenderer);
    testDoubles.createVertexHandleRenderer.mockReturnValue(vertexHandleRenderer);

    return { zoneRenderer, adjacencyRenderer, routeRenderer, regionRenderer, handleRenderer, vertexHandleRenderer };
  }

  function createMockEditorCanvas() {
    return {
      layers: {
        backgroundLayer: { tag: 'background-layer' },
        regionLayer: { tag: 'region-layer' },
        provinceZoneLayer: { tag: 'province-zone-layer' },
        connectionRouteLayer: { tag: 'connection-route-layer' },
        cityZoneLayer: { tag: 'city-zone-layer' },
        adjacencyLayer: { tag: 'adjacency-layer' },
        tableOverlayLayer: { tag: 'table-overlay-layer' },
        handleLayer: { tag: 'handle-layer' },
      },
      viewport: { tag: 'viewport' },
      containerPool: { tag: 'container-pool' },
      disposalQueue: { tag: 'disposal-queue' },
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    };
  }

  it('loads editor bootstrap, mounts canvas runtime with game canvas renderers, and cleans up on unmount', async () => {
    const store = createMockEditorStore();
    const renderers = createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    const onBack = vi.fn();
    const rendered = render(createElement(MapEditorScreen, { gameId: 'fitl', onBack }));

    expect(screen.getByTestId('map-editor-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });
    expect((screen.getByTestId('map-editor-undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('map-editor-export-button') as HTMLButtonElement).disabled).toBe(false);

    await waitFor(() => {
      expect(testDoubles.createMapEditorStore).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Map),
      );
      expect(testDoubles.createEditorCanvas).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        store,
        expect.objectContaining({
          onPointerWorldPositionChange: expect.any(Function),
        }),
      );
    });

    expect(testDoubles.createZoneRenderer).toHaveBeenCalledWith(
      expect.any(Function),
      editorCanvas.containerPool,
      expect.objectContaining({ bindSelection: expect.any(Function) }),
    );
    expect(testDoubles.createAdjacencyRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.adjacencyLayer,
      expect.objectContaining({ tag: 'provider' }),
      expect.objectContaining({ disposalQueue: editorCanvas.disposalQueue }),
    );
    expect(testDoubles.createConnectionRouteRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.connectionRouteLayer,
      expect.objectContaining({ tag: 'provider' }),
      expect.objectContaining({ bindSelection: expect.any(Function) }),
    );
    expect(testDoubles.createRegionBoundaryRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.regionLayer,
    );
    expect(testDoubles.createEditorHandleRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.handleLayer,
      store,
      expect.anything(),
      expect.objectContaining({ tag: 'provider' }),
      { dragSurface: editorCanvas.viewport },
    );
    expect(editorCanvas.centerOnContent).toHaveBeenCalledTimes(1);

    expect(testDoubles.buildEditorPresentationScene).toHaveBeenCalled();
    expect(renderers.zoneRenderer.update).toHaveBeenCalled();
    expect(renderers.adjacencyRenderer.update).toHaveBeenCalled();
    expect(renderers.routeRenderer.update).toHaveBeenCalled();
    expect(renderers.regionRenderer.update).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('map-editor-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);

    rendered.unmount();

    expect(renderers.adjacencyRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderers.zoneRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderers.routeRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderers.regionRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderers.handleRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(editorCanvas.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows an error state for unknown games', async () => {
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue(null);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'missing-game', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-error')).toBeTruthy();
    });
    expect(screen.getByText('Unknown game "missing-game".')).toBeTruthy();
  });

  it('shows an error state for unsupported games', async () => {
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: "Texas Hold'em" } },
      gameDef: { metadata: { id: 'texas' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: false },
    });

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'texas', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-error')).toBeTruthy();
    });
    expect(screen.getByText("Texas Hold'em does not support the map editor.")).toBeTruthy();
    expect(testDoubles.createEditorCanvas).not.toHaveBeenCalled();
  });

  it('exports the current editor document and marks the store saved', async () => {
    const store = createMockEditorStore();
    createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);
    testDoubles.exportVisualConfig.mockReturnValue('version: 1\n');

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'fitl', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('map-editor-export-button'));

    expect(testDoubles.exportVisualConfig).toHaveBeenCalledWith({
      originalVisualConfig: store.getState().originalVisualConfig,
      zonePositions: store.getState().zonePositions,
      zoneVertices: store.getState().zoneVertices,
      connectionAnchors: store.getState().connectionAnchors,
      connectionRoutes: store.getState().connectionRoutes,
    });
    expect(testDoubles.triggerDownload).toHaveBeenCalledWith('version: 1\n', 'visual-config.yaml');
    expect(store.getState().markSaved).toHaveBeenCalledTimes(1);
  });

  it('shows an inline export error when export fails', async () => {
    const store = createMockEditorStore();
    createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);
    testDoubles.exportVisualConfig.mockImplementation(() => {
      throw new Error('schema mismatch');
    });

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'fitl', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('map-editor-export-button'));

    expect(await screen.findByTestId('map-editor-export-error')).toBeTruthy();
    expect(screen.getByText('schema mismatch')).toBeTruthy();
    expect(testDoubles.triggerDownload).not.toHaveBeenCalled();
    expect(store.getState().markSaved).not.toHaveBeenCalled();
  });

  it('shows pointer coordinates and falls back to the selected zone position', async () => {
    const store = createMockEditorStore();
    createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'fitl', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });

    await waitFor(() => {
      expect(testDoubles.createEditorCanvas).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        store,
        expect.objectContaining({
          onPointerWorldPositionChange: expect.any(Function),
        }),
      );
    });

    const canvasOptions = testDoubles.createEditorCanvas.mock.calls[0]?.[2] as {
      onPointerWorldPositionChange?: (position: { x: number; y: number } | null) => void;
    };

    canvasOptions.onPointerWorldPositionChange?.({ x: 12.4, y: 27.6 });

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-coordinate-readout').textContent).toBe('Cursor (12, 28)');
    });

    canvasOptions.onPointerWorldPositionChange?.(null);
    store.setState({ selectedZoneId: 'zone:a' });

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-coordinate-readout').textContent).toBe('Selected (10, 20)');
    });
  });

  it('registers beforeunload only while the editor is dirty and cleans it up on unmount', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const store = createMockEditorStore();
    createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    const rendered = render(createElement(MapEditorScreen, { gameId: 'fitl', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    store.setState({ dirty: true });

    await waitFor(() => {
      expect(
        addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === 'beforeunload'),
      ).toHaveLength(1);
    });

    store.setState({ dirty: false });

    await waitFor(() => {
      expect(
        removeEventListenerSpy.mock.calls.filter(([eventName]) => eventName === 'beforeunload'),
      ).toHaveLength(1);
    });

    store.setState({ dirty: true });

    await waitFor(() => {
      expect(
        addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === 'beforeunload'),
      ).toHaveLength(2);
    });

    rendered.unmount();

    expect(
      removeEventListenerSpy.mock.calls.filter(([eventName]) => eventName === 'beforeunload'),
    ).toHaveLength(2);
  });

  it('re-syncs renderers when editor store state changes', async () => {
    const store = createMockEditorStore();
    const renderers = createMockRenderers();
    const editorCanvas = createMockEditorCanvas();

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' }, zones: [] },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider', getTableBackground: () => null, getHiddenZones: () => new Set() },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'fitl', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });

    await waitFor(() => {
      expect(renderers.zoneRenderer.update).toHaveBeenCalledTimes(1);
    });

    store.setState({ zonePositions: new Map([['zone:a', { x: 50, y: 60 }]]) });

    await waitFor(() => {
      expect(renderers.zoneRenderer.update).toHaveBeenCalledTimes(2);
      expect(renderers.adjacencyRenderer.update).toHaveBeenCalledTimes(2);
      expect(renderers.routeRenderer.update).toHaveBeenCalledTimes(2);
      expect(renderers.regionRenderer.update).toHaveBeenCalledTimes(2);
    });
  });
});

function createMockEditorStore() {
  type MockEditorState = {
    showGrid: boolean;
    snapToGrid: boolean;
    gridSize: number;
    dirty: boolean;
    undoStack: unknown[];
    redoStack: unknown[];
    originalVisualConfig: { version: number };
    zonePositions: Map<string, { x: number; y: number }>;
    zoneVertices: Map<string, readonly number[]>;
    connectionAnchors: Map<string, { x: number; y: number }>;
    connectionRoutes: Map<string, {
      points: Array<{ kind: string; zoneId?: string; anchorId?: string }>;
      segments: Array<{ kind: string }>;
    }>;
    undo: ReturnType<typeof vi.fn>;
    redo: ReturnType<typeof vi.fn>;
    toggleGrid: ReturnType<typeof vi.fn>;
    setGridSize: ReturnType<typeof vi.fn>;
    setSnapToGrid: ReturnType<typeof vi.fn>;
    markSaved: ReturnType<typeof vi.fn>;
    selectZone: ReturnType<typeof vi.fn>;
    selectRoute: ReturnType<typeof vi.fn>;
    selectedZoneId: string | null;
    selectedRouteId: string | null;
    gameDef: undefined;
  };

  const state: MockEditorState = {
    showGrid: false,
    snapToGrid: false,
    gridSize: 20,
    dirty: false,
    undoStack: [],
    redoStack: [],
    originalVisualConfig: { version: 1 },
    zonePositions: new Map([['zone:a', { x: 10, y: 20 }]]),
    zoneVertices: new Map<string, readonly number[]>(),
    connectionAnchors: new Map([['bend', { x: 30, y: 40 }]]),
    connectionRoutes: new Map([
      ['route:none', {
        points: [{ kind: 'zone', zoneId: 'zone:a' }, { kind: 'anchor', anchorId: 'bend' }],
        segments: [{ kind: 'straight' }],
      }],
    ]),
    undo: vi.fn(),
    redo: vi.fn(),
    toggleGrid: vi.fn(),
    setGridSize: vi.fn(),
    setSnapToGrid: vi.fn(),
    markSaved: vi.fn(),
    selectZone: vi.fn(),
    selectRoute: vi.fn(),
    selectedZoneId: null,
    selectedRouteId: null,
    gameDef: undefined,
  };
  const listeners = new Set<(state: MockEditorState, previousState: MockEditorState) => void>();

  const store = ((selector: (value: MockEditorState) => unknown) => selector(state)) as {
    (selector: (value: MockEditorState) => unknown): unknown;
    getState: () => MockEditorState;
    subscribe: (listener: (value: MockEditorState, previousValue: MockEditorState) => void) => () => void;
    setState: (patch: Partial<MockEditorState>) => void;
  };
  store.getState = () => state;
  store.subscribe = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  store.setState = (patch) => {
    const previousState = { ...state };
    Object.assign(state, patch);
    for (const listener of listeners) {
      listener(state, previousState);
    }
  };
  return store;
}
