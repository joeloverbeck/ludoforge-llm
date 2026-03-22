import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';
import { Container, Graphics, Polygon } from 'pixi.js';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { normalize, perpendicular } from '../canvas/geometry/bezier-utils.js';
import { parseHexColor } from '../canvas/renderers/shape-utils.js';
import { safeDestroyDisplayObject } from '../canvas/renderers/safe-destroy.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import {
  resolveRouteGeometry,
  type EditorRouteGeometry,
} from './map-editor-route-geometry.js';
import type { Position } from './map-editor-types.js';

const DEFAULT_ROUTE_STROKE = {
  color: 0x6b7280,
  width: 4,
  alpha: 0.85,
} as const;
const DEFAULT_WAVE_AMPLITUDE = 4;
const DEFAULT_WAVE_FREQUENCY = 0.08;
const DEFAULT_HIT_AREA_PADDING = 12;
const DEFAULT_CURVE_SEGMENTS = 24;
const DEFAULT_WAVY_SEGMENTS = 32;

interface ResolvedStroke {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
  readonly wavy: boolean;
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
}

interface RouteSlot {
  readonly root: Container;
  readonly curve: Graphics;
  readonly cleanupSelection: () => void;
}

export interface EditorRouteRenderer {
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export function createEditorRouteRenderer(
  routeLayer: Container,
  store: MapEditorStoreApi,
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
): EditorRouteRenderer {
  const connectionZones = indexConnectionZones(gameDef, visualConfigProvider);
  const routeSlots = new Map<string, RouteSlot>();
  const routeContainers = new Map<string, Container>();

  const render = (state: ReturnType<MapEditorStoreApi['getState']>): void => {
    const nextRouteIds = new Set(
      [...state.connectionRoutes.keys()].filter((routeId) => connectionZones.has(routeId)),
    );

    for (const [routeId, slot] of routeSlots) {
      if (nextRouteIds.has(routeId)) {
        continue;
      }
      slot.cleanupSelection();
      safeDestroyDisplayObject(slot.root, { children: true });
      routeSlots.delete(routeId);
      routeContainers.delete(routeId);
    }

    for (const routeId of nextRouteIds) {
      const route = state.connectionRoutes.get(routeId);
      const zone = connectionZones.get(routeId);
      if (route === undefined || zone === undefined) {
        continue;
      }

      const slot = getOrCreateRouteSlot(routeId, routeSlots, routeContainers, routeLayer, store);
      const stroke = resolveRouteStroke(zone, visualConfigProvider);
      const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, {
        curveSegments: DEFAULT_CURVE_SEGMENTS,
        hitAreaPadding: DEFAULT_HIT_AREA_PADDING,
        strokeWidth: stroke.width,
      });

      syncRouteSlot(slot, geometry, stroke);
    }
  };

  render(store.getState());

  const unsubscribe = store.subscribe((state, previousState) => {
    if (
      state.zonePositions === previousState.zonePositions &&
      state.connectionAnchors === previousState.connectionAnchors &&
      state.connectionRoutes === previousState.connectionRoutes
    ) {
      return;
    }

    render(state);
  });

  return {
    getContainerMap(): ReadonlyMap<string, Container> {
      return routeContainers;
    },

    destroy(): void {
      unsubscribe();

      for (const slot of routeSlots.values()) {
        slot.cleanupSelection();
        safeDestroyDisplayObject(slot.root, { children: true });
      }
      routeSlots.clear();
      routeContainers.clear();
    },
  };
}

function getOrCreateRouteSlot(
  routeId: string,
  routeSlots: Map<string, RouteSlot>,
  routeContainers: Map<string, Container>,
  routeLayer: Container,
  store: MapEditorStoreApi,
): RouteSlot {
  const existing = routeSlots.get(routeId);
  if (existing !== undefined) {
    return existing;
  }

  const root = new Container();
  root.eventMode = 'passive';
  root.interactiveChildren = true;

  const curve = new Graphics();
  curve.eventMode = 'static';
  curve.cursor = 'pointer';

  const onPointerTap = (): void => {
    const state = store.getState();
    state.selectZone(null);
    state.selectRoute(routeId);
  };

  curve.on('pointertap', onPointerTap);
  root.addChild(curve);
  routeLayer.addChild(root);

  const slot: RouteSlot = {
    root,
    curve,
    cleanupSelection: () => {
      curve.off('pointertap', onPointerTap);
    },
  };
  routeSlots.set(routeId, slot);
  routeContainers.set(routeId, curve);
  return slot;
}

