// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  resolveMapEditorBootstrapByGameId: vi.fn(),
  getOrComputeLayout: vi.fn(),
  createMapEditorStore: vi.fn(),
  createEditorCanvas: vi.fn(),
  createEditorZoneRenderer: vi.fn(),
  createEditorRouteRenderer: vi.fn(),
  createEditorHandleRenderer: vi.fn(),
}));

vi.mock('../../src/bootstrap/map-editor-bootstrap.js', () => ({
  resolveMapEditorBootstrapByGameId: testDoubles.resolveMapEditorBootstrapByGameId,
}));

vi.mock('../../src/layout/layout-cache.js', () => ({
  getOrComputeLayout: testDoubles.getOrComputeLayout,
}));

vi.mock('../../src/map-editor/map-editor-store.js', () => ({
  createMapEditorStore: testDoubles.createMapEditorStore,
}));

vi.mock('../../src/map-editor/map-editor-canvas.js', () => ({
  createEditorCanvas: testDoubles.createEditorCanvas,
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapEditorScreen', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.resolveMapEditorBootstrapByGameId.mockReset();
    testDoubles.getOrComputeLayout.mockReset();
    testDoubles.createMapEditorStore.mockReset();
    testDoubles.createEditorCanvas.mockReset();
    testDoubles.createEditorZoneRenderer.mockReset();
    testDoubles.createEditorRouteRenderer.mockReset();
    testDoubles.createEditorHandleRenderer.mockReset();

    testDoubles.getOrComputeLayout.mockReturnValue({
      worldLayout: {
        positions: new Map([['zone:a', { x: 10, y: 20 }]]),
      },
      mode: 'graph',
    });
  });

  it('loads editor bootstrap, mounts canvas runtime, and cleans up on unmount', async () => {
    const store = createMockEditorStore();
    const zoneRenderer = { destroy: vi.fn() };
    const routeRenderer = { destroy: vi.fn() };
    const handleRenderer = { destroy: vi.fn() };
    const editorCanvas = {
      layers: { zone: { tag: 'zone-layer' }, route: { tag: 'route-layer' }, handle: { tag: 'handle-layer' } },
      viewport: { tag: 'viewport' },
      resize: vi.fn(),
      centerOnContent: vi.fn(),
      destroy: vi.fn(),
    };

    testDoubles.resolveMapEditorBootstrapByGameId.mockResolvedValue({
      descriptor: { gameMetadata: { name: 'Fire in the Lake' } },
      gameDef: { metadata: { id: 'fitl' } },
      visualConfig: { layout: {}, zones: {} },
      visualConfigProvider: { tag: 'provider' },
      capabilities: { supportsMapEditor: true },
    });
    testDoubles.createMapEditorStore.mockReturnValue(store);
    testDoubles.createEditorCanvas.mockResolvedValue(editorCanvas);
    testDoubles.createEditorZoneRenderer.mockReturnValue(zoneRenderer);
    testDoubles.createEditorRouteRenderer.mockReturnValue(routeRenderer);
    testDoubles.createEditorHandleRenderer.mockReturnValue(handleRenderer);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    const onBack = vi.fn();
    const rendered = render(createElement(MapEditorScreen, { gameId: 'fitl', onBack }));

    expect(screen.getByTestId('map-editor-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-canvas-container')).toBeTruthy();
    });
    expect((screen.getByTestId('map-editor-undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('map-editor-export-button') as HTMLButtonElement).disabled).toBe(true);

    expect(testDoubles.createMapEditorStore).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(Map),
    );
    expect(testDoubles.createEditorCanvas).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      store,
    );
    expect(testDoubles.createEditorZoneRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.zone,
      store,
      { tag: 'provider' },
      { dragSurface: editorCanvas.viewport },
    );
    expect(testDoubles.createEditorRouteRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.route,
      store,
      undefined,
      { tag: 'provider' },
    );
    expect(testDoubles.createEditorHandleRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.handle,
      store,
    );
    expect(editorCanvas.centerOnContent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('map-editor-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);

    rendered.unmount();

    expect(zoneRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(routeRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(handleRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(editorCanvas.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows an error state for unknown games', async () => {
    testDoubles.resolveMapEditorBootstrapByGameId.mockResolvedValue(null);

    const { MapEditorScreen } = await import('../../src/map-editor/MapEditorScreen.js');
    render(createElement(MapEditorScreen, { gameId: 'missing-game', onBack: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('map-editor-error')).toBeTruthy();
    });
    expect(screen.getByText('Unknown game "missing-game".')).toBeTruthy();
  });

  it('shows an error state for unsupported games', async () => {
    testDoubles.resolveMapEditorBootstrapByGameId.mockResolvedValue({
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
});

function createMockEditorStore() {
  const state = {
    showGrid: false,
    snapToGrid: false,
    gridSize: 20,
    dirty: false,
    undoStack: [],
    redoStack: [],
    undo: vi.fn(),
    redo: vi.fn(),
    toggleGrid: vi.fn(),
    setGridSize: vi.fn(),
    setSnapToGrid: vi.fn(),
    selectZone: vi.fn(),
    selectRoute: vi.fn(),
    gameDef: undefined,
  };

  const store = ((selector: (value: typeof state) => unknown) => selector(state)) as {
    (selector: (value: typeof state) => unknown): unknown;
    getState: () => typeof state;
  };
  store.getState = () => state;
  return store;
}
