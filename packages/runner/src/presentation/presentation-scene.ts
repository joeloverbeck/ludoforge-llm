import { asPlayerId } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { RegionStyle, TableOverlayItemConfig } from '../config/visual-config-types.js';
import type { Position } from '../canvas/geometry.js';
import type { InteractionHighlights } from '../canvas/interaction-highlights.js';
import type { RenderAdjacency, RenderModel, RenderVariable, RenderZone } from '../model/render-model.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import {
  resolvePresentationTokenNodes,
  type PresentationTokenNode,
} from './token-presentation.js';
import type { TokenRenderStyleProvider } from '../canvas/renderers/renderer-types.js';

export interface PresentationOverlayPoint {
  readonly x: number;
  readonly y: number;
}

export interface PresentationTextOverlayNode {
  readonly key: string;
  readonly type: 'text';
  readonly text: string;
  readonly item: TableOverlayItemConfig;
  readonly point: PresentationOverlayPoint;
  readonly signature: string;
}

export interface PresentationMarkerOverlayNode {
  readonly key: string;
  readonly type: 'marker';
  readonly item: TableOverlayItemConfig;
  readonly point: PresentationOverlayPoint;
  readonly signature: string;
}

export type PresentationOverlayNode = PresentationTextOverlayNode | PresentationMarkerOverlayNode;

export interface PresentationRegionNode {
  readonly key: string;
  readonly label: string;
  readonly style: RegionStyle;
  readonly cornerPoints: readonly PresentationOverlayPoint[];
  readonly signature: string;
}

export interface PresentationMarkerNode {
  readonly id: string;
  readonly displayName: string;
  readonly state: string;
}

export interface PresentationZoneNode {
  readonly id: string;
  readonly displayName: string;
  readonly visibility: RenderZone['visibility'];
  readonly ownerID: RenderZone['ownerID'];
  readonly hiddenTokenCount: number;
  readonly isSelectable: boolean;
  readonly isHighlighted: boolean;
  readonly category: string | null;
  readonly attributes: RenderZone['attributes'];
  readonly visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>;
  readonly markers: readonly PresentationMarkerNode[];
}

export interface PresentationAdjacencyNode {
  readonly from: string;
  readonly to: string;
  readonly category: string | null;
  readonly isHighlighted: boolean;
}

export interface PresentationScene {
  readonly zones: readonly PresentationZoneNode[];
  readonly tokens: readonly PresentationTokenNode[];
  readonly adjacencies: readonly PresentationAdjacencyNode[];
  readonly highlightedZoneIDs: ReadonlySet<string>;
  readonly highlightedTokenIDs: ReadonlySet<string>;
  readonly overlays: readonly PresentationOverlayNode[];
  readonly regions: readonly PresentationRegionNode[];
}

interface BuildPresentationSceneOptions {
  readonly renderModel: RenderModel | null;
  readonly positions: ReadonlyMap<string, Position>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly tokenRenderStyleProvider: TokenRenderStyleProvider;
  readonly interactionHighlights: InteractionHighlights;
}

const EMPTY_ZONE_IDS: ReadonlySet<string> = new Set();
const EMPTY_TOKEN_IDS: ReadonlySet<string> = new Set();
const EMPTY_OVERLAYS: readonly PresentationOverlayNode[] = [];
const EMPTY_REGIONS: readonly PresentationRegionNode[] = [];

export function buildPresentationScene(options: BuildPresentationSceneOptions): PresentationScene {
  const { renderModel } = options;
  const highlightedZoneIDs = options.interactionHighlights.zoneIDs.length > 0
    ? new Set(options.interactionHighlights.zoneIDs)
    : EMPTY_ZONE_IDS;
  const highlightedTokenIDs = options.interactionHighlights.tokenIDs.length > 0
    ? new Set(options.interactionHighlights.tokenIDs)
    : EMPTY_TOKEN_IDS;

  if (renderModel === null) {
    return {
      zones: [],
      tokens: [],
      adjacencies: [],
      highlightedZoneIDs,
      highlightedTokenIDs,
      overlays: EMPTY_OVERLAYS,
      regions: EMPTY_REGIONS,
    };
  }

  const zones = resolveZoneNodes(renderModel.zones, options.visualConfigProvider);

  return {
    zones,
    tokens: resolvePresentationTokenNodes(
      renderModel.tokens,
      renderModel.zones,
      options.tokenRenderStyleProvider,
    ),
    adjacencies: resolveAdjacencyNodes(renderModel.adjacencies),
    highlightedZoneIDs,
    highlightedTokenIDs,
    overlays: resolveOverlayNodes(renderModel, options.positions, options.visualConfigProvider),
    regions: resolveRegionNodes(zones, options.positions, options.visualConfigProvider),
  };
}

