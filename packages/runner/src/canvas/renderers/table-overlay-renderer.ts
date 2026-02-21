import { asPlayerId } from '@ludoforge/engine/runtime';
import { Container, Graphics, Text } from 'pixi.js';

import type { VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { TableOverlayItemConfig } from '../../config/visual-config-types.js';
import type { Position } from '../geometry';
import type { RenderModel, RenderVariable } from '../../model/render-model.js';
import type { TableOverlayRenderer } from './renderer-types.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';

const DEFAULT_TEXT_COLOR = '#f8fafc';
const DEFAULT_TEXT_FONT_SIZE = 12;
const DEFAULT_MARKER_SHAPE = 'circle';
const DEFAULT_MARKER_LABEL = '*';

interface Point {
  x: number;
  y: number;
}

interface MarkerSlot {
  readonly container: Container;
  readonly badge: Graphics;
  readonly label: Text;
}

export function createTableOverlayRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
): TableOverlayRenderer {
  let lastSignature: string | null = null;

  const textSlots: Text[] = [];
  const markerSlots: MarkerSlot[] = [];
  let activeTextCount = 0;
  let activeMarkerCount = 0;

  function acquireTextSlot(index: number): Text {
    if (index < textSlots.length) {
      const slot = textSlots[index]!;
      slot.visible = true;
      slot.renderable = true;
      if (slot.parent !== parentContainer) {
        parentContainer.addChild(slot);
      }
      return slot;
    }
    const slot = new Text({
      text: '',
      style: {
        fill: DEFAULT_TEXT_COLOR,
        fontSize: DEFAULT_TEXT_FONT_SIZE,
        fontFamily: 'monospace',
      },
    });
    slot.eventMode = 'none';
    slot.interactiveChildren = false;
    textSlots.push(slot);
    parentContainer.addChild(slot);
    return slot;
  }

  function acquireMarkerSlot(index: number): MarkerSlot {
    if (index < markerSlots.length) {
      const slot = markerSlots[index]!;
      slot.container.visible = true;
      slot.container.renderable = true;
      if (slot.container.parent !== parentContainer) {
        parentContainer.addChild(slot.container);
      }
      return slot;
    }
    const container = new Container();
    container.eventMode = 'none';
    container.interactiveChildren = false;

    const badge = new Graphics();
    const label = new Text({
      text: DEFAULT_MARKER_LABEL,
      style: {
        fill: '#111827',
        fontSize: 11,
        fontFamily: 'monospace',
      },
    });
    label.anchor.set(0.5, 0.5);
    label.eventMode = 'none';
    label.interactiveChildren = false;

    container.addChild(badge, label);
    const slot: MarkerSlot = { container, badge, label };
    markerSlots.push(slot);
    parentContainer.addChild(container);
    return slot;
  }

  function updateTextSlot(slot: Text, resolved: ResolvedTextItem): void {
    slot.text = resolved.text;
    slot.position.set(resolved.point.x, resolved.point.y);
    const style = slot.style as { fill?: string; fontSize?: number };
    const nextFill = resolved.item.color ?? DEFAULT_TEXT_COLOR;
    const nextSize = resolved.item.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
    if (style.fill !== nextFill) {
      style.fill = nextFill;
    }
    if (style.fontSize !== nextSize) {
      style.fontSize = nextSize;
    }
  }

  function updateMarkerSlot(slot: MarkerSlot, resolved: ResolvedMarkerItem): void {
    slot.container.position.set(resolved.point.x, resolved.point.y);

    const markerColor =
      parseHexColor(resolved.item.color ?? '#fbbf24', { allowNamedColors: true }) ?? 0xfbbf24;
    const markerShape = resolved.item.markerShape ?? DEFAULT_MARKER_SHAPE;

    slot.badge.clear();
    if (markerShape === 'badge') {
      slot.badge.roundRect(-12, -9, 24, 18, 8);
    } else {
      slot.badge.circle(0, 0, 10);
    }
    slot.badge.fill(markerColor);

    slot.label.text = resolved.item.label ?? DEFAULT_MARKER_LABEL;
    const labelStyle = slot.label.style as { fontSize?: number };
    const nextSize = resolved.item.fontSize ?? 11;
    if (labelStyle.fontSize !== nextSize) {
      labelStyle.fontSize = nextSize;
    }
  }

  function hideExcessSlots(textCount: number, markerCount: number): void {
    for (let i = textCount; i < activeTextCount; i++) {
      const slot = textSlots[i] as Text | undefined;
      if (slot !== undefined) {
        slot.visible = false;
        slot.renderable = false;
        slot.removeFromParent();
      }
    }
    for (let i = markerCount; i < activeMarkerCount; i++) {
      const slot = markerSlots[i] as MarkerSlot | undefined;
      if (slot !== undefined) {
        slot.container.visible = false;
        slot.container.renderable = false;
        slot.container.removeFromParent();
      }
    }
    activeTextCount = textCount;
    activeMarkerCount = markerCount;
  }

  function destroyAllSlots(): void {
    for (const slot of textSlots) {
      safeDestroyDisplayObject(slot);
    }
    for (const slot of markerSlots) {
      safeDestroyDisplayObject(slot.container);
    }
    textSlots.length = 0;
    markerSlots.length = 0;
    activeTextCount = 0;
    activeMarkerCount = 0;
  }

  return {
    update(renderModel, positions): void {
      if (renderModel === null) {
        if (lastSignature !== null) {
          hideExcessSlots(0, 0);
          lastSignature = null;
        }
        return;
      }

      const items = visualConfigProvider.getTableOverlays()?.items ?? [];
      if (items.length === 0) {
        if (lastSignature !== null) {
          hideExcessSlots(0, 0);
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

      lastSignature = nextSignature;

      let textIndex = 0;
      let markerIndex = 0;

      for (const resolved of resolvedItems) {
        if (resolved.type === 'text') {
          const slot = acquireTextSlot(textIndex);
          updateTextSlot(slot, resolved);
          textIndex += 1;
        } else {
          const slot = acquireMarkerSlot(markerIndex);
          updateMarkerSlot(slot, resolved);
          markerIndex += 1;
        }
      }

      hideExcessSlots(textIndex, markerIndex);
    },

    destroy(): void {
      destroyAllSlots();
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
