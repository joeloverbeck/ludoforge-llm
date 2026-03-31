import { Graphics, type Container } from 'pixi.js';

import { buildDashedSegments } from '../geometry/dashed-segments.js';
import { closestPointsBetweenPolygons, getEdgePointAtAngle, type ShapeDimensions } from './shape-utils.js';
import {
  DEFAULT_EDGE_STYLE,
  HIGHLIGHTED_EDGE_STYLE,
  type VisualConfigProvider,
} from '../../config/visual-config-provider.js';
import { resolveEdgeStrokeStyle } from '../../rendering/resolve-edge-stroke-style.js';
import type { Position } from '../geometry';
import type { DisposalQueue } from './disposal-queue.js';
import type { AdjacencyRenderer } from './renderer-types';
import type { PresentationAdjacencyNode, PresentationZoneNode } from '../../presentation/presentation-scene.js';
import { strokeDashedSegments } from './stroke-dashed-segments.js';

const DEFAULT_DASH_LENGTH = 10;
const DEFAULT_GAP_LENGTH = 5;
const HIGHLIGHTED_DASH_LENGTH = 12;
const HIGHLIGHTED_GAP_LENGTH = 4;
const BRIDGE_CAPSULE_COLOR = 0xffffff;
const BRIDGE_CAPSULE_ALPHA = 0.7;
const BRIDGE_CAPSULE_WIDTH = 14;
const BRIDGE_CAPSULE_HIGHLIGHT_ALPHA = 1.0;
const BRIDGE_CAPSULE_HIGHLIGHT_WIDTH = 18;

interface PairRenderState {
  readonly from: string;
  readonly to: string;
  readonly category: string | null;
  readonly isHighlighted: boolean;
}

interface AdjacencyRendererOptions {
  readonly disposalQueue: DisposalQueue;
}

export function createAdjacencyRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
  options: AdjacencyRendererOptions,
): AdjacencyRenderer {
  const graphicsByPair = new Map<string, Graphics>();

  return {
    update(
      adjacencies: readonly PresentationAdjacencyNode[],
      positions: ReadonlyMap<string, Position>,
      zones: readonly PresentationZoneNode[],
    ): void {
      const zonesById = new Map(zones.map((zone) => [zone.id, zone] as const));
      const nextPairs = new Map<string, PairRenderState>();
      for (const adjacency of adjacencies) {
        const pairKey = toPairKey(adjacency.from, adjacency.to);
        const existing = nextPairs.get(pairKey);
        if (existing === undefined) {
          nextPairs.set(pairKey, adjacency);
          continue;
        }

        nextPairs.set(pairKey, {
          ...existing,
          category: mergeCategory(existing.category, adjacency.category),
          isHighlighted: existing.isHighlighted || adjacency.isHighlighted,
        });
      }

      for (const [pairKey, graphics] of graphicsByPair) {
        if (nextPairs.has(pairKey)) {
          continue;
        }

        options.disposalQueue.enqueue(graphics);
        graphicsByPair.delete(pairKey);
      }

      for (const [pairKey, adjacency] of nextPairs) {
        const fromPosition = positions.get(adjacency.from);
        const toPosition = positions.get(adjacency.to);
        const fromZone = zonesById.get(adjacency.from);
        const toZone = zonesById.get(adjacency.to);

        let graphics = graphicsByPair.get(pairKey);
        if (fromPosition === undefined || toPosition === undefined || fromZone === undefined || toZone === undefined) {
          if (graphics !== undefined) {
            graphics.visible = false;
          }
          continue;
        }

        if (graphics === undefined) {
          graphics = new Graphics();
          graphicsByPair.set(pairKey, graphics);
          parentContainer.addChild(graphics);
        }

        const bothProvincePolygons = isProvincePolygon(fromZone) && isProvincePolygon(toZone);
        if (bothProvincePolygons) {
          drawBridgeCapsule(graphics, fromPosition, toPosition, fromZone, toZone, adjacency.isHighlighted);
        } else {
          drawAdjacencyLine(graphics, fromPosition, toPosition, fromZone, toZone, adjacency, visualConfigProvider);
        }
      }
    },

    destroy(): void {
      for (const graphics of graphicsByPair.values()) {
        options.disposalQueue.enqueue(graphics);
      }
      graphicsByPair.clear();
    },
  };
}

