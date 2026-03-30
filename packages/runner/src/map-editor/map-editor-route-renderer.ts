import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';
import { Container, Graphics, Polygon, type BitmapText, type FederatedPointerEvent } from 'pixi.js';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { parseHexColor } from '../rendering/color-utils.js';
import {
  approximatePolylineHitPolygon,
  flattenPoints,
  getPolylineLength,
  resolveLabelRotation,
  resolvePolylinePointAtDistance,
  samplePolylineWavePoints,
} from '../rendering/polyline-utils.js';
import type { ResolvedStroke } from '../rendering/route-stroke-utils.js';
import { sanitizePositiveNumber, sanitizeUnitInterval } from '../rendering/route-stroke-utils.js';
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
import { resolveMapEditorZoneVisuals } from './map-editor-zone-visuals.js';

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
  const zoneVisuals = resolveMapEditorZoneVisuals(gameDef, visualConfigProvider);
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

      const slot = getOrCreateRouteSlot(routeId, routeSlots, routeContainers, routeLayer, store, zoneVisuals);
      const stroke = resolveRouteStroke(
        zone,
        visualConfigProvider,
        state.selectedRouteId === routeId,
      );
      const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, zoneVisuals, {
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
  zoneVisuals: ReadonlyMap<string, import('./map-editor-route-geometry.js').EditorRouteZoneVisual>,
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

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, zoneVisuals, {
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

    const geometry = resolveRouteGeometry(route, state.zonePositions, state.connectionAnchors, zoneVisuals, {
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
  slot.label.rotation = resolveLabelRotation(Math.atan2(midpointSample.tangent.y, midpointSample.tangent.x));
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

function resolveRouteLabel(
  routeId: string,
  visualConfigProvider: VisualConfigProvider,
): string {
  return visualConfigProvider.getZoneLabel(routeId) ?? formatIdAsDisplayName(routeId);
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
