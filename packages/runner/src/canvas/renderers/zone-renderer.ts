import { BitmapText, Container, Graphics, Rectangle } from 'pixi.js';

import type { Position } from '../geometry';
import { parseHexColor } from '../../rendering/color-utils.js';
import type { ZoneRenderer } from './renderer-types';
import { ContainerPool } from './container-pool';
import {
  drawZoneShape,
  resolveVisualDimensions,
} from './shape-utils';
import {
  createHiddenZoneStackVisual,
  updateHiddenZoneStackVisual,
  type HiddenZoneStackVisual,
} from './hidden-zone-stack';
import {
  createZoneBadgeVisuals,
  createZoneMarkersLabel,
  updateZoneBadgeVisuals,
  updateZoneMarkersLabel,
  type ZoneBadgeVisuals,
} from './zone-presentation-visuals.js';
import {
  ZONE_RENDER_WIDTH as ZONE_WIDTH,
  ZONE_RENDER_HEIGHT as ZONE_HEIGHT,
} from '../../layout/layout-constants.js';
import { createManagedBitmapText } from '../text/bitmap-text-runtime.js';
import {
  STROKE_LABEL_FONT_NAME,
  type BitmapFontName,
} from '../text/bitmap-font-registry.js';
import type { PresentationZoneNode } from '../../presentation/presentation-scene.js';

const ZONE_CORNER_RADIUS = 12;
const LINE_CORNER_RADIUS = 4;
const LABEL_AREA_HEIGHT = 40;
const ZONE_HOVER_OVERLAY_ALPHA = 0.12;
const ZONE_HOVER_STROKE_ALPHA = 0.15;

interface ZoneVisualElements extends ZoneBadgeVisuals {
  readonly base: Graphics;
  readonly hoverOverlay: Graphics | null;
  readonly labelBackground: Graphics;
  readonly hiddenStack: HiddenZoneStackVisual;
  readonly nameLabel: BitmapText;
  readonly markersLabel: BitmapText;
}

