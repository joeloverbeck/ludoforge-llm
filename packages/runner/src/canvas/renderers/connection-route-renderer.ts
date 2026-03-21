import { Container, Graphics, Polygon, type BitmapText } from 'pixi.js';

import type { VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { Position } from '../geometry.js';
import {
  approximateBezierHitPolygon,
  computeControlPoint,
  normalize,
  perpendicular,
  quadraticBezierMidpoint,
  quadraticBezierMidpointTangent,
  quadraticBezierPoint,
} from '../geometry/bezier-utils.js';
import {
  STROKE_LABEL_FONT_NAME,
} from '../text/bitmap-font-registry.js';
import { createManagedBitmapText, destroyManagedBitmapText } from '../text/bitmap-text-runtime.js';
import { parseHexColor } from './shape-utils.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import type { ConnectionRouteRenderer } from './renderer-types.js';
import type { ConnectionRouteNode, JunctionNode } from '../../presentation/connection-route-resolver.js';

interface ConnectionRouteRendererOptions {
  readonly junctionRadius?: number;
  readonly defaultCurvature?: number;
  readonly hitAreaPadding?: number;
  readonly curveSegments?: number;
  readonly wavySegments?: number;
  readonly bindSelection?: (
    zoneContainer: Container,
    zoneId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

interface RouteSlot {
  readonly root: Container;
  readonly curve: Graphics;
  readonly midpoint: Container;
  readonly label: BitmapText;
}

const DEFAULT_JUNCTION_RADIUS = 6;
const DEFAULT_CURVATURE = 30;
const DEFAULT_HIT_AREA_PADDING = 12;
const DEFAULT_CURVE_SEGMENTS = 24;
const DEFAULT_WAVY_SEGMENTS = 32;
const UPSIDE_DOWN_MIN = Math.PI / 2;
const UPSIDE_DOWN_MAX = (Math.PI * 3) / 2;
const DEFAULT_ROUTE_STROKE = {
  color: 0x6b7280,
  width: 4,
  alpha: 0.85,
} as const;
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
  const defaultCurvature = options.defaultCurvature ?? DEFAULT_CURVATURE;
  const hitAreaPadding = options.hitAreaPadding ?? DEFAULT_HIT_AREA_PADDING;
  const curveSegments = options.curveSegments ?? DEFAULT_CURVE_SEGMENTS;
  const wavySegments = options.wavySegments ?? DEFAULT_WAVY_SEGMENTS;

  return {
    update(
      routes: readonly ConnectionRouteNode[],
      junctions: readonly JunctionNode[],
      positions: ReadonlyMap<string, Position>,
    ): void {
      const routeById = new Map(routes.map((route) => [route.zoneId, route]));
      const curvatureByRouteId = resolveCurvatureByRouteId(routes, defaultCurvature);
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
        const fromPosition = positions.get(route.endpointZoneIds[0]);
        const toPosition = positions.get(route.endpointZoneIds[1]);

        if (fromPosition === undefined || toPosition === undefined) {
          slot.root.visible = false;
          slot.root.renderable = false;
          slot.midpoint.visible = false;
          continue;
        }

        const resolvedStroke = resolveRouteStroke(route, visualConfigProvider);
        strokeByRouteId.set(route.zoneId, resolvedStroke);
        const controlPoint = computeControlPoint(
          fromPosition,
          toPosition,
          curvatureByRouteId.get(route.zoneId) ?? defaultCurvature,
        );

        drawRouteCurve(slot.curve, {
          route,
          fromPosition,
          toPosition,
          controlPoint,
          stroke: resolvedStroke,
          wavySegments,
        });

        const midpoint = quadraticBezierMidpoint(fromPosition, controlPoint, toPosition);
        const tangent = quadraticBezierMidpointTangent(fromPosition, controlPoint, toPosition);
        const labelRotation = resolveLabelRotation(Math.atan2(tangent.y, tangent.x));
        const hitArea = new Polygon(flattenPoints(approximateBezierHitPolygon(
          fromPosition,
          controlPoint,
          toPosition,
          resolvedStroke.width / 2 + hitAreaPadding,
          curveSegments,
        )));

        slot.root.visible = true;
        slot.root.renderable = true;
        slot.root.hitArea = hitArea;
        slot.midpoint.position.set(midpoint.x, midpoint.y);
        slot.midpoint.visible = true;
        slot.midpoint.hitArea = translatePolygon(hitArea, -midpoint.x, -midpoint.y);
        slot.label.text = route.displayName;
        slot.label.position.set(midpoint.x, midpoint.y);
        slot.label.rotation = labelRotation;
        slot.label.visible = true;
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
  const label = createManagedBitmapText({
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fill: '#f8fafc',
      fontSize: 12,
      stroke: { color: '#000000', width: 3 },
    },
    anchor: { x: 0.5, y: 0.5 },
    visible: false,
  });

  root.addChild(curve, midpoint, label);
  parentContainer.addChild(root);

  const slot: RouteSlot = { root, curve, midpoint, label };
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
  options: {
    readonly route: ConnectionRouteNode;
    readonly fromPosition: Position;
    readonly toPosition: Position;
    readonly controlPoint: Position;
    readonly stroke: ResolvedStroke;
    readonly wavySegments: number;
  },
): void {
  const { fromPosition, toPosition, controlPoint, stroke, wavySegments } = options;
  graphics.clear();

  if (!stroke.wavy) {
    graphics
      .moveTo(fromPosition.x, fromPosition.y)
      .quadraticCurveTo(controlPoint.x, controlPoint.y, toPosition.x, toPosition.y)
      .stroke({
        color: stroke.color,
        width: stroke.width,
        alpha: stroke.alpha,
      });
    return;
  }

  const segmentCount = Math.max(2, Math.trunc(wavySegments));
  const chordLength = Math.hypot(toPosition.x - fromPosition.x, toPosition.y - fromPosition.y);
  const waveCycles = Math.max(1, chordLength * stroke.waveFrequency);

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const point = quadraticBezierPoint(t, fromPosition, controlPoint, toPosition);
    const tangent = normalize({
      x: toPosition.x - fromPosition.x,
      y: toPosition.y - fromPosition.y,
    });
    const curveNormal = perpendicular(normalize(
      index === segmentCount
        ? {
            x: toPosition.x - controlPoint.x,
            y: toPosition.y - controlPoint.y,
          }
        : {
            x: quadraticBezierPoint(Math.min(1, t + (1 / segmentCount)), fromPosition, controlPoint, toPosition).x - point.x,
            y: quadraticBezierPoint(Math.min(1, t + (1 / segmentCount)), fromPosition, controlPoint, toPosition).y - point.y,
          },
    ));
    const normal = curveNormal.x === 0 && curveNormal.y === 0 ? perpendicular(tangent) : curveNormal;
    const offset = Math.sin(t * Math.PI * 2 * waveCycles) * stroke.waveAmplitude;
    const displacedPoint = {
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset,
    };

    if (index === 0) {
      graphics.moveTo(displacedPoint.x, displacedPoint.y);
      continue;
    }
    graphics.lineTo(displacedPoint.x, displacedPoint.y);
  }

  graphics.stroke({
    color: stroke.color,
    width: stroke.width,
    alpha: stroke.alpha,
  });
}

function resolveCurvatureByRouteId(
  routes: readonly ConnectionRouteNode[],
  defaultCurvature: number,
): ReadonlyMap<string, number> {
  const routeIdsByEndpointPair = new Map<string, string[]>();

  for (const route of routes) {
    const pairKey = route.endpointZoneIds.join('::');
    const routeIds = routeIdsByEndpointPair.get(pairKey) ?? [];
    routeIds.push(route.zoneId);
    routeIdsByEndpointPair.set(pairKey, routeIds);
  }

  const curvatureByRouteId = new Map<string, number>();
  for (const routeIds of routeIdsByEndpointPair.values()) {
    routeIds.sort((left, right) => left.localeCompare(right));
    if (routeIds.length === 1) {
      const routeId = routeIds[0];
      if (routeId !== undefined) {
        curvatureByRouteId.set(routeId, defaultCurvature);
      }
      continue;
    }

    const midpoint = (routeIds.length - 1) / 2;
    routeIds.forEach((routeId, index) => {
      const offsetMultiplier = index - midpoint;
      const magnitude = offsetMultiplier === 0 ? 0 : Math.abs(offsetMultiplier) + 0.5;
      curvatureByRouteId.set(routeId, Math.sign(offsetMultiplier) * magnitude * defaultCurvature);
    });
  }

  return curvatureByRouteId;
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
