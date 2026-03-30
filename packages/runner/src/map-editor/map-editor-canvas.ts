import { Container, type FederatedPointerEvent } from 'pixi.js';

import { createGameCanvas } from '../canvas/create-app.js';
import { setupViewport, type WorldBounds } from '../canvas/viewport-setup.js';
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from '../layout/layout-constants.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import { createEditorGridRenderer } from './map-editor-grid-renderer.js';
import type { EditorCanvas, EditorLayerSet, Position } from './map-editor-types.js';

const EDITOR_BACKGROUND_COLOR = 0xf3efe4;
const DEFAULT_WORLD_SPAN = 1000;
const CONTENT_PADDING_X = Math.ceil(ZONE_RENDER_WIDTH / 2) + 80;
const CONTENT_PADDING_Y = Math.ceil(ZONE_RENDER_HEIGHT / 2) + 80;

interface CreateEditorCanvasOptions {
  readonly onPointerWorldPositionChange?: (position: Position | null) => void;
}

export async function createEditorCanvas(
  container: HTMLElement,
  store: MapEditorStoreApi,
  options: CreateEditorCanvasOptions = {},
): Promise<EditorCanvas> {
  const gameCanvas = await createGameCanvas(container, {
    backgroundColor: EDITOR_BACKGROUND_COLOR,
  });
  const layers = createEditorLayers(gameCanvas.layers.interfaceGroup);
  mountEditorLayers(gameCanvas.layers, layers);

  let contentBounds = computeEditorWorldBounds(store.getState());
  const viewportResult = setupViewport({
    stage: gameCanvas.app.stage,
    layers: gameCanvas.layers,
    screenWidth: gameCanvas.app.renderer.screen.width,
    screenHeight: gameCanvas.app.renderer.screen.height,
    worldWidth: Math.max(DEFAULT_WORLD_SPAN, contentBounds.maxX - contentBounds.minX),
    worldHeight: Math.max(DEFAULT_WORLD_SPAN, contentBounds.maxY - contentBounds.minY),
    events: gameCanvas.app.renderer.events,
    minScale: 0.2,
    maxScale: 4,
  });

  viewportResult.updateWorldBounds(contentBounds);
  viewportResult.centerOnBounds(contentBounds);

  const gridRenderer = createEditorGridRenderer(layers.background, viewportResult.viewport, store);

  const unsubscribe = store.subscribe((state, previousState) => {
    if (state.zonePositions === previousState.zonePositions) {
      return;
    }

    contentBounds = computeEditorWorldBounds(state);
    viewportResult.updateWorldBounds(contentBounds);
  });

  const onPointerMove = (event: FederatedPointerEvent): void => {
    options.onPointerWorldPositionChange?.(resolvePointerWorldPosition(event, viewportResult.viewport));
  };
  const onPointerLeave = (): void => {
    options.onPointerWorldPositionChange?.(null);
  };

  viewportResult.viewport.on('globalpointermove', onPointerMove);
  gameCanvas.app.canvas.addEventListener('pointerleave', onPointerLeave);

  return {
    app: gameCanvas.app,
    viewport: viewportResult.viewport,
    layers,
    resize(width, height) {
      gameCanvas.app.renderer.resize(width, height);
      viewportResult.resize(width, height, contentBounds);
    },
    centerOnContent() {
      viewportResult.centerOnBounds(contentBounds);
    },
    destroy() {
      unsubscribe();
      gridRenderer.destroy();
      viewportResult.viewport.off('globalpointermove', onPointerMove);
      gameCanvas.app.canvas.removeEventListener('pointerleave', onPointerLeave);
      options.onPointerWorldPositionChange?.(null);
      detachEditorLayers(layers);
      removeCanvasFromDom(gameCanvas.app.canvas);
      viewportResult.destroy();
      gameCanvas.destroy();
    },
  };
}

function createEditorLayers(interfaceGroup: Container): EditorLayerSet {
  const background = new Container();
  background.eventMode = 'none';
  background.interactiveChildren = false;
  background.sortableChildren = false;

  const adjacency = new Container();
  adjacency.eventMode = 'none';
  adjacency.interactiveChildren = false;
  adjacency.sortableChildren = true;

  const route = new Container();
  route.eventMode = 'passive';
  route.interactiveChildren = true;
  route.sortableChildren = true;

  const zone = new Container();
  zone.eventMode = 'passive';
  zone.interactiveChildren = true;
  zone.sortableChildren = true;

  interfaceGroup.eventMode = 'passive';
  interfaceGroup.interactiveChildren = true;
  interfaceGroup.sortableChildren = true;

  const handle = new Container();
  handle.eventMode = 'passive';
  handle.interactiveChildren = true;
  handle.sortableChildren = true;

  return {
    background,
    adjacency,
    route,
    zone,
    handle,
  };
}

function mountEditorLayers(
  sharedLayers: Awaited<ReturnType<typeof createGameCanvas>>['layers'],
  editorLayers: EditorLayerSet,
): void {
  sharedLayers.backgroundLayer.addChild(editorLayers.background);
  sharedLayers.adjacencyLayer.addChild(editorLayers.adjacency);
  sharedLayers.connectionRouteLayer.addChild(editorLayers.route);
  sharedLayers.cityZoneLayer.addChild(editorLayers.zone);
  sharedLayers.interfaceGroup.addChild(editorLayers.handle);
}

function detachEditorLayers(layers: EditorLayerSet): void {
  layers.background.removeFromParent();
  layers.adjacency.removeFromParent();
  layers.route.removeFromParent();
  layers.zone.removeFromParent();
  layers.handle.removeFromParent();
}

function removeCanvasFromDom(canvas: HTMLCanvasElement): void {
  canvas.parentElement?.removeChild(canvas);
}

function resolvePointerWorldPosition(
  event: Pick<FederatedPointerEvent, 'getLocalPosition'>,
  viewport: Container,
): Position {
  const localPosition = event.getLocalPosition(viewport);
  return {
    x: localPosition.x,
    y: localPosition.y,
  };
}

function computeEditorWorldBounds(
  state: Pick<ReturnType<MapEditorStoreApi['getState']>, 'gameDef' | 'zonePositions'>,
): WorldBounds {
  const zoneIDs = new Set((state.gameDef.zones ?? []).map((zone) => zone.id as string));
  const entries = zoneIDs.size === 0
    ? [...state.zonePositions.values()]
    : [...state.zonePositions.entries()]
      .filter(([zoneId]) => zoneIDs.has(zoneId))
      .map(([, position]) => position);

  if (entries.length === 0) {
    return {
      minX: -DEFAULT_WORLD_SPAN / 2,
      minY: -DEFAULT_WORLD_SPAN / 2,
      maxX: DEFAULT_WORLD_SPAN / 2,
      maxY: DEFAULT_WORLD_SPAN / 2,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of entries) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }

  return {
    minX: minX - CONTENT_PADDING_X,
    minY: minY - CONTENT_PADDING_Y,
    maxX: maxX + CONTENT_PADDING_X,
    maxY: maxY + CONTENT_PADDING_Y,
  };
}
