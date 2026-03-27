import { Container, Graphics, type Text, type TextStyleOptions } from 'pixi.js';

import type { RegionBoundaryRenderer } from './renderer-types';
import { convexHull } from '../geometry/convex-hull.js';
import type { Point2D } from '../geometry/point2d.js';
import { padHull, roundHullCorners } from '../geometry/hull-padding.js';
import { buildDashedSegments } from '../geometry/dashed-segments.js';
import type { PresentationRegionNode } from '../../presentation/presentation-scene.js';
import { createKeyedTextReconciler } from '../text/text-runtime.js';
import { strokeDashedSegments } from './stroke-dashed-segments.js';

const DEFAULT_FILL_ALPHA = 0.15;
const DEFAULT_BORDER_STYLE = 'dashed' as const;
const DEFAULT_BORDER_WIDTH = 4;
const DEFAULT_PADDING = 40;
const DEFAULT_CORNER_RADIUS = 30;
const DASH_WIDTH_MULTIPLIER = 5;
const GAP_WIDTH_MULTIPLIER = 3;
const LABEL_REFERENCE_FONT_SIZE = 64;
const LABEL_ALPHA = 0.25;
const LABEL_SPAN_FRACTION = 0.7;

export function createRegionBoundaryRenderer(
  parentContainer: Container,
  _unusedLegacyOptions?: unknown,
): RegionBoundaryRenderer {
  const graphicsByRegionKey = new Map<string, Graphics>();
  const textRuntime = createKeyedTextReconciler({ parentContainer });

  function clearAll(): void {
    for (const graphics of graphicsByRegionKey.values()) {
      graphics.destroy();
    }
    graphicsByRegionKey.clear();
    textRuntime.destroy();
  }

  function getOrCreateGraphics(key: string): Graphics {
    const existing = graphicsByRegionKey.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const graphics = new Graphics();
    parentContainer.addChild(graphics);
    graphicsByRegionKey.set(key, graphics);
    return graphics;
  }

  function removeStaleRegions(activeKeys: ReadonlySet<string>): void {
    for (const [key, graphics] of graphicsByRegionKey.entries()) {
      if (activeKeys.has(key)) {
        continue;
      }
      graphics.destroy();
      graphicsByRegionKey.delete(key);
    }
  }

  return {
    update(regions): void {
      if (regions.length === 0) {
        clearAll();
        return;
      }

      const activeKeys = new Set<string>();
      const labelSpecs = [];

      for (const regionNode of regions) {
        activeKeys.add(regionNode.key);
        const graphics = getOrCreateGraphics(regionNode.key);
        const labelLayout = drawRegionGraphics(
          graphics,
          regionNode.cornerPoints,
          regionNode.style,
          DEFAULT_PADDING,
          DEFAULT_CORNER_RADIUS,
        );

        labelSpecs.push({
          key: regionNode.key,
          text: regionNode.label,
          style: buildLabelStyle(),
          anchor: { x: 0.5, y: 0.5 },
          alpha: LABEL_ALPHA,
          position: { x: labelLayout.centroid.x, y: labelLayout.centroid.y },
          rotation: labelLayout.axis.angle,
          apply: (text: Text) => {
            text.scale.set(1, 1);
            let measuredWidth = 0;
            try {
              measuredWidth = text.width;
            } catch {
              // Some test environments do not provide a backing canvas for measurement.
            }
            if (measuredWidth > 0) {
              const scaleFactor = labelLayout.targetWidth / measuredWidth;
              text.scale.set(scaleFactor, scaleFactor);
            }
          },
        });
      }

      textRuntime.reconcile(labelSpecs);
      removeStaleRegions(activeKeys);
    },

    destroy(): void {
      clearAll();
    },
  };
}

interface RegionLabelLayout {
  readonly centroid: Point2D;
  readonly axis: LongestAxis;
  readonly targetWidth: number;
}

function drawRegionGraphics(
  graphics: Graphics,
  cornerPoints: readonly Point2D[],
  style: PresentationRegionNode['style'],
  padding: number,
  cornerRadius: number,
): RegionLabelLayout {
  const hull = convexHull(cornerPoints);
  const paddedHull = padHull(hull, padding);
  const roundedHull = roundHullCorners(paddedHull, cornerRadius);

  graphics.clear();

  const fillColor = style.fillColor;
  const fillAlpha = style.fillAlpha ?? DEFAULT_FILL_ALPHA;
  const flatCoords = flattenPoints(roundedHull);

  graphics.poly(flatCoords);
  graphics.fill({ color: fillColor, alpha: fillAlpha });

  const borderColor = style.borderColor ?? fillColor;
  const borderWidth = style.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const borderStyle = style.borderStyle ?? DEFAULT_BORDER_STYLE;

  if (borderStyle === 'dashed') {
    const dashLength = borderWidth * DASH_WIDTH_MULTIPLIER;
    const gapLength = borderWidth * GAP_WIDTH_MULTIPLIER;
    const dashedSegments = buildDashedSegments(roundedHull, dashLength, gapLength, { closed: true });
    strokeDashedSegments(graphics, dashedSegments, { color: borderColor, width: borderWidth });
  } else {
    graphics.poly(flatCoords);
    graphics.stroke({ color: borderColor, width: borderWidth });
  }

  const centroid = computeCentroid(hull);
  const axis = computeLongestAxis(hull);

  return {
    centroid,
    axis,
    targetWidth: axis.length * LABEL_SPAN_FRACTION,
  };
}

interface LongestAxis {
  readonly angle: number;
  readonly length: number;
}

/**
 * Find the diameter of the convex hull (two most distant points)
 * and return the angle and length of that axis.
 * The angle is normalized so text rendered along it reads left-to-right.
 */
export function computeLongestAxis(hull: readonly Point2D[]): LongestAxis {
  if (hull.length <= 1) {
    return { angle: 0, length: 0 };
  }

  let maxDistSq = 0;
  let bestA: Point2D = hull[0]!;
  let bestB: Point2D = hull[0]!;

  for (let i = 0; i < hull.length; i += 1) {
    for (let j = i + 1; j < hull.length; j += 1) {
      const dx = hull[j]!.x - hull[i]!.x;
      const dy = hull[j]!.y - hull[i]!.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        bestA = hull[i]!;
        bestB = hull[j]!;
      }
    }
  }

  const length = Math.sqrt(maxDistSq);
  const rawAngle = Math.atan2(bestB.y - bestA.y, bestB.x - bestA.x);
  const angle = normalizeAngleForReadability(rawAngle);

  return { angle, length };
}

/**
 * Normalize an angle so that text rendered at this rotation reads left-to-right.
 * If the angle points leftward (|angle| > π/2), flip it by π so text faces right.
 */
export function normalizeAngleForReadability(angle: number): number {
  if (angle > Math.PI / 2) {
    return angle - Math.PI;
  }
  if (angle < -Math.PI / 2) {
    return angle + Math.PI;
  }
  return angle;
}

function flattenPoints(points: readonly Point2D[]): number[] {
  const result: number[] = [];
  for (const p of points) {
    result.push(p.x, p.y);
  }
  return result;
}

function computeCentroid(points: readonly Point2D[]): Point2D {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }

  return { x: sx / points.length, y: sy / points.length };
}

function buildLabelStyle(): TextStyleOptions {
  return {
    fontFamily: 'sans-serif',
    fontSize: LABEL_REFERENCE_FONT_SIZE,
    fontWeight: 'bold',
    fill: '#ffffff',
    letterSpacing: 8,
  };
}