export function resolveZoneNodes(
  zones: readonly RenderZone[],
  visualConfigProvider: VisualConfigProvider,
): readonly PresentationZoneNode[] {
  return zones.map((zone) => ({
    id: zone.id,
    displayName: visualConfigProvider.getZoneLabel(zone.id) ?? formatIdAsDisplayName(zone.id),
    visibility: zone.visibility,
    ownerID: zone.ownerID,
    hiddenTokenCount: zone.hiddenTokenCount,
    isSelectable: zone.isSelectable,
    isHighlighted: zone.isHighlighted,
    category: zone.category,
    attributes: zone.attributes,
    visual: visualConfigProvider.resolveZoneVisual(zone.id, zone.category, zone.attributes),
    markers: zone.markers.map((marker) => ({
      id: marker.id,
      displayName: formatIdAsDisplayName(marker.id),
      state: marker.state,
    })),
  }));
}

export function resolveAdjacencyNodes(
  adjacencies: readonly RenderAdjacency[],
): readonly PresentationAdjacencyNode[] {
  return adjacencies.map((adjacency) => ({
    from: adjacency.from,
    to: adjacency.to,
    category: adjacency.category,
    isHighlighted: adjacency.isHighlighted,
  }));
}

export function resolveOverlayNodes(
  renderModel: RenderModel,
  positions: ReadonlyMap<string, Position>,
  visualConfigProvider: VisualConfigProvider,
): readonly PresentationOverlayNode[] {
  const items = visualConfigProvider.getTableOverlays()?.items ?? [];
  if (items.length === 0) {
    return EMPTY_OVERLAYS;
  }

  const seatAnchors = deriveSeatAnchors(
    renderModel,
    positions,
    new Set(visualConfigProvider.getPlayerSeatAnchorZones()),
  );
  const tableCenter = deriveTableCenter(renderModel, positions);
  const result: PresentationOverlayNode[] = [];

  for (const [itemIndex, item] of items.entries()) {
    switch (item.kind) {
      case 'globalVar': {
        const value = findVarValue(renderModel.globalVars, item.varName);
        if (value === null) {
          continue;
        }
        const target = resolveOverlayPosition(item, tableCenter, null);
        if (target === null) {
          continue;
        }
        const text = resolveOverlayLabel(item.label, value);
        result.push({
          key: `overlay:${itemIndex}`,
          type: 'text',
          text,
          item,
          point: target,
          signature: `t|${text}|${target.x}|${target.y}`,
        });
        break;
      }
      case 'perPlayerVar': {
        for (const player of renderModel.players) {
          if (player.isEliminated) {
            continue;
          }
          const target = resolveOverlayPosition(item, tableCenter, seatAnchors.get(player.id) ?? null);
          if (target === null) {
            continue;
          }
          const playerVars = renderModel.playerVars.get(player.id) ?? [];
          const value = findVarValue(playerVars, item.varName);
          if (value === null) {
            continue;
          }
          const text = resolveOverlayLabel(item.label, value);
          result.push({
            key: `overlay:${itemIndex}:player:${player.id}`,
            type: 'text',
            text,
            item,
            point: target,
            signature: `t|${text}|${target.x}|${target.y}`,
          });
        }
        break;
      }
      case 'marker': {
        const rawValue = findVarValue(renderModel.globalVars, item.varName);
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
          continue;
        }
        const playerId = asPlayerId(Math.trunc(rawValue));
        const target = resolveOverlayPosition(item, tableCenter, seatAnchors.get(playerId) ?? null);
        if (target === null) {
          continue;
        }
        result.push({
          key: `overlay:${itemIndex}`,
          type: 'marker',
          item,
          point: target,
          signature: `m|${item.label ?? ''}|${item.markerShape ?? ''}|${target.x}|${target.y}`,
        });
        break;
      }
    }
  }

  return result;
}

