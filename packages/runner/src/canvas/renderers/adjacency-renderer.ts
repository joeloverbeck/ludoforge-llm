import { Graphics, type Container } from 'pixi.js';

import { parseHexColor } from './shape-utils.js';
import type { EdgeStrokeStyle, VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { RenderAdjacency } from '../../model/render-model';
import type { Position } from '../geometry';
import type { AdjacencyRenderer } from './renderer-types';
import { safeDestroyDisplayObject } from './safe-destroy.js';

const DEFAULT_LINE_STYLE = {
  color: 0x6b7280,
  width: 1.5,
  alpha: 0.3,
} as const;

const HIGHLIGHTED_LINE_STYLE = {
  color: 0x93c5fd,
  width: 3,
  alpha: 0.7,
} as const;

interface PairRenderState {
  readonly from: string;
  readonly to: string;
  readonly category: string | null;
  readonly isHighlighted: boolean;
}

export function createAdjacencyRenderer(
  parentContainer: Container,
  visualConfigProvider: VisualConfigProvider,
): AdjacencyRenderer {
  const graphicsByPair = new Map<string, Graphics>();

  return {
    update(
      adjacencies: readonly RenderAdjacency[],
      positions: ReadonlyMap<string, Position>,
    ): void {
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

        graphics.removeFromParent();
        safeDestroyDisplayObject(graphics);
        graphicsByPair.delete(pairKey);
      }

      for (const [pairKey, adjacency] of nextPairs) {
        const fromPosition = positions.get(adjacency.from);
        const toPosition = positions.get(adjacency.to);

        let graphics = graphicsByPair.get(pairKey);
        if (fromPosition === undefined || toPosition === undefined) {
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

        drawAdjacencyLine(graphics, fromPosition, toPosition, adjacency, visualConfigProvider);
      }
    },

    destroy(): void {
      for (const graphics of graphicsByPair.values()) {
        graphics.removeFromParent();
        safeDestroyDisplayObject(graphics);
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
  adjacency: PairRenderState,
  visualConfigProvider: VisualConfigProvider,
): void {
  const strokeStyle = resolveStrokeStyle(
    visualConfigProvider.resolveEdgeStyle(adjacency.category, adjacency.isHighlighted),
    adjacency.isHighlighted,
  );

  graphics
    .clear()
    .moveTo(fromPosition.x, fromPosition.y)
    .lineTo(toPosition.x, toPosition.y)
    .stroke(strokeStyle);

  graphics.visible = true;
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

function resolveStrokeStyle(
  resolved: { color: string | null; width: number; alpha: number },
  isHighlighted: boolean,
): EdgeStrokeStyle {
  const fallbackStyle = isHighlighted ? HIGHLIGHTED_LINE_STYLE : DEFAULT_LINE_STYLE;
  const parsedColor = parseHexColor(resolved.color ?? undefined, {
    allowNamedColors: true,
  });

  return {
    color: parsedColor ?? fallbackStyle.color,
    width: resolved.width,
    alpha: resolved.alpha,
  };
}