interface ZoneRendererOptions {
  readonly bindSelection?: (
    zoneContainer: Container,
    zoneId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

export function createZoneRenderer(
  parentContainer: Container | ((category: string | null) => Container),
  pool: ContainerPool,
  options: ZoneRendererOptions = {},
): ZoneRenderer {
  const resolveParent = typeof parentContainer === 'function'
    ? parentContainer
    : () => parentContainer;
  const zoneContainers = new Map<string, Container>();
  const visualsByContainer = new WeakMap<Container, ZoneVisualElements>();
  const selectionCleanupByZoneId = new Map<string, () => void>();
  const selectableByZoneId = new Map<string, boolean>();

  return {
    update(
      zones: readonly PresentationZoneNode[],
      positions: ReadonlyMap<string, Position>,
    ): void {
      const nextZoneIds = new Set(zones.map((zone) => zone.id));

      for (const [zoneId, zoneContainer] of zoneContainers) {
        if (nextZoneIds.has(zoneId)) {
          continue;
        }

        selectableByZoneId.delete(zoneId);
        const cleanup = selectionCleanupByZoneId.get(zoneId);
        cleanup?.();
        selectionCleanupByZoneId.delete(zoneId);

        zoneContainer.removeFromParent();
        pool.release(zoneContainer);
        zoneContainers.delete(zoneId);
        visualsByContainer.delete(zoneContainer);
      }

      for (const zone of zones) {
        let zoneContainer = zoneContainers.get(zone.id);
        if (zoneContainer === undefined) {
          const editorMode = options.bindSelection !== undefined;
          zoneContainer = pool.acquire();
          zoneContainer.eventMode = editorMode ? 'static' : 'none';
          zoneContainer.interactiveChildren = false;

          const visuals = createZoneVisualElements(editorMode);
          const children: Container[] = [
            visuals.base,
          ];
          if (visuals.hoverOverlay !== null) {
            children.push(visuals.hoverOverlay);
          }
          children.push(
            visuals.hiddenStack.root,
            visuals.labelBackground,
            visuals.nameLabel,
            visuals.markersLabel,
            visuals.badgeGraphics,
            visuals.badgeLabel,
          );
          zoneContainer.addChild(...children);

          visualsByContainer.set(zoneContainer, visuals);
          zoneContainers.set(zone.id, zoneContainer);
          resolveParent(zone.category).addChild(zoneContainer);

          if (editorMode) {
            const hoverOverlay = visuals.hoverOverlay!;
            const container = zoneContainer;
            container.on('pointerover', () => {
              hoverOverlay.visible = true;
            });
            container.on('pointerout', () => {
              hoverOverlay.visible = false;
            });

            selectionCleanupByZoneId.set(
              zone.id,
              options.bindSelection!(
                zoneContainer,
                zone.id,
                () => selectableByZoneId.get(zone.id) === true,
              ),
            );
          }
        }

        selectableByZoneId.set(zone.id, zone.isSelectable);

        const visuals = visualsByContainer.get(zoneContainer);
        if (visuals === undefined) {
          continue;
        }

        const position = positions.get(zone.id);
        if (position !== undefined) {
          zoneContainer.position.set(position.x, position.y);
        }

        updateZoneVisuals(visuals, zone);
        const dimensions = resolveVisualDimensions(zone.visual, {
          width: ZONE_WIDTH,
          height: ZONE_HEIGHT,
        });
        zoneContainer.hitArea = computeZoneHitArea(zone, dimensions);
      }
    },

    getContainerMap(): ReadonlyMap<string, Container> {
      return zoneContainers;
    },

    destroy(): void {
      for (const cleanup of selectionCleanupByZoneId.values()) {
        cleanup();
      }
      selectionCleanupByZoneId.clear();
      selectableByZoneId.clear();

      for (const zoneContainer of zoneContainers.values()) {
        zoneContainer.removeFromParent();
        pool.release(zoneContainer);
        visualsByContainer.delete(zoneContainer);
      }

      zoneContainers.clear();
    },
  };
}

function createZoneVisualElements(editorMode: boolean): ZoneVisualElements {
  const base = new Graphics();
  const hoverOverlay = editorMode ? new Graphics() : null;
  if (hoverOverlay !== null) {
    hoverOverlay.visible = false;
  }
  const labelBackground = new Graphics();
  const hiddenStack = createHiddenZoneStackVisual();

  const nameLabel = createBitmapLabel('', 0, 0, LABEL_FONT_SIZE, {
    fontName: STROKE_LABEL_FONT_NAME,
    fill: '#ffffff',
    stroke: { color: '#000000', width: 4 },
    anchor: { x: 0.5, y: 0.5 },
  });
  const markersLabel = createZoneMarkersLabel();
  const { badgeGraphics, badgeLabel } = createZoneBadgeVisuals();

  return {
    base,
    hoverOverlay,
    labelBackground,
    hiddenStack,
    nameLabel,
    markersLabel,
    badgeGraphics,
    badgeLabel,
  };
}

interface BitmapLabelOptions {
  readonly fontName: BitmapFontName;
  readonly fill?: string;
  readonly stroke?: { readonly color: string; readonly width: number };
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly fontWeight?: string;
}

function createBitmapLabel(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  opts: BitmapLabelOptions,
): BitmapText {
  const labelOptions = {
    text,
    style: {
      fill: opts.fill ?? '#f5f7fa',
      fontSize,
      fontName: opts.fontName,
      ...(opts.fontWeight !== undefined ? { fontWeight: opts.fontWeight as 'bold' | 'normal' } : {}),
      ...(opts.stroke !== undefined ? { stroke: opts.stroke } : {}),
    },
    position: { x, y },
  };
  return opts.anchor === undefined
    ? createManagedBitmapText(labelOptions)
    : createManagedBitmapText({ ...labelOptions, anchor: opts.anchor });
}

function updateZoneVisuals(
  visuals: ZoneVisualElements,
  zone: PresentationZoneNode,
): void {
  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });
  drawZoneBase(visuals.base, zone);
  drawHoverOverlay(visuals.hoverOverlay, zone);
  updateHiddenZoneStackVisual(
    visuals.hiddenStack,
    zone.render.hiddenStackCount,
    dimensions.width,
    dimensions.height,
  );
  visuals.nameLabel.text = zone.render.nameLabel.text;
  visuals.nameLabel.position.set(zone.render.nameLabel.x, zone.render.nameLabel.y);
  visuals.nameLabel.visible = zone.render.nameLabel.visible;
  drawLabelBackground(visuals.labelBackground, zone.render.nameLabel);
  updateZoneMarkersLabel(visuals.markersLabel, zone.render.markersLabel);
  updateZoneBadgeVisuals(visuals, zone.render.badge);
}

