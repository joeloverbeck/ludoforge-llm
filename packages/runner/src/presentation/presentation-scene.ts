import { asPlayerId } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { RegionStyle, TableOverlayItemConfig } from '../config/visual-config-types.js';
import type { Position } from '../canvas/geometry.js';
import type { InteractionHighlights } from '../canvas/interaction-highlights.js';
import type {
  RunnerAdjacency,
  RunnerFrame,
  RunnerProjectionSource,
  RunnerVariable,
  RunnerZone,
} from '../model/runner-frame.js';
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

interface PresentationStrokeSpec {
  readonly color: string;
  readonly width: number;
  readonly alpha: number;
}

interface PresentationZoneLabelSpec {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

interface PresentationZoneBadgeSpec {
  readonly text: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentationZoneRenderSpec {
  readonly fillColor: string;
  readonly stroke: PresentationStrokeSpec;
  readonly hiddenStackCount: number;
  readonly nameLabel: PresentationZoneLabelSpec;
  readonly markersLabel: PresentationZoneLabelSpec;
  readonly badge: PresentationZoneBadgeSpec | null;
}

export interface PresentationZoneNode {
  readonly id: string;
  readonly displayName: string;
  readonly ownerID: RunnerZone['ownerID'];
  readonly isSelectable: boolean;
  readonly category: string | null;
  readonly attributes: RunnerZone['attributes'];
  readonly visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>;
  readonly render: PresentationZoneRenderSpec;
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
  readonly overlays: readonly PresentationOverlayNode[];
  readonly regions: readonly PresentationRegionNode[];
}

interface BuildPresentationSceneOptions {
  readonly runnerFrame: RunnerFrame | null;
  readonly projectionSource: RunnerProjectionSource | null;
  readonly positions: ReadonlyMap<string, Position>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly tokenRenderStyleProvider: TokenRenderStyleProvider;
  readonly interactionHighlights: InteractionHighlights;
}

const EMPTY_OVERLAYS: readonly PresentationOverlayNode[] = [];
const EMPTY_REGIONS: readonly PresentationRegionNode[] = [];
const LABEL_GAP = 8;
const LABEL_LINE_HEIGHT = 18;
const ZONE_HIGHLIGHT_STROKE: PresentationStrokeSpec = { color: '#facc15', width: 4, alpha: 1 };
const ZONE_INTERACTION_STROKE: PresentationStrokeSpec = { color: '#60a5fa', width: 3, alpha: 1 };
const ZONE_SELECTABLE_STROKE: PresentationStrokeSpec = { color: '#93c5fd', width: 2, alpha: 0.95 };
const ZONE_DEFAULT_STROKE: PresentationStrokeSpec = { color: '#111827', width: 1, alpha: 0.7 };

export function buildPresentationScene(options: BuildPresentationSceneOptions): PresentationScene {
  const { projectionSource, runnerFrame } = options;
  const highlightedZoneIDs = options.interactionHighlights.zoneIDs.length > 0
    ? new Set(options.interactionHighlights.zoneIDs)
    : new Set<string>();
  const highlightedTokenIDs = options.interactionHighlights.tokenIDs.length > 0
    ? new Set(options.interactionHighlights.tokenIDs)
    : new Set<string>();

  if (runnerFrame == null || projectionSource == null) {
    return {
      zones: [],
      tokens: [],
      adjacencies: [],
      overlays: EMPTY_OVERLAYS,
      regions: EMPTY_REGIONS,
    };
  }

  const hiddenZones = options.visualConfigProvider.getHiddenZones();
  const sourceZones = runnerFrame.zones.filter((zone) => !hiddenZones.has(zone.id));
  const zones = resolveZoneNodes(sourceZones, options.visualConfigProvider, highlightedZoneIDs);
  const visibleZoneIDs = new Set(zones.map((zone) => zone.id));

  return {
    zones,
    tokens: resolvePresentationTokenNodes(
      runnerFrame.tokens.filter((token) => visibleZoneIDs.has(token.zoneID)),
      sourceZones,
      options.tokenRenderStyleProvider,
      highlightedTokenIDs,
    ),
    adjacencies: resolveAdjacencyNodes(runnerFrame.adjacencies, visibleZoneIDs),
    overlays: resolveOverlayNodes(runnerFrame, projectionSource, zones, options.positions, options.visualConfigProvider),
    regions: resolveRegionNodes(zones, options.positions, options.visualConfigProvider),
  };
}

export function resolveZoneNodes(
  zones: readonly RunnerZone[],
  visualConfigProvider: VisualConfigProvider,
  highlightedZoneIDs: ReadonlySet<string> = new Set<string>(),
): readonly PresentationZoneNode[] {
  const markerBadgeConfig = visualConfigProvider.getMarkerBadgeConfig();
  return zones.map((zone) => {
    const displayName = visualConfigProvider.getZoneLabel(zone.id) ?? formatIdAsDisplayName(zone.id);
    const visual = visualConfigProvider.resolveZoneVisual(zone.id, zone.category, zone.attributes);
    return {
      id: zone.id,
      displayName,
      ownerID: zone.ownerID,
      isSelectable: zone.isSelectable,
      category: zone.category,
      attributes: zone.attributes,
      visual,
      render: resolveZoneRenderSpec(zone, displayName, visual, highlightedZoneIDs.has(zone.id), markerBadgeConfig),
    };
  });
}

function resolveZoneRenderSpec(
  zone: RunnerZone,
  displayName: string,
  visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>,
  isInteractionHighlighted: boolean,
  markerBadgeConfig: ReturnType<VisualConfigProvider['getMarkerBadgeConfig']>,
): PresentationZoneRenderSpec {
  const bottomEdge = visual.shape === 'circle'
    ? Math.min(visual.width, visual.height) / 2
    : visual.height / 2;
  const badge = resolveZoneBadge(zone, visual, markerBadgeConfig);
  const markersLabelText = resolveMarkerLabelText(zone, markerBadgeConfig);

  return {
    fillColor: resolveZoneFillColor(zone, visual.color),
    stroke: resolveZoneStroke(zone, isInteractionHighlighted),
    hiddenStackCount: zone.hiddenTokenCount,
    nameLabel: {
      text: displayName,
      x: 0,
      y: bottomEdge + LABEL_GAP,
      visible: true,
    },
    markersLabel: {
      text: markersLabelText,
      x: 0,
      y: bottomEdge + LABEL_GAP + LABEL_LINE_HEIGHT,
      visible: markersLabelText.length > 0,
    },
    badge,
  };
}

function resolveZoneFillColor(zone: RunnerZone, visualColor: string | null | undefined): string {
  if (typeof visualColor === 'string' && visualColor.trim().length > 0) {
    return visualColor;
  }

  if (zone.visibility === 'hidden') {
    return '#2a2f38';
  }
  if (zone.ownerID !== null) {
    return '#304f7a';
  }
  if (zone.visibility === 'owner') {
    return '#3f4d5c';
  }
  return '#4d5c6d';
}

function resolveZoneStroke(zone: RunnerZone, isInteractionHighlighted: boolean): PresentationStrokeSpec {
  if (zone.isHighlighted) {
    return ZONE_HIGHLIGHT_STROKE;
  }
  if (isInteractionHighlighted) {
    return ZONE_INTERACTION_STROKE;
  }
  if (zone.isSelectable) {
    return ZONE_SELECTABLE_STROKE;
  }
  return ZONE_DEFAULT_STROKE;
}

function resolveMarkerLabelText(
  zone: RunnerZone,
  markerBadgeConfig: ReturnType<VisualConfigProvider['getMarkerBadgeConfig']>,
): string {
  const filteredMarkers = markerBadgeConfig === null
    ? zone.markers
    : zone.markers.filter((marker) => marker.id !== markerBadgeConfig.markerId);
  return filteredMarkers
    .map((marker) => `${formatIdAsDisplayName(marker.id)}:${marker.state}`)
    .join('  ');
}

function resolveZoneBadge(
  zone: RunnerZone,
  visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>,
  markerBadgeConfig: ReturnType<VisualConfigProvider['getMarkerBadgeConfig']>,
): PresentationZoneBadgeSpec | null {
  if (markerBadgeConfig === null) {
    return null;
  }

  const marker = zone.markers.find((entry) => entry.id === markerBadgeConfig.markerId);
  if (marker === undefined) {
    return null;
  }

  const badgeEntry = markerBadgeConfig.colorMap[marker.state];
  if (badgeEntry === undefined) {
    return null;
  }

  const width = markerBadgeConfig.width ?? 30;
  const height = markerBadgeConfig.height ?? 20;
  return {
    text: badgeEntry.abbreviation,
    color: badgeEntry.color,
    x: visual.width / 2 - width - 4,
    y: visual.height / 2 - height - 4,
    width,
    height,
  };
}

export function resolveAdjacencyNodes(
  adjacencies: readonly RunnerAdjacency[],
  visibleZoneIDs: ReadonlySet<string>,
): readonly PresentationAdjacencyNode[] {
  return adjacencies
    .filter((adjacency) => visibleZoneIDs.has(adjacency.from) && visibleZoneIDs.has(adjacency.to))
    .map((adjacency) => ({
      from: adjacency.from,
      to: adjacency.to,
      category: adjacency.category,
      isHighlighted: adjacency.isHighlighted,
    }));
}

export function resolveOverlayNodes(
  runnerFrame: RunnerFrame,
  projectionSource: RunnerProjectionSource,
  visibleZones: readonly Pick<PresentationZoneNode, 'id' | 'ownerID'>[],
  positions: ReadonlyMap<string, Position>,
  visualConfigProvider: VisualConfigProvider,
): readonly PresentationOverlayNode[] {
  const items = visualConfigProvider.getTableOverlays()?.items ?? [];
  if (items.length === 0) {
    return EMPTY_OVERLAYS;
  }

  const seatAnchors = deriveSeatAnchors(
    visibleZones,
    positions,
    new Set(visualConfigProvider.getPlayerSeatAnchorZones()),
  );
  const tableCenter = deriveTableCenter(visibleZones, positions);
  const result: PresentationOverlayNode[] = [];

  for (const [itemIndex, item] of items.entries()) {
    switch (item.kind) {
      case 'globalVar': {
        const value = findVarValue(projectionSource.globalVars, item.varName);
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
        for (const player of runnerFrame.players) {
          if (player.isEliminated) {
            continue;
          }
          const target = resolveOverlayPosition(item, tableCenter, seatAnchors.get(player.id) ?? null);
          if (target === null) {
            continue;
          }
          const playerVars = projectionSource.playerVars.get(player.id) ?? [];
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
        const rawValue = findVarValue(projectionSource.globalVars, item.varName);
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
  zones: readonly Pick<PresentationZoneNode, 'id' | 'ownerID'>[],
  positions: ReadonlyMap<string, Position>,
  playerSeatAnchorZones: ReadonlySet<string>,
): ReadonlyMap<number, PresentationOverlayPoint> {
  const accumulators = new Map<number, { sumX: number; sumY: number; count: number }>();

  for (const zone of zones) {
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
  zones: readonly Pick<PresentationZoneNode, 'id'>[],
  positions: ReadonlyMap<string, Position>,
): PresentationOverlayPoint {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const zone of zones) {
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
  vars: readonly RunnerVariable[],
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
