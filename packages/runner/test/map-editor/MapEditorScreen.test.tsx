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
  createEditorAdjacencyRenderer: vi.fn(),
  createEditorZoneRenderer: vi.fn(),
  createEditorRouteRenderer: vi.fn(),
  createEditorHandleRenderer: vi.fn(),
  createVertexHandleRenderer: vi.fn(),
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

vi.mock('../../src/map-editor/map-editor-adjacency-renderer.js', () => ({
  createEditorAdjacencyRenderer: testDoubles.createEditorAdjacencyRenderer,
}));

vi.mock('../../src/map-editor/map-editor-zone-renderer.js', () => ({
  createEditorZoneRenderer: testDoubles.createEditorZoneRenderer,
}));

vi.mock('../../src/map-editor/map-editor-route-renderer.js', () => ({
  createEditorRouteRenderer: testDoubles.createEditorRouteRenderer,
}));

vi.mock('../../src/map-editor/map-editor-handle-renderer.js', () => ({
  createEditorHandleRenderer: testDoubles.createEditorHandleRenderer,
}));

vi.mock('../../src/map-editor/vertex-handle-renderer.js', () => ({
  createVertexHandleRenderer: testDoubles.createVertexHandleRenderer,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapEditorScreen', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.resolveRunnerBootstrapByGameId.mockReset();
    testDoubles.getOrComputeLayout.mockReset();
    testDoubles.createMapEditorStore.mockReset();
    testDoubles.exportVisualConfig.mockReset();
    testDoubles.triggerDownload.mockReset();
    testDoubles.createEditorCanvas.mockReset();
    testDoubles.createEditorAdjacencyRenderer.mockReset();
    testDoubles.createEditorZoneRenderer.mockReset();
    testDoubles.createEditorRouteRenderer.mockReset();
    testDoubles.createEditorHandleRenderer.mockReset();
    testDoubles.createVertexHandleRenderer.mockReset();

    testDoubles.getOrComputeLayout.mockReturnValue({
      worldLayout: {
        positions: new Map([['zone:a', { x: 10, y: 20 }]]),
      },
      mode: 'graph',
    });
  });

  it('loads editor bootstrap, mounts canvas runtime, and cleans up on unmount', async () => {
    const store = createMockEditorStore();
    const adjacencyRenderer = { destroy: vi.fn() };
    const zoneRenderer = { destroy: vi.fn() };
    const routeRenderer = { destroy: vi.fn() };
    const handleRenderer = { destroy: vi.fn() };
    const vertexHandleRenderer = { destroy: vi.fn() };
    const editorCanvas = {
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
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    };

    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);
    testDoubles.createEditorAdjacencyRenderer.mockReturnValue(adjacencyRenderer);
    testDoubles.createEditorZoneRenderer.mockReturnValue(zoneRenderer);
    testDoubles.createEditorRouteRenderer.mockReturnValue(routeRenderer);
    testDoubles.createEditorHandleRenderer.mockReturnValue(handleRenderer);
    testDoubles.createVertexHandleRenderer.mockReturnValue(vertexHandleRenderer);

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
    expect(testDoubles.createEditorAdjacencyRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.adjacencyLayer,
      store,
      { tag: 'provider' },
    );
    expect(testDoubles.createEditorZoneRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.cityZoneLayer,
      store,
      { tag: 'provider' },
      { dragSurface: editorCanvas.viewport },
    );
    expect(testDoubles.createEditorRouteRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.connectionRouteLayer,
      store,
      { metadata: { id: 'fitl' } },
      { tag: 'provider' },
    );
    expect(testDoubles.createEditorHandleRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.handleLayer,
      store,
      { metadata: { id: 'fitl' } },
      { tag: 'provider' },
      { dragSurface: editorCanvas.viewport },
    );
    expect(editorCanvas.centerOnContent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('map-editor-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);

    rendered.unmount();

    expect(adjacencyRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(zoneRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(routeRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(handleRenderer.destroy).toHaveBeenCalledTimes(1);
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
      gameDef: { metadata: { id: 'texas' } },
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
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue({
      layers: { backgroundLayer: {}, regionLayer: {}, provinceZoneLayer: {}, connectionRouteLayer: {}, cityZoneLayer: {}, adjacencyLayer: {}, tableOverlayLayer: {}, handleLayer: {} },
      viewport: {},
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    });
    testDoubles.createEditorAdjacencyRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorZoneRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorRouteRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorHandleRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createVertexHandleRenderer.mockReturnValue({ destroy: vi.fn() });
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
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue({
      layers: { backgroundLayer: {}, regionLayer: {}, provinceZoneLayer: {}, connectionRouteLayer: {}, cityZoneLayer: {}, adjacencyLayer: {}, tableOverlayLayer: {}, handleLayer: {} },
      viewport: {},
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    });
    testDoubles.createEditorAdjacencyRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorZoneRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorRouteRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorHandleRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createVertexHandleRenderer.mockReturnValue({ destroy: vi.fn() });
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
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue({
      layers: { backgroundLayer: {}, regionLayer: {}, provinceZoneLayer: {}, connectionRouteLayer: {}, cityZoneLayer: {}, adjacencyLayer: {}, tableOverlayLayer: {}, handleLayer: {} },
      viewport: {},
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    });
    testDoubles.createEditorAdjacencyRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorZoneRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorRouteRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorHandleRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createVertexHandleRenderer.mockReturnValue({ destroy: vi.fn() });

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
    testDoubles.resolveRunnerBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue({
      layers: { backgroundLayer: {}, regionLayer: {}, provinceZoneLayer: {}, connectionRouteLayer: {}, cityZoneLayer: {}, adjacencyLayer: {}, tableOverlayLayer: {}, handleLayer: {} },
      viewport: {},
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    });
    testDoubles.createEditorAdjacencyRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorZoneRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorRouteRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createEditorHandleRenderer.mockReturnValue({ destroy: vi.fn() });
    testDoubles.createVertexHandleRenderer.mockReturnValue({ destroy: vi.fn() });

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
