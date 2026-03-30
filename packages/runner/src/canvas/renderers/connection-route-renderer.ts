import { Container, Graphics, Polygon, type BitmapText } from 'pixi.js';

import type { VisualConfigProvider } from '../../config/visual-config-provider.js';
import { sampleResolvedRoutePath } from '../../presentation/connection-route-geometry.js';
import type { ConnectionRouteNode, JunctionNode } from '../../presentation/connection-route-resolver.js';
import type { Position } from '../geometry.js';
import {
  normalize,
  perpendicular,
} from '../geometry/bezier-utils.js';
import {
  STROKE_LABEL_FONT_NAME,
} from '../text/bitmap-font-registry.js';
import { createManagedBitmapText, destroyManagedBitmapText } from '../text/bitmap-text-runtime.js';
import { parseHexColor } from '../../rendering/color-utils.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import {
  createZoneBadgeVisuals,
  createZoneMarkersLabel,
  updateZoneBadgeVisuals,
  updateZoneMarkersLabel,
  type ZoneBadgeVisuals,
} from './zone-presentation-visuals.js';
import type { ConnectionRouteRenderer } from './renderer-types.js';

interface ConnectionRouteRendererOptions {
  readonly junctionRadius?: number;
  readonly hitAreaPadding?: number;
  readonly curveSegments?: number;
  readonly wavySegments?: number;
  readonly bindSelection?: (
    zoneContainer: Container,
    zoneId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

interface RouteSlot extends ZoneBadgeVisuals {
  readonly root: Container;
  readonly curve: Graphics;
  readonly midpoint: Container;
  readonly labelCluster: Container;
  readonly label: BitmapText;
  readonly markersLabel: BitmapText;
}

const DEFAULT_JUNCTION_RADIUS = 6;
const DEFAULT_HIT_AREA_PADDING = 12;
const DEFAULT_CURVE_SEGMENTS = 24;
const DEFAULT_WAVY_SEGMENTS = 32;
const ROUTE_NAME_LABEL_Y = 0;
const ROUTE_MARKERS_LABEL_Y = 18;
const UPSIDE_DOWN_MIN = Math.PI / 2;
const UPSIDE_DOWN_MAX = (Math.PI * 3) / 2;
const DEFAULT_ROUTE_STROKE = {
  color: 0x6b7280,
  width: 4,
  alpha: 0.85,
} as const;
const ROUTE_OVERLAP_MARGIN = 35;
const DEFAULT_ZONE_STROKE_SIGNATURE = {
  color: '#111827',
  width: 1,
  alpha: 0.7,
} as const;

export function createConnectionRouteRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
  options: ConnectionRouteRendererOptions = {},
): ConnectionRouteRenderer {
  const routeSlots = new Map<string, RouteSlot>();
  const routeContainers = new Map<string, Container>();
  const junctionGraphics = new Map<string, Graphics>();
  const selectableByRouteId = new Map<string, boolean>();
  const selectionCleanupByRouteId = new Map<string, () => void>();

  const junctionRadius = options.junctionRadius ?? DEFAULT_JUNCTION_RADIUS;
  const hitAreaPadding = options.hitAreaPadding ?? DEFAULT_HIT_AREA_PADDING;
  const curveSegments = options.curveSegments ?? DEFAULT_CURVE_SEGMENTS;
  const wavySegments = options.wavySegments ?? DEFAULT_WAVY_SEGMENTS;

  return {
    update(
      routes: readonly ConnectionRouteNode[],
      junctions: readonly JunctionNode[],
      _positions: ReadonlyMap<string, Position>,
    ): void {
      const routeById = new Map(routes.map((route) => [route.zoneId, route]));
      const strokeByRouteId = new Map<string, ResolvedStroke>();

      for (const [routeId, slot] of routeSlots) {
        if (routeById.has(routeId)) {
          continue;
        }
        selectableByRouteId.delete(routeId);
        selectionCleanupByRouteId.get(routeId)?.();
        selectionCleanupByRouteId.delete(routeId);
        destroyRouteSlot(slot);
        routeSlots.delete(routeId);
        routeContainers.delete(routeId);
      }

      for (const route of routes) {
        const slot = getOrCreateRouteSlot(
          route.zoneId,
          routeSlots,
          routeContainers,
          parentContainer,
          options.bindSelection,
          selectableByRouteId,
          selectionCleanupByRouteId,
        );
        const resolvedStroke = resolveRouteStroke(route, visualConfigProvider);
        strokeByRouteId.set(route.zoneId, resolvedStroke);
        const routeGeometry = resolveRouteGeometry(route, {
          hitAreaPadding,
          curveSegments,
          wavySegments,
          stroke: resolvedStroke,
        });

        drawRouteCurve(slot.curve, routeGeometry, route.spurs);

        slot.root.visible = true;
        slot.root.renderable = true;
        slot.root.hitArea = routeGeometry.hitArea;
        slot.midpoint.position.set(routeGeometry.midpoint.x, routeGeometry.midpoint.y);
        slot.midpoint.visible = true;
        slot.midpoint.hitArea = translatePolygon(
          routeGeometry.hitArea,
          -routeGeometry.midpoint.x,
          -routeGeometry.midpoint.y,
        );
        slot.labelCluster.rotation = resolveLabelRotation(Math.atan2(
          routeGeometry.tangent.y,
          routeGeometry.tangent.x,
        ));
        slot.label.text = route.displayName;
        slot.label.visible = true;
        updateZoneMarkersLabel(slot.markersLabel, route.zone.render.markersLabel, {
          y: ROUTE_MARKERS_LABEL_Y,
        });
        updateZoneBadgeVisuals(slot, route.zone.render.badge);
        selectableByRouteId.set(route.zoneId, route.zone.isSelectable);
      }

      const junctionById = new Map(junctions.map((junction) => [junction.id, junction]));
      for (const [junctionId, graphics] of junctionGraphics) {
        if (junctionById.has(junctionId)) {
          continue;
        }
        safeDestroyDisplayObject(graphics);
        junctionGraphics.delete(junctionId);
      }

      for (const junction of junctions) {
        let graphics = junctionGraphics.get(junction.id);
        if (graphics === undefined) {
          graphics = new Graphics();
          graphics.eventMode = 'none';
          graphics.interactiveChildren = false;
          junctionGraphics.set(junction.id, graphics);
          parentContainer.addChild(graphics);
        }

        const junctionColor = resolveJunctionColor(junction, strokeByRouteId);
        graphics
          .clear()
          .circle(junction.position.x, junction.position.y, junctionRadius)
          .fill({ color: junctionColor, alpha: 0.95 });
      }
    },

    getContainerMap(): ReadonlyMap<string, Container> {
      return routeContainers;
    },

    destroy(): void {
      for (const slot of routeSlots.values()) {
        destroyRouteSlot(slot);
      }
      routeSlots.clear();
      routeContainers.clear();

      for (const graphics of junctionGraphics.values()) {
        safeDestroyDisplayObject(graphics);
      }
      junctionGraphics.clear();
      for (const cleanup of selectionCleanupByRouteId.values()) {
        cleanup();
      }
      selectionCleanupByRouteId.clear();
      selectableByRouteId.clear();
    },
  };
}

function getOrCreateRouteSlot(
  routeId: string,
  routeSlots: Map<string, RouteSlot>,
  routeContainers: Map<string, Container>,
  parentContainer: Container,
  bindSelection: ConnectionRouteRendererOptions['bindSelection'],
  selectableByRouteId: Map<string, boolean>,
  selectionCleanupByRouteId: Map<string, () => void>,
): RouteSlot {
  const existing = routeSlots.get(routeId);
  if (existing !== undefined) {
    return existing;
  }

  const root = new Container();
  root.eventMode = 'passive';
  root.interactiveChildren = true;
  const curve = new Graphics();
  const midpoint = new Container();
  midpoint.eventMode = bindSelection === undefined ? 'none' : 'static';
  midpoint.interactiveChildren = false;
  const labelCluster = new Container();
  labelCluster.eventMode = 'none';
  labelCluster.interactiveChildren = false;
  const label = createManagedBitmapText({
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fill: '#f8fafc',
      fontSize: 12,
      stroke: { color: '#000000', width: 3 },
    },
    anchor: { x: 0.5, y: 0.5 },
    position: { x: 0, y: ROUTE_NAME_LABEL_Y },
    visible: false,
  });
  const markersLabel = createZoneMarkersLabel({ x: 0, y: ROUTE_MARKERS_LABEL_Y });
  const { badgeGraphics, badgeLabel } = createZoneBadgeVisuals();

