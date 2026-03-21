import { asPlayerId } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { TableOverlayItemConfig } from '../config/visual-config-types.js';
import { LABEL_FONT_NAME } from '../canvas/text/bitmap-font-registry.js';
import type { WorldLayoutModel } from '../layout/world-layout-model.js';
import type { RunnerProjectionBundle, RunnerVariable, RunnerZone } from '../model/runner-frame.js';

export interface TableOverlaySurfacePoint {
  readonly x: number;
  readonly y: number;
}

export interface TableOverlayTextStyle {
  readonly color: string;
  readonly fontSize: number;
  readonly fontFamily: string;
}

export interface TableOverlayMarkerStyle {
  readonly color: string;
  readonly shape: 'circle' | 'badge';
  readonly label: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textColor: string;
}

export interface TableOverlayTextNode {
  readonly key: string;
  readonly type: 'text';
  readonly text: string;
  readonly point: TableOverlaySurfacePoint;
  readonly style: TableOverlayTextStyle;
  readonly signature: string;
}

export interface TableOverlayMarkerNode {
  readonly key: string;
  readonly type: 'marker';
  readonly point: TableOverlaySurfacePoint;
  readonly style: TableOverlayMarkerStyle;
  readonly signature: string;
}

export type TableOverlaySurfaceNode = TableOverlayTextNode | TableOverlayMarkerNode;

interface ProjectTableOverlaySurfaceOptions {
  readonly projection: RunnerProjectionBundle | null;
  readonly worldLayout: WorldLayoutModel | null;
  readonly visualConfigProvider: VisualConfigProvider;
}

const EMPTY_OVERLAY_SURFACE: readonly TableOverlaySurfaceNode[] = [];
const DEFAULT_TEXT_COLOR = '#f8fafc';
const DEFAULT_TEXT_FONT_SIZE = 12;
const DEFAULT_FONT_FAMILY = LABEL_FONT_NAME;
const DEFAULT_MARKER_COLOR = '#fbbf24';
const DEFAULT_MARKER_LABEL = '*';
const DEFAULT_MARKER_SHAPE: TableOverlayMarkerStyle['shape'] = 'circle';
const DEFAULT_MARKER_TEXT_COLOR = '#111827';

export function projectTableOverlaySurface(
  options: ProjectTableOverlaySurfaceOptions,
): readonly TableOverlaySurfaceNode[] {
  const { projection, worldLayout, visualConfigProvider } = options;
  if (projection === null || worldLayout === null) {
    return EMPTY_OVERLAY_SURFACE;
  }

  const items = visualConfigProvider.getTableOverlays()?.items ?? [];
  if (items.length === 0) {
    return EMPTY_OVERLAY_SURFACE;
  }

  const visibleZones = projection.frame.zones.filter((zone) => !visualConfigProvider.getHiddenZones().has(zone.id));
  const seatAnchors = deriveSeatAnchors(
    visibleZones,
    worldLayout.positions,
    new Set(visualConfigProvider.getPlayerSeatAnchorZones()),
  );
  const tableCenter = deriveTableCenter(worldLayout);
  const result: TableOverlaySurfaceNode[] = [];

  for (const [itemIndex, item] of items.entries()) {
    switch (item.kind) {
      case 'globalVar': {
        const value = findVarValue(projection.source.globalVars, item.varName);
        if (value === null) {
          continue;
        }
        const point = resolveOverlayPosition(item, tableCenter, null);
        if (point === null) {
          continue;
        }
        const text = resolveOverlayLabel(item.label, value);
        const style = resolveTextStyle(item);
        result.push({
          key: `overlay:${itemIndex}`,
          type: 'text',
          text,
          point,
          style,
          signature: `t|${text}|${point.x}|${point.y}|${style.color}|${style.fontSize}|${style.fontFamily}`,
        });
        break;
      }
      case 'perPlayerVar': {
        for (const player of projection.frame.players) {
          if (player.isEliminated) {
            continue;
          }
          const point = resolveOverlayPosition(item, tableCenter, seatAnchors.get(player.id) ?? null);
          if (point === null) {
            continue;
          }
          const playerVars = projection.source.playerVars.get(player.id) ?? [];
          const value = findVarValue(playerVars, item.varName);
          if (value === null) {
            continue;
          }
          const text = resolveOverlayLabel(item.label, value);
          const style = resolveTextStyle(item);
          result.push({
            key: `overlay:${itemIndex}:player:${player.id}`,
            type: 'text',
            text,
            point,
            style,
            signature: `t|${text}|${point.x}|${point.y}|${style.color}|${style.fontSize}|${style.fontFamily}`,
          });
        }
        break;
      }
      case 'marker': {
        const rawValue = findVarValue(projection.source.globalVars, item.varName);
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
          continue;
        }
        const point = resolveOverlayPosition(item, tableCenter, seatAnchors.get(asPlayerId(Math.trunc(rawValue))) ?? null);
        if (point === null) {
          continue;
        }
        const style = resolveMarkerStyle(item);
        result.push({
          key: `overlay:${itemIndex}`,
          type: 'marker',
          point,
          style,
          signature: `m|${style.label}|${style.shape}|${point.x}|${point.y}|${style.color}|${style.fontSize}|${style.fontFamily}`,
        });
        break;
      }
    }
  }

  return result;
}