function syncRouteSlot(
  slot: RouteSlot,
  geometry: EditorRouteGeometry | null,
  stroke: ResolvedStroke,
): void {
  slot.curve.clear();

  if (geometry === null) {
    slot.root.visible = false;
    slot.root.renderable = false;
    slot.curve.hitArea = null;
    return;
  }

  slot.root.visible = true;
  slot.root.renderable = true;

  if (stroke.wavy) {
    const renderedPoints = samplePolylineWavePoints(geometry.sampledPath, stroke, DEFAULT_WAVY_SEGMENTS);
    drawPolyline(slot.curve, renderedPoints, stroke);
    slot.curve.hitArea = new Polygon(flattenPoints(approximatePolylineHitPolygon(
      renderedPoints,
      stroke.width / 2 + DEFAULT_HIT_AREA_PADDING,
    )));
    return;
  }

  drawSegmentCommands(slot.curve, geometry, stroke);
  slot.curve.hitArea = new Polygon(flattenPoints(geometry.hitAreaPoints));
}

function drawSegmentCommands(
  graphics: Graphics,
  geometry: EditorRouteGeometry,
  stroke: ResolvedStroke,
): void {
  const start = geometry.points[0]?.position;
  if (start === undefined) {
    return;
  }

  graphics.moveTo(start.x, start.y);
  for (const segment of geometry.segments) {
    if (segment.kind === 'straight') {
      graphics.lineTo(segment.end.x, segment.end.y);
      continue;
    }

    graphics.quadraticCurveTo(
      segment.controlPoint.position.x,
      segment.controlPoint.position.y,
      segment.end.x,
      segment.end.y,
    );
  }
  graphics.stroke({
    color: stroke.color,
    width: stroke.width,
    alpha: stroke.alpha,
  });
}

function drawPolyline(
  graphics: Graphics,
  points: readonly Position[],
  stroke: ResolvedStroke,
): void {
  const first = points[0];
  if (first === undefined) {
    return;
  }

  graphics.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) {
      continue;
    }
    graphics.lineTo(point.x, point.y);
  }
  graphics.stroke({
    color: stroke.color,
    width: stroke.width,
    alpha: stroke.alpha,
  });
}

function resolveRouteStroke(
  zone: ZoneDef,
  visualConfigProvider: VisualConfigProvider,
): ResolvedStroke {
  const visual = visualConfigProvider.resolveZoneVisual(
    zone.id as string,
    zone.category ?? null,
    zone.attributes ?? null,
  );
  const routeStyle = visual.connectionStyleKey === null
    ? null
    : visualConfigProvider.resolveConnectionStyle(visual.connectionStyleKey);

  return {
    color: parseHexColor(routeStyle?.strokeColor, { allowNamedColors: true }) ?? DEFAULT_ROUTE_STROKE.color,
    width: sanitizePositiveNumber(routeStyle?.strokeWidth, DEFAULT_ROUTE_STROKE.width),
    alpha: sanitizeUnitInterval(routeStyle?.strokeAlpha, DEFAULT_ROUTE_STROKE.alpha),
    wavy: routeStyle?.wavy === true,
    waveAmplitude: sanitizePositiveNumber(routeStyle?.waveAmplitude, DEFAULT_WAVE_AMPLITUDE),
    waveFrequency: sanitizePositiveNumber(routeStyle?.waveFrequency, DEFAULT_WAVE_FREQUENCY),
  };
}

function indexConnectionZones(
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<string, ZoneDef> {
  return new Map(
    (gameDef.zones ?? [])
      .filter((zone) => visualConfigProvider.resolveZoneVisual(
        zone.id as string,
        zone.category ?? null,
        zone.attributes ?? null,
      ).shape === 'connection')
      .map((zone) => [zone.id as string, zone]),
  );
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

function flattenPoints(points: readonly Position[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeUnitInterval(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