  labelCluster.addChild(label, markersLabel, badgeGraphics, badgeLabel);
  midpoint.addChild(labelCluster);
  root.addChild(curve, midpoint);
  parentContainer.addChild(root);

  const slot: RouteSlot = {
    root,
    curve,
    midpoint,
    labelCluster,
    label,
    markersLabel,
    badgeGraphics,
    badgeLabel,
  };
  routeSlots.set(routeId, slot);
  routeContainers.set(routeId, midpoint);
  if (bindSelection !== undefined) {
    selectionCleanupByRouteId.set(
      routeId,
      bindSelection(
        midpoint,
        routeId,
        () => selectableByRouteId.get(routeId) === true,
      ),
    );
  }
  return slot;
}

function destroyRouteSlot(slot: RouteSlot): void {
  destroyManagedBitmapText(slot.badgeLabel);
  destroyManagedBitmapText(slot.markersLabel);
  destroyManagedBitmapText(slot.label);
  safeDestroyDisplayObject(slot.root, { children: true });
}

interface ResolvedStroke {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
  readonly wavy: boolean;
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
}

interface RouteGeometry {
  readonly drawMode: 'segments' | 'polyline';
  readonly points: readonly Position[];
  readonly segments: readonly (
    | { readonly kind: 'straight'; readonly end: Position }
    | { readonly kind: 'quadratic'; readonly controlPoint: Position; readonly end: Position }
  )[];
  readonly midpoint: Position;
  readonly tangent: Position;
  readonly hitArea: Polygon;
  readonly stroke: ResolvedStroke;
}