export function resolveRegionNodes(
  zones: readonly Pick<PresentationZoneNode, 'id' | 'attributes' | 'visual'>[],
  positions: ReadonlyMap<string, Position>,
  visualConfigProvider: VisualConfigProvider,
): readonly PresentationRegionNode[] {
  const config = visualConfigProvider.getRegionBoundaryConfig();
  if (config === null) {
    return EMPTY_REGIONS;
  }

  const groupByAttribute = config.groupByAttribute ?? 'country';
  const styles = config.styles ?? {};
  const groups = groupZonesByAttribute(zones, groupByAttribute);
  const result: PresentationRegionNode[] = [];

  for (const [attributeValue, groupZones] of groups.entries()) {
    const style = styles[attributeValue];
    if (style === undefined) {
      continue;
    }

    const cornerPoints = collectZoneCornerPoints(groupZones, positions);
    if (cornerPoints.length === 0) {
      continue;
    }

    result.push({
      key: attributeValue,
      label: style.label ?? '',
      style,
      cornerPoints,
      signature: buildRegionSignature(attributeValue, cornerPoints, style),
    });
  }

  return result;
}

function resolveOverlayPosition(
  item: TableOverlayItemConfig,
  tableCenter: PresentationOverlayPoint,
  seatAnchor: PresentationOverlayPoint | null,
): PresentationOverlayPoint | null {
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
): ReadonlyMap<number, PresentationOverlayPoint> {
  const accumulators = new Map<number, { sumX: number; sumY: number; count: number }>();

  for (const zone of renderModel.zones) {
    if (!playerSeatAnchorZones.has(zone.id) || zone.ownerID === null) {
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

  const anchors = new Map<number, PresentationOverlayPoint>();
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
): PresentationOverlayPoint {
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

function groupZonesByAttribute(
  zones: readonly Pick<PresentationZoneNode, 'id' | 'attributes' | 'visual'>[],
  attribute: string,
): ReadonlyMap<string, readonly Pick<PresentationZoneNode, 'id' | 'attributes' | 'visual'>[]> {
  const groups = new Map<string, Array<Pick<PresentationZoneNode, 'id' | 'attributes' | 'visual'>>>();

  for (const zone of zones) {
    const value = zone.attributes[attribute];
    if (typeof value !== 'string') {
      continue;
    }

    let group = groups.get(value);
    if (group === undefined) {
      group = [];
      groups.set(value, group);
    }
    group.push(zone);
  }

  return groups;
}

function collectZoneCornerPoints(
  zones: readonly Pick<PresentationZoneNode, 'id' | 'visual'>[],
  positions: ReadonlyMap<string, Position>,
): readonly PresentationOverlayPoint[] {
  const points: PresentationOverlayPoint[] = [];

  for (const zone of zones) {
    const pos = positions.get(zone.id);
    if (pos === undefined) {
      continue;
    }

    const halfW = zone.visual.width / 2;
    const halfH = zone.visual.height / 2;

    points.push(
      { x: pos.x - halfW, y: pos.y - halfH },
      { x: pos.x + halfW, y: pos.y - halfH },
      { x: pos.x + halfW, y: pos.y + halfH },
      { x: pos.x - halfW, y: pos.y + halfH },
    );
  }

  return points;
}

function buildRegionSignature(
  key: string,
  cornerPoints: readonly PresentationOverlayPoint[],
  style: RegionStyle,
): string {
  return JSON.stringify({
    key,
    label: style.label ?? '',
    fillColor: style.fillColor,
    borderColor: style.borderColor ?? null,
    borderWidth: style.borderWidth ?? null,
    borderStyle: style.borderStyle ?? null,
    points: cornerPoints,
  });
}