const LABEL_FONT_SIZE = 34;
const LABEL_CHAR_WIDTH_FACTOR = 0.6;
const LABEL_PILL_PADDING = 10;
const LABEL_PILL_CORNER_RADIUS = 4;
const LABEL_PILL_ALPHA = 0.65;
const DEFAULT_STROKE_SIGNATURE = { color: '#111827', width: 1, alpha: 0.7 } as const;

function drawLabelBackground(
  background: Graphics,
  label: { readonly text: string; readonly x: number; readonly y: number; readonly visible: boolean },
): void {
  background.clear();
  if (!label.visible || label.text.length === 0) {
    return;
  }
  const estimatedWidth = label.text.length * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_FACTOR;
  const estimatedHeight = LABEL_FONT_SIZE;
  background
    .roundRect(
      label.x - estimatedWidth / 2 - LABEL_PILL_PADDING,
      label.y - estimatedHeight / 2 - LABEL_PILL_PADDING,
      estimatedWidth + LABEL_PILL_PADDING * 2,
      estimatedHeight + LABEL_PILL_PADDING * 2,
      LABEL_PILL_CORNER_RADIUS,
    )
    .fill({ color: 0x000000, alpha: LABEL_PILL_ALPHA });
}

function drawZoneBase(
  base: Graphics,
  zone: PresentationZoneNode,
): void {
  const fill = parseHexColor(zone.render.fillColor ?? undefined) ?? 0x4d5c6d;
  const isDefaultStroke = zone.render.stroke.color === DEFAULT_STROKE_SIGNATURE.color
    && zone.render.stroke.width === DEFAULT_STROKE_SIGNATURE.width
    && zone.render.stroke.alpha === DEFAULT_STROKE_SIGNATURE.alpha;
  const strokeColor = isDefaultStroke
    ? (parseHexColor(zone.visual.strokeColor ?? undefined) ?? 0x111827)
    : (parseHexColor(zone.render.stroke.color ?? undefined) ?? 0x111827);
  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });

  base.clear();

  drawZoneShape(base, zone.visual.shape, dimensions, {
    rectangleCornerRadius: ZONE_CORNER_RADIUS,
    lineCornerRadius: LINE_CORNER_RADIUS,
    vertices: zone.visual.vertices ?? undefined,
  });

  base.fill({ color: fill }).stroke({
    color: strokeColor,
    width: zone.render.stroke.width,
    alpha: zone.render.stroke.alpha,
  });
}

function drawHoverOverlay(
  overlay: Graphics | null,
  zone: PresentationZoneNode,
): void {
  if (overlay === null) {
    return;
  }

  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });

  overlay.clear();

  drawZoneShape(overlay, zone.visual.shape, dimensions, {
    rectangleCornerRadius: ZONE_CORNER_RADIUS,
    lineCornerRadius: LINE_CORNER_RADIUS,
    vertices: zone.visual.vertices ?? undefined,
  });

  overlay
    .fill({ color: 0xffffff, alpha: ZONE_HOVER_OVERLAY_ALPHA })
    .stroke({ color: 0xffffff, width: 1.5, alpha: ZONE_HOVER_STROKE_ALPHA });
}

function computeZoneHitArea(
  zone: PresentationZoneNode,
  dimensions: { readonly width: number; readonly height: number },
): Rectangle {
  const vertices = zone.visual.vertices;
  if (zone.visual.shape === 'polygon' && vertices !== null && vertices.length >= 6) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < vertices.length; i += 2) {
      const vx = vertices[i]!;
      const vy = vertices[i + 1]!;
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    return new Rectangle(minX, minY, maxX - minX, maxY - minY + LABEL_AREA_HEIGHT);
  }
  return new Rectangle(
    -dimensions.width / 2,
    -dimensions.height / 2,
    dimensions.width,
    dimensions.height + LABEL_AREA_HEIGHT,
  );
}