function resolveRouteStroke(
  route: ConnectionRouteNode,
  visualConfigProvider: VisualConfigProvider,
): ResolvedStroke {
  const routeStyle = route.connectionStyleKey === null
    ? null
    : visualConfigProvider.resolveConnectionStyle(route.connectionStyleKey);
  const routeStrokeColor = parseHexColor(route.zone.render.stroke.color, { allowNamedColors: true });
  const baseColor = parseHexColor(routeStyle?.strokeColor, { allowNamedColors: true })
    ?? routeStrokeColor
    ?? DEFAULT_ROUTE_STROKE.color;

  const interactionStroke = route.zone.render.stroke;
  const useInteractionStroke = !isDefaultZoneStroke(interactionStroke);

  return {
    color: useInteractionStroke ? (routeStrokeColor ?? baseColor) : baseColor,
    width: useInteractionStroke
      ? interactionStroke.width
      : sanitizePositiveNumber(routeStyle?.strokeWidth, DEFAULT_ROUTE_STROKE.width),
    alpha: useInteractionStroke
      ? interactionStroke.alpha
      : sanitizeUnitInterval(routeStyle?.strokeAlpha, DEFAULT_ROUTE_STROKE.alpha),
    wavy: routeStyle?.wavy === true,
    waveAmplitude: sanitizePositiveNumber(routeStyle?.waveAmplitude, 4),
    waveFrequency: sanitizePositiveNumber(routeStyle?.waveFrequency, 0.08),
  };
}

function isDefaultZoneStroke(stroke: {
  readonly color: string;
  readonly width: number;
  readonly alpha: number;
}): boolean {
  return (
    stroke.color === DEFAULT_ZONE_STROKE_SIGNATURE.color &&
    stroke.width === DEFAULT_ZONE_STROKE_SIGNATURE.width &&
    stroke.alpha === DEFAULT_ZONE_STROKE_SIGNATURE.alpha
  );
}

function drawRouteCurve(
  graphics: Graphics,
  geometry: RouteGeometry,
  spurs: ConnectionRouteNode['spurs'],
): void {
  const { drawMode, points, segments, stroke } = geometry;
  graphics.clear();

  if (drawMode === 'segments') {
    const start = points[0];
    if (start === undefined) {
      return;
    }
    graphics.moveTo(start.x, start.y);
    for (const segment of segments) {
      if (segment.kind === 'straight') {
        graphics.lineTo(segment.end.x, segment.end.y);
        continue;
      }
      graphics.quadraticCurveTo(
        segment.controlPoint.x,
        segment.controlPoint.y,
        segment.end.x,
        segment.end.y,
      );
    }
    drawSpurSegments(graphics, spurs);
    graphics.stroke({
      color: stroke.color,
      width: stroke.width,
      alpha: stroke.alpha,
    });
    return;
  }

  const firstPoint = points[0];
  if (firstPoint === undefined) {
    return;
  }

  graphics.moveTo(firstPoint.x, firstPoint.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) {
      continue;
    }
    graphics.lineTo(point.x, point.y);
  }
  drawSpurSegments(graphics, spurs);

  graphics.stroke({
    color: stroke.color,
    width: stroke.width,
    alpha: stroke.alpha,
  });
}

