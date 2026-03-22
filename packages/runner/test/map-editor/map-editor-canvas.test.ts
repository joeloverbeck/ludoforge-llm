// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import { Container } from 'pixi.js';

import { createLayerHierarchy } from '../../src/canvas/layers.js';
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from '../../src/layout/layout-constants.js';
import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

const testDoubles = vi.hoisted(() => ({
  createGameCanvas: vi.fn(),
  setupViewport: vi.fn(),
  createEditorGridRenderer: vi.fn(),
}));

vi.mock('../../src/canvas/create-app.js', () => ({
  createGameCanvas: testDoubles.createGameCanvas,
}));

vi.mock('../../src/canvas/viewport-setup.js', () => ({
  setupViewport: testDoubles.setupViewport,
}));

vi.mock('../../src/map-editor/map-editor-grid-renderer.js', () => ({
  createEditorGridRenderer: testDoubles.createEditorGridRenderer,
}));

import { createEditorCanvas } from '../../src/map-editor/map-editor-canvas.js';

describe('createEditorCanvas', () => {
  beforeEach(() => {
    testDoubles.createGameCanvas.mockReset();
    testDoubles.setupViewport.mockReset();
    testDoubles.createEditorGridRenderer.mockReset();
  });

  it('reuses shared canvas bootstrap and mounts editor layers into shared hierarchy', async () => {
    const fixture = createFixture();

    const editorCanvas = await createEditorCanvas(fixture.container, fixture.store);

    expect(testDoubles.createGameCanvas).toHaveBeenCalledWith(
      fixture.container,
      expect.objectContaining({ backgroundColor: expect.any(Number) }),
    );
    expect(testDoubles.setupViewport).toHaveBeenCalledWith(expect.objectContaining({
      stage: fixture.app.stage,
      layers: fixture.sharedLayers,
    }));
    expect(testDoubles.createEditorGridRenderer).toHaveBeenCalledWith(
      editorCanvas.layers.background,
      fixture.viewportResult.viewport,
      fixture.store,
    );

    expect(editorCanvas.layers.background.parent).toBe(fixture.sharedLayers.backgroundLayer);
    expect(editorCanvas.layers.route.parent).toBe(fixture.sharedLayers.connectionRouteLayer);
    expect(editorCanvas.layers.zone.parent).toBe(fixture.sharedLayers.zoneLayer);
    expect(editorCanvas.layers.handle.parent).toBe(fixture.sharedLayers.interfaceGroup);

    expect(fixture.sharedLayers.backgroundLayer.children.at(-1)).toBe(editorCanvas.layers.background);
    expect(fixture.sharedLayers.connectionRouteLayer.children.at(-1)).toBe(editorCanvas.layers.route);
    expect(fixture.sharedLayers.zoneLayer.children.at(-1)).toBe(editorCanvas.layers.zone);
    expect(fixture.sharedLayers.interfaceGroup.children.at(-1)).toBe(editorCanvas.layers.handle);
  });

  it('recomputes viewport bounds when zone positions change and ignores non-zone entries', async () => {
    const fixture = createFixture();
    await createEditorCanvas(fixture.container, fixture.store);

    fixture.viewportResult.updateWorldBounds.mockClear();

    fixture.store.getState().moveZone('zone:a', { x: 200, y: 300 });

    expect(fixture.viewportResult.updateWorldBounds).toHaveBeenCalledTimes(1);
    expect(fixture.viewportResult.updateWorldBounds).toHaveBeenCalledWith({
      minX: 100 - contentPaddingX(),
      minY: 100 - contentPaddingY(),
      maxX: 200 + contentPaddingX(),
      maxY: 300 + contentPaddingY(),
    });
  });

  it('resizes the renderer and viewport against the latest content bounds', async () => {
    const fixture = createFixture();
    const editorCanvas = await createEditorCanvas(fixture.container, fixture.store);

    fixture.store.getState().moveZone('zone:a', { x: 200, y: 300 });
    fixture.viewportResult.resize.mockClear();

    editorCanvas.resize(640, 480);

    expect(fixture.renderer.resize).toHaveBeenCalledWith(640, 480);
    expect(fixture.viewportResult.resize).toHaveBeenCalledWith(640, 480, {
      minX: 100 - contentPaddingX(),
      minY: 100 - contentPaddingY(),
      maxX: 200 + contentPaddingX(),
      maxY: 300 + contentPaddingY(),
    });
  });

  it('centers on content and destroys subscriptions, layers, and pixi resources', async () => {
    const fixture = createFixture();
    const editorCanvas = await createEditorCanvas(fixture.container, fixture.store);

    editorCanvas.centerOnContent();
    expect(fixture.viewportResult.centerOnBounds).toHaveBeenCalledWith({
      minX: 0 - contentPaddingX(),
      minY: 0 - contentPaddingY(),
      maxX: 100 + contentPaddingX(),
      maxY: 100 + contentPaddingY(),
    });

    fixture.viewportResult.updateWorldBounds.mockClear();
    editorCanvas.destroy();

    expect(fixture.container.contains(fixture.canvas)).toBe(false);
    expect(editorCanvas.layers.background.parent).toBeNull();
    expect(editorCanvas.layers.route.parent).toBeNull();
    expect(editorCanvas.layers.zone.parent).toBeNull();
    expect(editorCanvas.layers.handle.parent).toBeNull();
    expect(fixture.viewportResult.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.gameCanvas.destroy).toHaveBeenCalledTimes(1);

    fixture.store.getState().moveZone('zone:a', { x: 10, y: 20 });
    expect(fixture.viewportResult.updateWorldBounds).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  const sharedLayers = createLayerHierarchy();
  const stage = new Container();
  const renderer = {
    screen: { width: 1024, height: 768 },
    events: { tag: 'events' },
    resize: vi.fn(),
  };
  const app = {
    canvas,
    stage,
    renderer,
  };
  const gameCanvas = {
    app,
    layers: sharedLayers,
    destroy: vi.fn(),
  };
  const viewportResult = {
    viewport: new Container(),
    worldLayers: [],
    updateWorldBounds: vi.fn(),
    resize: vi.fn(),
    centerOnBounds: vi.fn(),
    destroy: vi.fn(),
  };
  const gridRenderer = {
    destroy: vi.fn(),
  };

  testDoubles.createGameCanvas.mockImplementation(async (targetContainer: HTMLElement) => {
    targetContainer.appendChild(canvas);
    return gameCanvas;
  });
  testDoubles.setupViewport.mockReturnValue(viewportResult);
  testDoubles.createEditorGridRenderer.mockReturnValue(gridRenderer);

  const store = createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [
        { id: 'zone:a' },
        { id: 'zone:b' },
      ],
    } as unknown as GameDef,
    {
      layout: {},
      zones: {},
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
      ['zone:b', { x: 100, y: 100 }],
      ['route:extra', { x: 999, y: 999 }],
    ]),
  );

  return {
    app,
    canvas,
    container,
    gameCanvas,
    renderer,
    sharedLayers,
    store,
    gridRenderer,
    viewportResult,
  };
}

function contentPaddingX(): number {
  return Math.ceil(ZONE_RENDER_WIDTH / 2) + 80;
}

function contentPaddingY(): number {
  return Math.ceil(ZONE_RENDER_HEIGHT / 2) + 80;
}
