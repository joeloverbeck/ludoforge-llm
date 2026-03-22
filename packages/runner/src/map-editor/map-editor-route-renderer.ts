import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';
import { Container, Graphics, Polygon, type BitmapText, type FederatedPointerEvent } from 'pixi.js';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { normalize, perpendicular } from '../canvas/geometry/bezier-utils.js';
import { parseHexColor } from '../canvas/renderers/shape-utils.js';
import { safeDestroyDisplayObject } from '../canvas/renderers/safe-destroy.js';
import { STROKE_LABEL_FONT_NAME } from '../canvas/text/bitmap-font-registry.js';
import { createManagedBitmapText, destroyManagedBitmapText } from '../canvas/text/bitmap-text-runtime.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { isConnectionZone } from './map-editor-connection-zones.js';
import type { MapEditorStoreApi } from './map-editor-store.js';
import {
  findNearestRouteSegment,
  resolveRouteGeometry,
  type EditorRouteGeometry,
} from './map-editor-route-geometry.js';
import type { Position } from './map-editor-types.js';

const DEFAULT_ROUTE_STROKE = {
  color: 0x6b7280,
  width: 4,
  alpha: 0.85,
} as const;
const SELECTED_ROUTE_COLOR = 0xf59e0b;
const SELECTED_ROUTE_WIDTH_BONUS = 2;
const DEFAULT_WAVE_AMPLITUDE = 4;
const DEFAULT_WAVE_FREQUENCY = 0.08;
const DEFAULT_HIT_AREA_PADDING = 12;
const DEFAULT_CURVE_SEGMENTS = 24;
const DEFAULT_WAVY_SEGMENTS = 32;
const UPSIDE_DOWN_MIN = Math.PI / 2;
const UPSIDE_DOWN_MAX = (Math.PI * 3) / 2;

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
  readonly midpoint: Container;
  readonly label: BitmapText;
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
      destroyRouteSlot(slot);
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
      const stroke = resolveRouteStroke(
        zone,
        visualConfigProvider,
        state.selectedRouteId === routeId,
      );
      const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, {
        curveSegments: DEFAULT_CURVE_SEGMENTS,
        hitAreaPadding: DEFAULT_HIT_AREA_PADDING,
        strokeWidth: stroke.width,
      });

      syncRouteSlot(routeId, slot, geometry, stroke, visualConfigProvider);
    }
  };

  render(store.getState());

  const unsubscribe = store.subscribe((state, previousState) => {
    if (
      state.zonePositions === previousState.zonePositions &&
      state.connectionAnchors === previousState.connectionAnchors &&
      state.connectionRoutes === previousState.connectionRoutes &&
      state.selectedRouteId === previousState.selectedRouteId
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
        destroyRouteSlot(slot);
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

  const midpoint = new Container();
  midpoint.eventMode = 'none';
  midpoint.interactiveChildren = false;
  const label = createManagedBitmapText({
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fontSize: 12,
      fill: '#f8fafc',
      stroke: { color: '#000000', width: 3 },
    },
    anchor: { x: 0.5, y: 0.5 },
    visible: false,
  });
  midpoint.addChild(label);

  const onPointerTap = (event: FederatedPointerEvent): void => {
    const state = store.getState();
    state.selectZone(null);
    state.selectRoute(routeId);

    if (event.detail < 2) {
      return;
    }

    const route = state.connectionRoutes.get(routeId);
    if (route === undefined) {
      return;
    }

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, {
      curveSegments: DEFAULT_CURVE_SEGMENTS,
      hitAreaPadding: DEFAULT_HIT_AREA_PADDING,
    });
    if (geometry === null) {
      return;
    }

    const match = findNearestRouteSegment(
      geometry,
      getPointerPosition(event, curve.parent ?? routeLayer),
    );
    if (match === null) {
      return;
    }

    state.insertWaypoint(routeId, match.segmentIndex, match.position);
  };

  const onPointerDown = (event: FederatedPointerEvent): void => {
    if (event.button !== 2) {
      return;
    }

    event.stopPropagation();
    const state = store.getState();
    state.selectZone(null);
    state.selectRoute(routeId);

    const route = state.connectionRoutes.get(routeId);
    if (route === undefined) {
      return;
    }

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, {
      curveSegments: DEFAULT_CURVE_SEGMENTS,
      hitAreaPadding: DEFAULT_HIT_AREA_PADDING,
    });
    if (geometry === null) {
      return;
    }

    const match = findNearestRouteSegment(
      geometry,
      getPointerPosition(event, curve.parent ?? routeLayer),
    );
    if (match === null) {
      return;
    }

    const segment = route.segments[match.segmentIndex];
    if (segment === undefined) {
      return;
    }

    state.convertSegment(
      routeId,
      match.segmentIndex,
      segment.kind === 'straight' ? 'quadratic' : 'straight',
    );
  };

  curve.on('pointertap', onPointerTap);
  curve.on('pointerdown', onPointerDown);
  root.addChild(curve, midpoint);
  routeLayer.addChild(root);

  const slot: RouteSlot = {
    root,
    curve,
    midpoint,
    label,
    cleanupSelection: () => {
      curve.off('pointertap', onPointerTap);
      curve.off('pointerdown', onPointerDown);
    },
  };
  routeSlots.set(routeId, slot);
  routeContainers.set(routeId, midpoint);
  return slot;
}