export function tableOverlaySurfaceNodesEqual(
  prev: readonly TableOverlaySurfaceNode[],
  next: readonly TableOverlaySurfaceNode[],
): boolean {
  if (prev === next) {
    return true;
  }
  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index]?.signature !== next[index]?.signature) {
      return false;
    }
  }

  return true;
}

function resolveTextStyle(item: TableOverlayItemConfig): TableOverlayTextStyle {
  return {
    color: item.color ?? DEFAULT_TEXT_COLOR,
    fontSize: item.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
  };
}

function resolveMarkerStyle(item: TableOverlayItemConfig): TableOverlayMarkerStyle {
  return {
    color: item.color ?? DEFAULT_MARKER_COLOR,
    shape: item.markerShape ?? DEFAULT_MARKER_SHAPE,
    label: item.label ?? DEFAULT_MARKER_LABEL,
    fontSize: item.fontSize ?? 11,
    fontFamily: DEFAULT_FONT_FAMILY,
    textColor: DEFAULT_MARKER_TEXT_COLOR,
  };
}

function resolveOverlayPosition(
  item: TableOverlayItemConfig,
  tableCenter: TableOverlaySurfacePoint,
  seatAnchor: TableOverlaySurfacePoint | null,
): TableOverlaySurfacePoint | null {
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
  zones: readonly Pick<RunnerZone, 'id' | 'ownerID'>[],
  positions: WorldLayoutModel['positions'],
  playerSeatAnchorZones: ReadonlySet<string>,
): ReadonlyMap<number, TableOverlaySurfacePoint> {
  const accumulators = new Map<number, { sumX: number; sumY: number; count: number }>();

  for (const zone of zones) {
    if (!playerSeatAnchorZones.has(zone.id) || zone.ownerID === null) {
      continue;
    }
    const position = positions.get(zone.id);
    if (position === undefined) {
      continue;
    }

    const playerId = Number(zone.ownerID);
    const current = accumulators.get(playerId) ?? { sumX: 0, sumY: 0, count: 0 };
    current.sumX += position.x;
    current.sumY += position.y;
    current.count += 1;
    accumulators.set(playerId, current);
  }

  const anchors = new Map<number, TableOverlaySurfacePoint>();
  for (const [playerId, accumulator] of accumulators) {
    if (accumulator.count === 0) {
      continue;
    }
    anchors.set(playerId, {
      x: accumulator.sumX / accumulator.count,
      y: accumulator.sumY / accumulator.count,
    });
  }

  return anchors;
}

function deriveTableCenter(worldLayout: WorldLayoutModel): TableOverlaySurfacePoint {
  return {
    x: (worldLayout.boardBounds.minX + worldLayout.boardBounds.maxX) / 2,
    y: (worldLayout.boardBounds.minY + worldLayout.boardBounds.maxY) / 2,
  };
}

function findVarValue(
  vars: readonly RunnerVariable[],
  varName: string,
): number | boolean | null {
  const found = vars.find((entry) => entry.name === varName);
  return found?.value ?? null;
}

function resolveOverlayLabel(label: string | undefined, value: number | boolean): string {
  if (label === undefined || label.length === 0) {
    return String(value);
  }
  return `${label}: ${value}`;
}
