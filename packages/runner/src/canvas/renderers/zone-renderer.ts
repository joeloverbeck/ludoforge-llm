import { Container, Graphics, Text } from 'pixi.js';

import type { RenderMapSpace, RenderZone } from '../../model/render-model';
import type { Position } from '../geometry';
import type { ZoneRenderer } from './renderer-types';
import { ContainerPool } from './container-pool';

const ZONE_WIDTH = 180;
const ZONE_HEIGHT = 110;
const ZONE_CORNER_RADIUS = 12;

interface ZoneVisualElements {
  readonly base: Graphics;
  readonly nameLabel: Text;
  readonly tokenCountBadge: Text;
  readonly populationBadge: Text;
  readonly econBadge: Text;
  readonly terrainBadge: Text;
  readonly coastalBadge: Text;
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
      mapSpaces: readonly RenderMapSpace[],
      positions: ReadonlyMap<string, Position>,
    ): void {
      const nextZoneIds = new Set(zones.map((zone) => zone.id));
      const mapSpaceById = new Map(mapSpaces.map((mapSpace) => [mapSpace.id, mapSpace]));

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
            visuals.tokenCountBadge,
            visuals.populationBadge,
            visuals.econBadge,
            visuals.terrainBadge,
            visuals.coastalBadge,
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

        updateZoneVisuals(visuals, zone, mapSpaceById.get(zone.id));
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
  const tokenCountBadge = createText('', ZONE_WIDTH * 0.35, -ZONE_HEIGHT * 0.38, 12);

  const populationBadge = createText('', -ZONE_WIDTH * 0.42, -ZONE_HEIGHT * 0.38, 11);
  const econBadge = createText('', ZONE_WIDTH * 0.22, -ZONE_HEIGHT * 0.38, 11);
  const terrainBadge = createText('', -ZONE_WIDTH * 0.42, ZONE_HEIGHT * 0.32, 11);
  const coastalBadge = createText('', ZONE_WIDTH * 0.02, ZONE_HEIGHT * 0.32, 11);
  const markersLabel = createText('', -ZONE_WIDTH * 0.44, 18, 11);

  populationBadge.visible = false;
  econBadge.visible = false;
  terrainBadge.visible = false;
  coastalBadge.visible = false;
  tokenCountBadge.visible = false;
  markersLabel.visible = false;

  return {
    base,
    nameLabel,
    tokenCountBadge,
    populationBadge,
    econBadge,
    terrainBadge,
    coastalBadge,
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
  mapSpace: RenderMapSpace | undefined,
): void {
  drawZoneBase(visuals.base, zone);

  visuals.nameLabel.text = zone.displayName;

  const tokenTotal = zone.tokenIDs.length + zone.hiddenTokenCount;
  visuals.tokenCountBadge.text = String(tokenTotal);
  visuals.tokenCountBadge.visible = tokenTotal > 0;

  const markerText = zone.markers.map((marker) => `${marker.id}:${marker.state}`).join('  ');
  visuals.markersLabel.text = markerText;
  visuals.markersLabel.visible = markerText.length > 0;

  if (mapSpace === undefined) {
    visuals.populationBadge.visible = false;
    visuals.econBadge.visible = false;
    visuals.terrainBadge.visible = false;
    visuals.coastalBadge.visible = false;
    return;
  }

  visuals.populationBadge.text = `POP ${mapSpace.population}`;
  visuals.populationBadge.visible = true;

  visuals.econBadge.text = `EC ${mapSpace.econ}`;
  visuals.econBadge.visible = true;

  const terrainTag = mapSpace.terrainTags[0];
  if (terrainTag === undefined) {
    visuals.terrainBadge.visible = false;
  } else {
    visuals.terrainBadge.text = abbreviateTerrainTag(terrainTag);
    visuals.terrainBadge.visible = true;
  }

  visuals.coastalBadge.text = 'COAST';
  visuals.coastalBadge.visible = mapSpace.coastal;
}

function abbreviateTerrainTag(terrainTag: string): string {
  return terrainTag
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}

function drawZoneBase(base: Graphics, zone: RenderZone): void {
  const fill = resolveFillColor(zone);
  const stroke = resolveStroke(zone);

  base
    .clear()
    .roundRect(-ZONE_WIDTH / 2, -ZONE_HEIGHT / 2, ZONE_WIDTH, ZONE_HEIGHT, ZONE_CORNER_RADIUS)
    .fill({ color: fill })
    .stroke(stroke);
}

function resolveFillColor(zone: RenderZone): number {
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

function resolveStroke(zone: RenderZone): { color: number; width: number; alpha: number } {
  if (zone.isHighlighted) {
    return {
      color: 0xfacc15,
      width: 4,
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