function toPairKey(from: string, to: string): string {
  return [from, to].sort().join(':');
}

function drawAdjacencyLine(
  graphics: Graphics,
  fromPosition: Position,
  toPosition: Position,
  fromZone: Pick<PresentationZoneNode, 'visual'>,
  toZone: Pick<PresentationZoneNode, 'visual'>,
  adjacency: PairRenderState,
  visualConfigProvider: VisualConfigProvider,
): void {
  const strokeStyle = resolveEdgeStrokeStyle(
    visualConfigProvider.resolveEdgeStyle(adjacency.category, adjacency.isHighlighted),
    adjacency.isHighlighted ? HIGHLIGHTED_EDGE_STYLE : DEFAULT_EDGE_STYLE,
  );
  const angleDeg = computeAngleDegrees(fromPosition, toPosition);
  const fromEdgeOffset = getEdgePointAtAngle(fromZone.visual.shape, toShapeDimensions(fromZone), angleDeg, fromZone.visual.vertices ?? undefined);
  const toEdgeOffset = getEdgePointAtAngle(toZone.visual.shape, toShapeDimensions(toZone), angleDeg + 180, toZone.visual.vertices ?? undefined);
  const fromEdge = {
    x: fromPosition.x + fromEdgeOffset.x,
    y: fromPosition.y + fromEdgeOffset.y,
  };
  const toEdge = {
    x: toPosition.x + toEdgeOffset.x,
    y: toPosition.y + toEdgeOffset.y,
  };
  const dashPattern = adjacency.isHighlighted
    ? { dashLength: HIGHLIGHTED_DASH_LENGTH, gapLength: HIGHLIGHTED_GAP_LENGTH }
    : { dashLength: DEFAULT_DASH_LENGTH, gapLength: DEFAULT_GAP_LENGTH };

  graphics.clear();
  const segments = buildDashedSegments([fromEdge, toEdge], dashPattern.dashLength, dashPattern.gapLength);
  strokeDashedSegments(graphics, segments, strokeStyle);

  graphics.visible = true;
}

function toShapeDimensions(zone: Pick<PresentationZoneNode, 'visual'>): ShapeDimensions {
  return {
    width: zone.visual.width,
    height: zone.visual.height,
  };
}

function computeAngleDegrees(from: Position, to: Position): number {
  return Math.atan2(from.y - to.y, to.x - from.x) * (180 / Math.PI);
}

function isProvincePolygon(zone: PresentationZoneNode): boolean {
  return (
    zone.category === 'province'
    && zone.visual.shape === 'polygon'
    && zone.visual.vertices !== null
    && zone.visual.vertices.length >= 6
  );
}

function drawBridgeCapsule(
  graphics: Graphics,
  fromPosition: Position,
  toPosition: Position,
  fromZone: PresentationZoneNode,
  toZone: PresentationZoneNode,
  isHighlighted: boolean,
): void {
  const fromVertices = fromZone.visual.vertices!;
  const toVertices = toZone.visual.vertices!;

  // Translate polygon vertices to world space (they are zone-local).
  const fromWorld = offsetVertices(fromVertices, fromPosition);
  const toWorld = offsetVertices(toVertices, toPosition);

  const { pointA, pointB } = closestPointsBetweenPolygons(fromWorld, toWorld);

  graphics.clear();
  graphics.moveTo(pointA.x, pointA.y);
  graphics.lineTo(pointB.x, pointB.y);
  graphics.stroke({
    color: BRIDGE_CAPSULE_COLOR,
    alpha: isHighlighted ? BRIDGE_CAPSULE_HIGHLIGHT_ALPHA : BRIDGE_CAPSULE_ALPHA,
    width: isHighlighted ? BRIDGE_CAPSULE_HIGHLIGHT_WIDTH : BRIDGE_CAPSULE_WIDTH,
    cap: 'round',
  });
  graphics.visible = true;
}

function offsetVertices(vertices: readonly number[], offset: Position): number[] {
  const result: number[] = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 2) {
    result[i] = vertices[i]! + offset.x;
    result[i + 1] = vertices[i + 1]! + offset.y;
  }
  return result;
}

function mergeCategory(left: string | null, right: string | null): string | null {
  if (left === right) {
    return left;
  }
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left.localeCompare(right) <= 0 ? left : right;
}
