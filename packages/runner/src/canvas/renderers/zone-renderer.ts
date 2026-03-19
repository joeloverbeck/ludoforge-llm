import { Container, Graphics, Rectangle, Text } from 'pixi.js';

import type { MarkerBadgeConfig } from '../../config/visual-config-types.js';
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
const LABEL_GAP = 8;
const LABEL_LINE_HEIGHT = 18;
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
  readonly markerBadgeConfig?: MarkerBadgeConfig | null;
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

        updateZoneVisuals(visuals, zone, highlightedZoneIDs.has(zone.id), options.markerBadgeConfig ?? null);
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
  isInteractionHighlighted: boolean,
  badgeConfig: MarkerBadgeConfig | null,
): void {
  const dimensions = resolveVisualDimensions(zone.visual, {
    width: ZONE_WIDTH,
    height: ZONE_HEIGHT,
  });
  drawZoneBase(visuals.base, zone, isInteractionHighlighted);
  updateHiddenZoneStackVisual(
    visuals.hiddenStack,
    zone.hiddenTokenCount,
    dimensions.width,
    dimensions.height,
  );
  layoutZoneLabels(visuals, dimensions.width, dimensions.height, zone.visual.shape);

  visuals.nameLabel.text = zone.displayName;

  updateMarkerBadge(visuals, zone, dimensions, badgeConfig);

  const filteredMarkers = badgeConfig === null
    ? zone.markers
    : zone.markers.filter((m) => m.id !== badgeConfig.markerId);
  const markerText = filteredMarkers.map((marker) => `${marker.displayName}:${marker.state}`).join('  ');
  visuals.markersLabel.text = markerText;
  visuals.markersLabel.visible = markerText.length > 0;
}

function drawZoneBase(base: Graphics, zone: PresentationZoneNode, isInteractionHighlighted: boolean): void {
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

function resolveFillColor(zone: PresentationZoneNode): number {
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

function layoutZoneLabels(visuals: ZoneVisualElements, width: number, height: number, shape: string): void {
  const bottomEdge = shape === 'circle'
    ? Math.min(width, height) / 2
    : height / 2;
  visuals.nameLabel.position.set(0, bottomEdge + LABEL_GAP);
  visuals.markersLabel.position.set(0, bottomEdge + LABEL_GAP + LABEL_LINE_HEIGHT);
}

function hideBadge(visuals: ZoneVisualElements): void {
  visuals.badgeGraphics.visible = false;
  visuals.badgeLabel.visible = false;
}

function updateMarkerBadge(
  visuals: ZoneVisualElements,
  zone: PresentationZoneNode,
  dimensions: { readonly width: number; readonly height: number },
  badgeConfig: MarkerBadgeConfig | null,
): void {
  if (badgeConfig === null) {
    hideBadge(visuals);
    return;
  }

  const marker = zone.markers.find((m) => m.id === badgeConfig.markerId);
  if (marker === undefined) {
    hideBadge(visuals);
    return;
  }

  const entry = badgeConfig.colorMap[marker.state];
  if (entry === undefined) {
    hideBadge(visuals);
    return;
  }

  const bw = badgeConfig.width ?? 30;
  const bh = badgeConfig.height ?? 20;
  const bx = dimensions.width / 2 - bw - 4;
  const by = dimensions.height / 2 - bh - 4;

  const fillColor = parseHexColor(entry.color);
  visuals.badgeGraphics.clear();
  visuals.badgeGraphics.roundRect(bx, by, bw, bh, 4);
  visuals.badgeGraphics.fill({ color: fillColor ?? 0x6b7280 });
  visuals.badgeGraphics.visible = true;

  visuals.badgeLabel.text = entry.abbreviation;
  visuals.badgeLabel.position.set(bx + bw / 2, by + bh / 2);
  visuals.badgeLabel.visible = true;
}

function resolveStroke(zone: PresentationZoneNode, isInteractionHighlighted: boolean): { color: number; width: number; alpha: number } {
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
