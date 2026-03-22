import { BitmapText, Container, Graphics, Rectangle } from 'pixi.js';
import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import {
  drawZoneShape,
  parseHexColor,
  resolveVisualDimensions,
} from '../canvas/renderers/shape-utils.js';
import { STROKE_LABEL_FONT_NAME } from '../canvas/text/bitmap-font-registry.js';
import { createManagedBitmapText } from '../canvas/text/bitmap-text-runtime.js';
import { VisualConfigProvider } from '../config/visual-config-provider.js';
import {
  ZONE_RENDER_HEIGHT,
  ZONE_RENDER_WIDTH,
} from '../layout/layout-constants.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import { isConnectionZone } from './map-editor-connection-zones.js';
import { attachZoneDragHandlers } from './map-editor-drag.js';

const ZONE_CORNER_RADIUS = 12;
const LINE_CORNER_RADIUS = 4;
const LABEL_OFFSET_Y = 14;
const LABEL_AREA_HEIGHT = 40;
const DEFAULT_FILL_COLOR = 0x4d5c6d;
const DEFAULT_STROKE_COLOR = 0x111827;
const SELECTED_STROKE_COLOR = 0xf59e0b;
const DEFAULT_STROKE_WIDTH = 2;
const SELECTED_STROKE_WIDTH = 4;

interface EditorZoneVisuals {
  readonly base: Graphics;
  readonly label: BitmapText;
}

export interface EditorZoneRenderer {
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export function createEditorZoneRenderer(
  zoneLayer: Container,
  store: MapEditorStoreApi,
  visualConfigProvider: VisualConfigProvider,
  options: {
    readonly dragSurface?: Container;
  } = {},
): EditorZoneRenderer {
  const dragSurface = options.dragSurface ?? zoneLayer;
  const state = store.getState();
  const zoneDefinitions = indexZonesById(state.gameDef, visualConfigProvider);
  const containerByZoneId = new Map<string, Container>();
  const visualsByZoneId = new Map<string, EditorZoneVisuals>();
  const cleanupByZoneId = new Map<string, () => void>();

  for (const [zoneId, zone] of zoneDefinitions) {
    if (!state.zonePositions.has(zoneId)) {
      continue;
    }

    const zoneContainer = new Container();
    zoneContainer.eventMode = 'static';
    zoneContainer.interactiveChildren = false;
    zoneContainer.cursor = 'grab';

    const base = new Graphics();
    const label = createManagedBitmapText({
      text: resolveZoneLabel(zoneId, visualConfigProvider),
      style: {
        fontName: STROKE_LABEL_FONT_NAME,
        fontSize: 14,
        fill: '#ffffff',
        stroke: { color: '#000000', width: 3 },
      },
      anchor: { x: 0.5, y: 0 },
    });

    zoneContainer.addChild(base, label);
    zoneLayer.addChild(zoneContainer);

    containerByZoneId.set(zoneId, zoneContainer);
    visualsByZoneId.set(zoneId, { base, label });
    cleanupByZoneId.set(zoneId, attachZoneDragHandlers(zoneContainer, zoneId, dragSurface, store));

    syncZoneContainer(zoneId, zone, zoneContainer, { base, label }, store.getState(), visualConfigProvider);
  }

  const unsubscribe = store.subscribe((nextState, previousState) => {
    if (
      nextState.zonePositions === previousState.zonePositions
      && nextState.selectedZoneId === previousState.selectedZoneId
    ) {
      return;
    }

    for (const [zoneId, zoneContainer] of containerByZoneId) {
      const visuals = visualsByZoneId.get(zoneId);
      const zone = zoneDefinitions.get(zoneId);
      if (visuals === undefined || zone === undefined) {
        continue;
      }
      syncZoneContainer(zoneId, zone, zoneContainer, visuals, nextState, visualConfigProvider);
    }
  });

  return {
    getContainerMap(): ReadonlyMap<string, Container> {
      return containerByZoneId;
    },

    destroy(): void {
      unsubscribe();

      for (const cleanup of cleanupByZoneId.values()) {
        cleanup();
      }
      cleanupByZoneId.clear();
      visualsByZoneId.clear();

      for (const zoneContainer of containerByZoneId.values()) {
        zoneContainer.removeFromParent();
        zoneContainer.destroy();
      }
      containerByZoneId.clear();
    },
  };
}

function syncZoneContainer(
  zoneId: string,
  zone: ZoneDef,
  zoneContainer: Container,
  visuals: EditorZoneVisuals,
  state: ReturnType<MapEditorStoreApi['getState']>,
  visualConfigProvider: VisualConfigProvider,
): void {
  const position = state.zonePositions.get(zoneId);
  if (position === undefined) {
    return;
  }

  zoneContainer.position.set(position.x, position.y);

  const visual = visualConfigProvider.resolveZoneVisual(
    zoneId,
    zone.category ?? null,
    zone.attributes ?? null,
  );
  const dimensions = resolveVisualDimensions(visual, {
    width: ZONE_RENDER_WIDTH,
    height: ZONE_RENDER_HEIGHT,
  });
  const isSelected = state.selectedZoneId === zoneId;

  visuals.label.text = resolveZoneLabel(zoneId, visualConfigProvider);
  visuals.label.position.set(0, dimensions.height / 2 + LABEL_OFFSET_Y);

  drawZoneBase(visuals.base, visual, dimensions, isSelected);
  zoneContainer.hitArea = new Rectangle(
    -dimensions.width / 2,
    -dimensions.height / 2,
    dimensions.width,
    dimensions.height + LABEL_AREA_HEIGHT,
  );
}

function drawZoneBase(
  base: Graphics,
  visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>,
  dimensions: { readonly width: number; readonly height: number },
  isSelected: boolean,
): void {
  base.clear();
  drawZoneShape(base, visual.shape, dimensions, {
    rectangleCornerRadius: ZONE_CORNER_RADIUS,
    lineCornerRadius: LINE_CORNER_RADIUS,
  });
  base.fill({
    color: parseHexColor(visual.color ?? undefined) ?? DEFAULT_FILL_COLOR,
  }).stroke({
    color: isSelected ? SELECTED_STROKE_COLOR : DEFAULT_STROKE_COLOR,
    width: isSelected ? SELECTED_STROKE_WIDTH : DEFAULT_STROKE_WIDTH,
    alpha: 1,
  });
}

function resolveZoneLabel(
  zoneId: string,
  visualConfigProvider: VisualConfigProvider,
): string {
  return visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId);
}

function indexZonesById(
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<string, ZoneDef> {
  return new Map(
    (gameDef.zones ?? [])
      .filter((zone) => !isConnectionZone(zone, visualConfigProvider))
      .map((zone) => [zone.id as string, zone]),
  );
}
