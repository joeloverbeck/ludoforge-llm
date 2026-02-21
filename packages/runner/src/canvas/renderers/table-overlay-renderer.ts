import { asPlayerId } from '@ludoforge/engine/runtime';
import { Container, Graphics, Text } from 'pixi.js';

import type { VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { TableOverlayItemConfig } from '../../config/visual-config-types.js';
import type { Position } from '../geometry';
import type { RenderModel, RenderVariable } from '../../model/render-model.js';
import type { TableOverlayRenderer } from './renderer-types.js';
import { safeDestroyChildren } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';

const DEFAULT_TEXT_COLOR = '#f8fafc';
const DEFAULT_TEXT_FONT_SIZE = 12;
const DEFAULT_MARKER_SHAPE = 'circle';
const DEFAULT_MARKER_LABEL = '*';

interface Point {
  x: number;
  y: number;
}

export function createTableOverlayRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
): TableOverlayRenderer {
  let lastSignature: string | null = null;

  return {
    update(renderModel, positions): void {
      if (renderModel === null) {
        if (lastSignature !== null) {
          clearContainer(parentContainer);
          lastSignature = null;
        }
        return;
      }

      const items = visualConfigProvider.getTableOverlays()?.items ?? [];
      if (items.length === 0) {
        if (lastSignature !== null) {
          clearContainer(parentContainer);
          lastSignature = null;
        }
        return;
      }

      const seatAnchors = deriveSeatAnchors(
        renderModel,
        positions,
        new Set(visualConfigProvider.getPlayerSeatAnchorZones()),
      );
      const tableCenter = deriveTableCenter(renderModel, positions);

      const resolvedItems = resolveOverlayItems(items, renderModel, tableCenter, seatAnchors);
      const nextSignature = buildOverlaySignature(resolvedItems);
      if (lastSignature === nextSignature) {
        return;
      }

      clearContainer(parentContainer);
      lastSignature = nextSignature;

      for (const resolved of resolvedItems) {
        if (resolved.type === 'text') {
          parentContainer.addChild(createOverlayText(resolved.text, resolved.item, resolved.point));
        } else {
          parentContainer.addChild(createMarker(resolved.item, resolved.point));
        }
      }
    },

    destroy(): void {
      clearContainer(parentContainer);
      lastSignature = null;
    },
  };
}

interface ResolvedTextItem {
  readonly type: 'text';
  readonly text: string;
  readonly item: TableOverlayItemConfig;
  readonly point: Point;
}

interface ResolvedMarkerItem {
  readonly type: 'marker';
  readonly item: TableOverlayItemConfig;
  readonly point: Point;
}

type ResolvedOverlayItem = ResolvedTextItem | ResolvedMarkerItem;

function resolveOverlayItems(
  items: readonly TableOverlayItemConfig[],
  renderModel: RenderModel,
  tableCenter: Point,
  seatAnchors: ReadonlyMap<number, Point>,
): readonly ResolvedOverlayItem[] {
  const result: ResolvedOverlayItem[] = [];

  for (const item of items) {
    switch (item.kind) {
      case 'globalVar': {
        const value = findVarValue(renderModel.globalVars, item.varName);
        if (value === null) {
          continue;
        }
        const target = resolvePosition(item, tableCenter, null);
        if (target === null) {
          continue;
        }
        result.push({ type: 'text', text: resolveOverlayLabel(item.label, value), item, point: target });
        break;
      }
      case 'perPlayerVar': {
        for (const player of renderModel.players) {
          if (player.isEliminated) {
            continue;
          }
          const target = resolvePosition(item, tableCenter, seatAnchors.get(player.id) ?? null);
          if (target === null) {
            continue;
          }
          const playerVars = renderModel.playerVars.get(player.id) ?? [];
          const value = findVarValue(playerVars, item.varName);
          if (value === null) {
            continue;
          }
          result.push({ type: 'text', text: resolveOverlayLabel(item.label, value), item, point: target });
        }
        break;
      }
      case 'marker': {
        const rawValue = findVarValue(renderModel.globalVars, item.varName);
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
          continue;
        }
        const playerId = asPlayerId(Math.trunc(rawValue));
        const target = resolvePosition(item, tableCenter, seatAnchors.get(playerId) ?? null);
        if (target === null) {
          continue;
        }
        result.push({ type: 'marker', item, point: target });
        break;
      }
    }
  }

  return result;
}

