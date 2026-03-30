import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import type { Position } from '../canvas/geometry.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { ConnectionRouteDefinition } from '../config/visual-config-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import {
  resolveConnectionRoutes,
} from '../presentation/connection-route-resolver.js';
import {
  resolveRegionNodes,
  type PresentationAdjacencyNode,
  type PresentationScene,
  type PresentationZoneNode,
  type PresentationZoneRenderSpec,
} from '../presentation/presentation-scene.js';

const LABEL_GAP = 8;
const EDITOR_SELECTED_STROKE = { color: '#facc15', width: 3, alpha: 1 } as const;
const EDITOR_DEFAULT_STROKE = { color: '#111827', width: 1, alpha: 0.7 } as const;
const EMPTY_MARKERS_LABEL = { text: '', x: 0, y: 0, visible: false } as const;

export interface BuildEditorPresentationSceneOptions {
  readonly gameDef: GameDef;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly positions: ReadonlyMap<string, Position>;
  readonly zoneVertices: ReadonlyMap<string, readonly number[]>;
  readonly connectionAnchors: ReadonlyMap<string, Position>;
  readonly connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>;
  readonly selectedZoneId: string | null;
}

export function buildEditorPresentationScene(
  options: BuildEditorPresentationSceneOptions,
): PresentationScene {
  const {
    gameDef,
    visualConfigProvider,
    positions,
    zoneVertices,
    connectionAnchors,
    connectionRoutes,
    selectedZoneId,
  } = options;

  const hiddenZones = visualConfigProvider.getHiddenZones();
  const visibleZoneDefs = gameDef.zones.filter(
    (zone) => !hiddenZones.has(zone.id) && zone.zoneKind !== 'aux' && zone.isInternal !== true,
  );

  const zones = resolveEditorZoneNodes(
    visibleZoneDefs,
    visualConfigProvider,
    zoneVertices,
    selectedZoneId,
  );

  const adjacencies = resolveEditorAdjacencyNodes(visibleZoneDefs);

  const connectionResolution = resolveConnectionRoutes({
    zones,
    adjacencies,
    positions,
    routeDefinitions: connectionRoutes,
    anchorPositions: connectionAnchors,
  });

  return {
    zones: connectionResolution.filteredZones,
    connectionRoutes: connectionResolution.connectionRoutes,
    junctions: connectionResolution.junctions,
    tokens: [],
    adjacencies: connectionResolution.filteredAdjacencies,
    overlays: [],
    regions: resolveRegionNodes(
      connectionResolution.filteredZones,
      positions,
      visualConfigProvider,
    ),
  };
}

function resolveEditorZoneNodes(
  zoneDefs: readonly ZoneDef[],
  visualConfigProvider: VisualConfigProvider,
  zoneVertices: ReadonlyMap<string, readonly number[]>,
  selectedZoneId: string | null,
): readonly PresentationZoneNode[] {
  return zoneDefs.map((zoneDef) => {
    const category = zoneDef.category ?? null;
    const attributes = zoneDef.attributes ?? {};
    const displayName =
      visualConfigProvider.getZoneLabel(zoneDef.id) ??
      formatIdAsDisplayName(zoneDef.id);

    const baseVisual = visualConfigProvider.resolveZoneVisual(
      zoneDef.id,
      category,
      attributes,
    );

    const editorVertices = zoneVertices.get(zoneDef.id);
    const visual =
      editorVertices !== undefined
        ? { ...baseVisual, vertices: editorVertices }
        : baseVisual;

    const isSelected = zoneDef.id === selectedZoneId;
    const render = resolveEditorZoneRenderSpec(displayName, visual, isSelected);

    return {
      id: zoneDef.id,
      displayName,
      ownerID: null,
      isSelectable: true,
      category,
      attributes,
      visual,
      render,
    };
  });
}

function resolveEditorZoneRenderSpec(
  displayName: string,
  visual: ReturnType<VisualConfigProvider['resolveZoneVisual']>,
  isSelected: boolean,
): PresentationZoneRenderSpec {
  const labelInsideZone = visual.shape !== 'circle';
  const bottomEdge = visual.shape === 'circle'
    ? Math.min(visual.width, visual.height) / 2
    : visual.height / 2;
  const nameLabelY = labelInsideZone ? 0 : bottomEdge + LABEL_GAP;

  return {
    fillColor: visual.color ?? '#4d5c6d',
    stroke: isSelected ? EDITOR_SELECTED_STROKE : EDITOR_DEFAULT_STROKE,
    hiddenStackCount: 0,
    nameLabel: {
      text: displayName,
      x: 0,
      y: nameLabelY,
      visible: true,
    },
    markersLabel: EMPTY_MARKERS_LABEL,
    badge: null,
  };
}

function resolveEditorAdjacencyNodes(
  zoneDefs: readonly ZoneDef[],
): readonly PresentationAdjacencyNode[] {
  const seen = new Set<string>();
  const adjacencies: PresentationAdjacencyNode[] = [];

  for (const zoneDef of zoneDefs) {
    if (zoneDef.adjacentTo === undefined) {
      continue;
    }

    for (const edge of zoneDef.adjacentTo) {
      const pairKey =
        zoneDef.id < edge.to
          ? `${zoneDef.id}::${edge.to}`
          : `${edge.to}::${zoneDef.id}`;

      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);

      adjacencies.push({
        from: zoneDef.id,
        to: edge.to,
        category: edge.category ?? null,
        isHighlighted: false,
      });
    }
  }

  return adjacencies;
}
