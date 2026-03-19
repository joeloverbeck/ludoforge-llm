import { Container, Graphics, Rectangle, Text } from 'pixi.js';

import type { Position } from '../geometry';
import type { ZoneRenderer } from './renderer-types';
import { ContainerPool } from './container-pool';
import {
  drawZoneShape,
  parseHexColor,
  resolveVisualDimensions,
} from './shape-utils';
import {
  createHiddenZoneStackVisual,
  updateHiddenZoneStackVisual,
  type HiddenZoneStackVisual,
} from './hidden-zone-stack';
import {
  ZONE_RENDER_WIDTH as ZONE_WIDTH,
  ZONE_RENDER_HEIGHT as ZONE_HEIGHT,
} from '../../layout/layout-constants.js';
import { createManagedText } from '../text/text-runtime.js';
import type { PresentationZoneNode } from '../../presentation/presentation-scene.js';

const ZONE_CORNER_RADIUS = 12;
const LINE_CORNER_RADIUS = 4;
const LABEL_AREA_HEIGHT = 40;

interface ZoneVisualElements {
  readonly base: Graphics;
  readonly hiddenStack: HiddenZoneStackVisual;
  readonly nameLabel: Text;
  readonly markersLabel: Text;
  readonly badgeGraphics: Graphics;
  readonly badgeLabel: Text;
}

interface ZoneRendererOptions {
  readonly bindSelection?: (
    zoneContainer: Container,
    zoneId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

export function createZoneRenderer(
  parentContainer: Container,
  pool: ContainerPool,
  options: ZoneRendererOptions = {},
): ZoneRenderer {
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
          zoneContainer = pool.acquire();
          zoneContainer.eventMode = options.bindSelection === undefined ? 'none' : 'static';
          zoneContainer.interactiveChildren = false;

          const visuals = createZoneVisualElements();
          zoneContainer.addChild(
            visuals.base,
            visuals.hiddenStack.root,
            visuals.nameLabel,
            visuals.markersLabel,
            visuals.badgeGraphics,
            visuals.badgeLabel,
          );

          visualsByContainer.set(zoneContainer, visuals);
          zoneContainers.set(zone.id, zoneContainer);
          parentContainer.addChild(zoneContainer);

          if (options.bindSelection !== undefined) {
            selectionCleanupByZoneId.set(
              zone.id,
              options.bindSelection(
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
        zoneContainer.hitArea = new Rectangle(
          -dimensions.width / 2,
          -dimensions.height / 2,
          dimensions.width,
          dimensions.height + LABEL_AREA_HEIGHT,
        );
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

function createZoneVisualElements(): ZoneVisualElements {
  const base = new Graphics();
  const hiddenStack = createHiddenZoneStackVisual();

  const nameLabel = createText('', 0, 0, 14, {
    fill: '#ffffff',
    stroke: { color: '#000000', width: 3 },
    anchor: { x: 0.5, y: 0 },
  });
  const markersLabel = createText('', 0, 0, 11, {
    fill: '#f5f7fa',
    stroke: { color: '#000000', width: 2 },
    anchor: { x: 0.5, y: 0 },
  });

  markersLabel.visible = false;

  const badgeGraphics = new Graphics();
  badgeGraphics.eventMode = 'none';
  badgeGraphics.interactiveChildren = false;
  badgeGraphics.visible = false;

  const badgeLabel = createText('', 0, 0, 10, {
    fill: '#ffffff',
    anchor: { x: 0.5, y: 0.5 },
    fontWeight: 'bold',
  });
  badgeLabel.visible = false;

  return {
    base,
    hiddenStack,
    nameLabel,
    markersLabel,
    badgeGraphics,
    badgeLabel,
  };
}

interface TextOptions {
  readonly fill?: string;
  readonly stroke?: { readonly color: string; readonly width: number };
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly fontWeight?: string;
}

function createText(text: string, x: number, y: number, fontSize: number, opts: TextOptions = {}): Text {
  const labelOptions = {
    text,
    style: {
      fill: opts.fill ?? '#f5f7fa',
      fontSize,
      fontFamily: 'monospace',
      ...(opts.fontWeight !== undefined ? { fontWeight: opts.fontWeight as 'bold' | 'normal' } : {}),
      ...(opts.stroke !== undefined ? { stroke: opts.stroke } : {}),
    },
    position: { x, y },
  };
  return opts.anchor === undefined
    ? createManagedText(labelOptions)
    : createManagedText({ ...labelOptions, anchor: opts.anchor });
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
  updateHiddenZoneStackVisual(
    visuals.hiddenStack,
    zone.render.hiddenStackCount,
    dimensions.width,
    dimensions.height,
  );
  visuals.nameLabel.text = zone.render.nameLabel.text;
  visuals.nameLabel.position.set(zone.render.nameLabel.x, zone.render.nameLabel.y);
  visuals.nameLabel.visible = zone.render.nameLabel.visible;
  visuals.markersLabel.text = zone.render.markersLabel.text;
  visuals.markersLabel.position.set(zone.render.markersLabel.x, zone.render.markersLabel.y);
  visuals.markersLabel.visible = zone.render.markersLabel.visible;
  updateMarkerBadge(visuals, zone.render.badge);
}

function drawZoneBase(base: Graphics, zone: PresentationZoneNode): void {
  const fill = parseHexColor(zone.render.fillColor ?? undefined) ?? 0x4d5c6d;
  const strokeColor = parseHexColor(zone.render.stroke.color ?? undefined) ?? 0x111827;
  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });
  const shape = zone.visual.shape;

  base.clear();
  drawZoneShape(base, shape, dimensions, {
    rectangleCornerRadius: ZONE_CORNER_RADIUS,
    lineCornerRadius: LINE_CORNER_RADIUS,
  });
  base.fill({ color: fill }).stroke({
    color: strokeColor,
    width: zone.render.stroke.width,
    alpha: zone.render.stroke.alpha,
  });
}

function hideBadge(visuals: ZoneVisualElements): void {
  visuals.badgeGraphics.visible = false;
  visuals.badgeLabel.visible = false;
}

function updateMarkerBadge(
  visuals: ZoneVisualElements,
  badge: PresentationZoneNode['render']['badge'],
): void {
  if (badge === null) {
    hideBadge(visuals);
    return;
  }

  const fillColor = parseHexColor(badge.color);
  visuals.badgeGraphics.clear();
  visuals.badgeGraphics.roundRect(badge.x, badge.y, badge.width, badge.height, 4);
  visuals.badgeGraphics.fill({ color: fillColor ?? 0x6b7280 });
  visuals.badgeGraphics.visible = true;

  visuals.badgeLabel.text = badge.text;
  visuals.badgeLabel.position.set(badge.x + badge.width / 2, badge.y + badge.height / 2);
  visuals.badgeLabel.visible = true;
}