function extendRouteEndpoints(
  points: readonly Position[],
  margin: number,
): readonly Position[] {
  if (points.length < 2) {
    return points;
  }
  const result = [...points];
  const first = points[0]!;
  const second = points[1]!;
  const len1 = Math.hypot(first.x - second.x, first.y - second.y);
  if (len1 > 0) {
    result[0] = {
      x: first.x + ((first.x - second.x) / len1) * margin,
      y: first.y + ((first.y - second.y) / len1) * margin,
    };
  }
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const len2 = Math.hypot(last.x - prev.x, last.y - prev.y);
  if (len2 > 0) {
    result[result.length - 1] = {
      x: last.x + ((last.x - prev.x) / len2) * margin,
      y: last.y + ((last.y - prev.y) / len2) * margin,
    };
  }
  return result;
}

function resolveRouteGeometry(
  route: ConnectionRouteNode,
  options: {
    readonly hitAreaPadding: number;
    readonly curveSegments: number;
    readonly wavySegments: number;
    readonly stroke: ResolvedStroke;
  },
): RouteGeometry {
  const { hitAreaPadding, curveSegments, wavySegments, stroke } = options;
  const routePoints = route.path.map((point) => point.position);
  const extendedPoints = extendRouteEndpoints(routePoints, ROUTE_OVERLAP_MARGIN);
  const segmentCommands = buildSegmentCommands(route);
  const sampledPath = sampleResolvedRoutePath(extendedPoints, route.segments, curveSegments);
  const renderedPoints = stroke.wavy
    ? samplePolylineWavePoints(sampledPath, stroke, wavySegments)
    : sampledPath;
  const midpointSample = resolvePolylinePointAtDistance(sampledPath, getPolylineLength(sampledPath) / 2);

  return {
    drawMode: stroke.wavy ? 'polyline' : 'segments',
    points: renderedPoints,
    segments: segmentCommands,
    midpoint: midpointSample.position,
    tangent: midpointSample.tangent,
    hitArea: new Polygon(flattenPoints(approximatePolylineHitPolygon(
      renderedPoints,
      stroke.width / 2 + hitAreaPadding,
    ))),
    stroke,
  };
}

function buildSegmentCommands(
  route: ConnectionRouteNode,
): readonly (
  | { readonly kind: 'straight'; readonly end: Position }
  | { readonly kind: 'quadratic'; readonly controlPoint: Position; readonly end: Position }
)[] {
  const commands: Array<
    | { readonly kind: 'straight'; readonly end: Position }
    | { readonly kind: 'quadratic'; readonly controlPoint: Position; readonly end: Position }
  > = [];

  for (let index = 0; index < route.segments.length; index += 1) {
    const segment = route.segments[index];
    const end = route.path[index + 1]?.position;
    if (segment === undefined || end === undefined) {
      continue;
    }

    commands.push(
      segment.kind === 'straight'
        ? { kind: 'straight', end }
        : { kind: 'quadratic', controlPoint: segment.controlPoint.position, end },
    );
  }

  return commands;
}

function drawSpurSegments(graphics: Graphics, spurs: ConnectionRouteNode['spurs']): void {
  for (const spur of spurs) {
    graphics.moveTo(spur.from.x, spur.from.y);
    graphics.lineTo(spur.to.x, spur.to.y);
  }
}

function samplePolylineWavePoints(
  points: readonly Position[],
  stroke: ResolvedStroke,
  wavySegments: number,
): readonly Position[] {
  const totalLength = getPolylineLength(points);
  if (totalLength === 0) {
    return [...points];
  }

  const segmentCount = Math.max(2, Math.trunc(wavySegments));
  const waveCycles = Math.max(1, totalLength * stroke.waveFrequency);
  const displacedPoints: Position[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const distance = totalLength * (index / segmentCount);
    const sample = resolvePolylinePointAtDistance(points, distance);
    const normal = perpendicular(normalize(sample.tangent));
    const offset = Math.sin((distance / totalLength) * Math.PI * 2 * waveCycles) * stroke.waveAmplitude;
    displacedPoints.push({
      x: sample.position.x + normal.x * offset,
      y: sample.position.y + normal.y * offset,
    });
  }

  return displacedPoints;
}

function getPolylineLength(points: readonly Position[]): number {
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return totalLength;
}