function syncRouteSlot(
  routeId: string,
  slot: RouteSlot,
  geometry: EditorRouteGeometry | null,
  stroke: ResolvedStroke,
  visualConfigProvider: VisualConfigProvider,
): void {
  slot.curve.clear();

  if (geometry === null) {
    slot.root.visible = false;
    slot.root.renderable = false;
    slot.midpoint.visible = false;
    slot.midpoint.renderable = false;
    slot.label.visible = false;
    slot.label.renderable = false;
    slot.curve.hitArea = null;
    return;
  }

  slot.root.visible = true;
  slot.root.renderable = true;
  const midpointSample = resolvePolylinePointAtDistance(
    geometry.sampledPath,
    getPolylineLength(geometry.sampledPath) / 2,
  );
  slot.midpoint.visible = true;
  slot.midpoint.renderable = true;
  slot.midpoint.position.set(midpointSample.position.x, midpointSample.position.y);
  slot.label.text = resolveRouteLabel(routeId, visualConfigProvider);
  slot.label.rotation = resolveLabelRotation(midpointSample.tangent);
  slot.label.visible = true;
  slot.label.renderable = true;

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
  isSelected: boolean,
): ResolvedStroke {
  const visual = visualConfigProvider.resolveZoneVisual(
    zone.id as string,
    zone.category ?? null,
    zone.attributes ?? null,
  );
  const routeStyle = visual.connectionStyleKey === null
    ? null
    : visualConfigProvider.resolveConnectionStyle(visual.connectionStyleKey);

  const baseStroke = {
    color: parseHexColor(routeStyle?.strokeColor, { allowNamedColors: true }) ?? DEFAULT_ROUTE_STROKE.color,
    width: sanitizePositiveNumber(routeStyle?.strokeWidth, DEFAULT_ROUTE_STROKE.width),
    alpha: sanitizeUnitInterval(routeStyle?.strokeAlpha, DEFAULT_ROUTE_STROKE.alpha),
    wavy: routeStyle?.wavy === true,
    waveAmplitude: sanitizePositiveNumber(routeStyle?.waveAmplitude, DEFAULT_WAVE_AMPLITUDE),
    waveFrequency: sanitizePositiveNumber(routeStyle?.waveFrequency, DEFAULT_WAVE_FREQUENCY),
  };

  if (!isSelected) {
    return baseStroke;
  }

  return {
    ...baseStroke,
    color: SELECTED_ROUTE_COLOR,
    width: baseStroke.width + SELECTED_ROUTE_WIDTH_BONUS,
    alpha: 1,
  };
}

function indexConnectionZones(
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<string, ZoneDef> {
  return new Map(
    (gameDef.zones ?? [])
      .filter((zone) => isConnectionZone(zone, visualConfigProvider))
      .map((zone) => [zone.id as string, zone]),
  );
}

function destroyRouteSlot(slot: RouteSlot): void {
  slot.cleanupSelection();
  destroyManagedBitmapText(slot.label);
  safeDestroyDisplayObject(slot.root, { children: true });
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

function resolveRouteLabel(
  routeId: string,
  visualConfigProvider: VisualConfigProvider,
): string {
  return visualConfigProvider.getZoneLabel(routeId) ?? formatIdAsDisplayName(routeId);
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

function resolveLabelRotation(tangent: Position): number {
  const angle = normalizeAngle(Math.atan2(tangent.y, tangent.x));
  if (angle > UPSIDE_DOWN_MIN && angle < UPSIDE_DOWN_MAX) {
    return normalizeAngle(angle + Math.PI);
  }
  return angle;
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

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeUnitInterval(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function getPointerPosition(
  event: Pick<FederatedPointerEvent, 'getLocalPosition'>,
  referenceContainer: Container,
): Position {
  const localPosition = event.getLocalPosition(referenceContainer);
  return {
    x: localPosition.x,
    y: localPosition.y,
  };
}