function buildOverlaySignature(items: readonly ResolvedOverlayItem[]): string {
  const parts: string[] = [];
  for (const resolved of items) {
    if (resolved.type === 'text') {
      parts.push(`t|${resolved.text}|${resolved.point.x}|${resolved.point.y}`);
    } else {
      parts.push(`m|${resolved.item.label ?? ''}|${resolved.item.markerShape ?? ''}|${resolved.point.x}|${resolved.point.y}`);
    }
  }
  return parts.join('\n');
}

function resolvePosition(item: TableOverlayItemConfig, tableCenter: Point, seatAnchor: Point | null): Point | null {
  const offsetX = item.offsetX ?? 0;
  const offsetY = item.offsetY ?? 0;

  if (item.position === 'tableCenter') {
    return { x: tableCenter.x + offsetX, y: tableCenter.y + offsetY };
  }
  if (seatAnchor === null) {
    return null;
  }
  return { x: seatAnchor.x + offsetX, y: seatAnchor.y + offsetY };
}

function deriveSeatAnchors(
  renderModel: RenderModel,
  positions: ReadonlyMap<string, Position>,
  playerSeatAnchorZones: ReadonlySet<string>,
): ReadonlyMap<number, Point> {
  const accumulators = new Map<number, { sumX: number; sumY: number; count: number }>();

  for (const zone of renderModel.zones) {
    if (!playerSeatAnchorZones.has(zone.id)) {
      continue;
    }
    if (zone.ownerID === null) {
      continue;
    }
    const position = positions.get(zone.id);
    if (position === undefined) {
      continue;
    }

    const key = Number(zone.ownerID);
    const current = accumulators.get(key) ?? { sumX: 0, sumY: 0, count: 0 };
    current.sumX += position.x;
    current.sumY += position.y;
    current.count += 1;
    accumulators.set(key, current);
  }

  const anchors = new Map<number, Point>();
  for (const [playerId, accumulator] of accumulators) {
    if (accumulator.count <= 0) {
      continue;
    }
    anchors.set(playerId, {
      x: accumulator.sumX / accumulator.count,
      y: accumulator.sumY / accumulator.count,
    });
  }

  return anchors;
}

function deriveTableCenter(
  renderModel: RenderModel,
  positions: ReadonlyMap<string, Position>,
): Point {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const zone of renderModel.zones) {
    const point = positions.get(zone.id);
    if (point === undefined) {
      continue;
    }
    sumX += point.x;
    sumY += point.y;
    count += 1;
  }

  if (count <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: sumX / count,
    y: sumY / count,
  };
}

function findVarValue(
  vars: readonly RenderVariable[],
  varName: string,
): number | boolean | null {
  const found = vars.find((entry) => entry.name === varName);
  return found?.value ?? null;
}

function resolveOverlayLabel(label: string | undefined, value: number | boolean): string {
  const valueText = String(value);
  if (label === undefined || label.length === 0) {
    return valueText;
  }
  return `${label}: ${valueText}`;
}

function createOverlayText(text: string, item: TableOverlayItemConfig, point: Point): Text {
  const label = new Text({
    text,
    style: {
      fill: item.color ?? DEFAULT_TEXT_COLOR,
      fontSize: item.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
      fontFamily: 'monospace',
    },
  });

  label.position.set(point.x, point.y);
  label.eventMode = 'none';
  label.interactiveChildren = false;
  return label;
}

function createMarker(item: TableOverlayItemConfig, point: Point): Container {
  const marker = new Container();
  marker.position.set(point.x, point.y);
  marker.eventMode = 'none';
  marker.interactiveChildren = false;

  const markerColor = parseHexColor(item.color ?? '#fbbf24', { allowNamedColors: true }) ?? 0xfbbf24;
  const markerShape = item.markerShape ?? DEFAULT_MARKER_SHAPE;

  const badge = new Graphics();
  if (markerShape === 'badge') {
    badge.roundRect(-12, -9, 24, 18, 8);
  } else {
    badge.circle(0, 0, 10);
  }
  badge.fill(markerColor);

  const markerLabel = new Text({
    text: item.label ?? DEFAULT_MARKER_LABEL,
    style: {
      fill: '#111827',
      fontSize: item.fontSize ?? 11,
      fontFamily: 'monospace',
    },
  });
  markerLabel.anchor.set(0.5, 0.5);
  markerLabel.eventMode = 'none';
  markerLabel.interactiveChildren = false;

  marker.addChild(badge, markerLabel);
  return marker;
}

function clearContainer(container: Container): void {
  safeDestroyChildren(container);
}