function resolvePolylinePointAtDistance(
  points: readonly Position[],
  distance: number,
): { position: Position; tangent: Position } {
  if (points.length === 0) {
    return {
      position: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
    };
  }

  if (points.length === 1) {
    return {
      position: points[0] ?? { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
    };
  }

  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start === undefined || end === undefined) {
      continue;
    }

    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (segmentLength === 0) {
      continue;
    }

    if (distance <= traversed + segmentLength || index === points.length - 1) {
      const clampedDistance = Math.min(Math.max(distance - traversed, 0), segmentLength);
      const t = clampedDistance / segmentLength;
      return {
        position: {
          x: start.x + ((end.x - start.x) * t),
          y: start.y + ((end.y - start.y) * t),
        },
        tangent: {
          x: end.x - start.x,
          y: end.y - start.y,
        },
      };
    }

    traversed += segmentLength;
  }

  const fallbackStart = points[points.length - 2] ?? points[0] ?? { x: 0, y: 0 };
  const fallbackEnd = points[points.length - 1] ?? fallbackStart;
  return {
    position: fallbackEnd,
    tangent: {
      x: fallbackEnd.x - fallbackStart.x,
      y: fallbackEnd.y - fallbackStart.y,
    },
  };
}

function approximatePolylineHitPolygon(
  points: readonly Position[],
  halfWidth: number,
): readonly Position[] {
  if (points.length === 0) {
    return [];
  }

  const leftSide: Position[] = [];
  const rightSide: Position[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) {
      continue;
    }
    const normal = resolvePolylineNormal(points, index);
    leftSide.push({
      x: point.x + normal.x * halfWidth,
      y: point.y + normal.y * halfWidth,
    });
    rightSide.push({
      x: point.x - normal.x * halfWidth,
      y: point.y - normal.y * halfWidth,
    });
  }

  rightSide.reverse();
  return [...leftSide, ...rightSide];
}

function resolvePolylineNormal(points: readonly Position[], index: number): Position {
  const current = points[index];
  if (current === undefined) {
    return { x: 0, y: 1 };
  }

  const previous = index > 0 ? points[index - 1] : undefined;
  const next = index < points.length - 1 ? points[index + 1] : undefined;
  const previousNormal = previous === undefined
    ? null
    : perpendicular(normalize({
        x: current.x - previous.x,
        y: current.y - previous.y,
      }));
  const nextNormal = next === undefined
    ? null
    : perpendicular(normalize({
        x: next.x - current.x,
        y: next.y - current.y,
      }));

  if (previousNormal !== null && nextNormal !== null) {
    const averaged = normalize({
      x: previousNormal.x + nextNormal.x,
      y: previousNormal.y + nextNormal.y,
    });
    if (averaged.x !== 0 || averaged.y !== 0) {
      return averaged;
    }
  }

  return nextNormal ?? previousNormal ?? { x: 0, y: 1 };
}

function resolveLabelRotation(angle: number): number {
  const normalizedAngle = normalizeAngle(angle);
  if (normalizedAngle > UPSIDE_DOWN_MIN && normalizedAngle < UPSIDE_DOWN_MAX) {
    return normalizeAngle(normalizedAngle + Math.PI);
  }
  return normalizedAngle;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized < 0) {
    normalized += Math.PI * 2;
  }
  while (normalized >= Math.PI * 2) {
    normalized -= Math.PI * 2;
  }
  return normalized;
}

function flattenPoints(points: readonly Position[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function translatePolygon(polygon: Polygon, dx: number, dy: number): Polygon {
  const translated: number[] = [];
  for (let index = 0; index < polygon.points.length; index += 2) {
    const x = polygon.points[index];
    const y = polygon.points[index + 1];
    if (x === undefined || y === undefined) {
      continue;
    }
    translated.push(
      x + dx,
      y + dy,
    );
  }
  return new Polygon(translated);
}

function resolveJunctionColor(
  junction: JunctionNode,
  strokeByRouteId: ReadonlyMap<string, ResolvedStroke>,
): number {
  const colors = junction.connectionIds
    .map((routeId) => strokeByRouteId.get(routeId)?.color)
    .filter((color): color is number => typeof color === 'number');

  if (colors.length === 0) {
    return DEFAULT_ROUTE_STROKE.color;
  }

  const sums = colors.reduce((accumulator, color) => ({
    r: accumulator.r + ((color >> 16) & 0xff),
    g: accumulator.g + ((color >> 8) & 0xff),
    b: accumulator.b + (color & 0xff),
  }), { r: 0, g: 0, b: 0 });

  return (
    (Math.round(sums.r / colors.length) << 16) |
    (Math.round(sums.g / colors.length) << 8) |
    Math.round(sums.b / colors.length)
  );
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeUnitInterval(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
