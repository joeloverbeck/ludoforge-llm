import { Container, Graphics, Rectangle, Text } from 'pixi.js';

import type { RenderZone } from '../../model/render-model';
import type { Position } from '../geometry';
import type { ZoneRenderer } from './renderer-types';
import { ContainerPool } from './container-pool';
import {
  drawZoneShape,
  parseHexColor,
  resolveVisualDimensions,
} from './shape-utils';
import {
  ZONE_RENDER_WIDTH as ZONE_WIDTH,
  ZONE_RENDER_HEIGHT as ZONE_HEIGHT,
} from '../../layout/layout-constants.js';

const ZONE_CORNER_RADIUS = 12;
const LINE_CORNER_RADIUS = 4;

interface ZoneVisualElements {
  readonly base: Graphics;
  readonly nameLabel: Text;
  readonly markersLabel: Text;
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
      zones: readonly RenderZone[],
      positions: ReadonlyMap<string, Position>,
      highlightedZoneIDs: ReadonlySet<string> = new Set<string>(),
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
            visuals.nameLabel,
            visuals.markersLabel,
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

        updateZoneVisuals(visuals, zone, highlightedZoneIDs.has(zone.id));
        const dimensions = resolveVisualDimensions(zone.visual, {
          width: ZONE_WIDTH,
          height: ZONE_HEIGHT,
        });
        zoneContainer.hitArea = new Rectangle(
          -dimensions.width / 2,
          -dimensions.height / 2,
          dimensions.width,
          dimensions.height,
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

  const nameLabel = createText('', -ZONE_WIDTH * 0.44, -10, 14);
  const markersLabel = createText('', -ZONE_WIDTH * 0.44, 18, 11);

  markersLabel.visible = false;

  return {
    base,
    nameLabel,
    markersLabel,
  };
}

function createText(text: string, x: number, y: number, fontSize: number): Text {
  const label = new Text({
    text,
    style: {
      fill: '#f5f7fa',
      fontSize,
      fontFamily: 'monospace',
    },
  });

  label.position.set(x, y);
  label.eventMode = 'none';
  label.interactiveChildren = false;
  return label;
}

function updateZoneVisuals(
  visuals: ZoneVisualElements,
  zone: RenderZone,
  isInteractionHighlighted: boolean,
): void {
  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });
  drawZoneBase(visuals.base, zone, isInteractionHighlighted);
  layoutZoneLabels(visuals, dimensions.width, dimensions.height);

  visuals.nameLabel.text = zone.displayName;

  const markerText = zone.markers.map((marker) => `${marker.displayName}:${marker.state}`).join('  ');
  visuals.markersLabel.text = markerText;
  visuals.markersLabel.visible = markerText.length > 0;
}

function drawZoneBase(base: Graphics, zone: RenderZone, isInteractionHighlighted: boolean): void {
  const fill = resolveFillColor(zone);
  const stroke = resolveStroke(zone, isInteractionHighlighted);
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
  base.fill({ color: fill }).stroke(stroke);
}

function resolveFillColor(zone: RenderZone): number {
  const visualColor = parseHexColor(zone.visual.color ?? undefined);
  if (visualColor !== null) {
    return visualColor;
  }

  if (zone.visibility === 'hidden') {
    return 0x2a2f38;
  }

  if (zone.ownerID !== null) {
    return 0x304f7a;
  }

  if (zone.visibility === 'owner') {
    return 0x3f4d5c;
  }

  return 0x4d5c6d;
}

function layoutZoneLabels(visuals: ZoneVisualElements, width: number, height: number): void {
  visuals.nameLabel.position.set(-width * 0.44, -height * 0.09);
  visuals.markersLabel.position.set(-width * 0.44, height * 0.16);
}

function resolveStroke(zone: RenderZone, isInteractionHighlighted: boolean): { color: number; width: number; alpha: number } {
  if (zone.isHighlighted) {
    return {
      color: 0xfacc15,
      width: 4,
      alpha: 1,
    };
  }

  if (isInteractionHighlighted) {
    return {
      color: 0x60a5fa,
      width: 3,
      alpha: 1,
    };
  }

  if (zone.isSelectable) {
    return {
      color: 0x93c5fd,
      width: 2,
      alpha: 0.95,
    };
  }

  return {
    color: 0x111827,
    width: 1,
    alpha: 0.7,
  };
}
