import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';

import type { RegionBoundaryRenderer } from './renderer-types';
import { convexHull, type Point } from '../geometry/convex-hull.js';
import { padHull, roundHullCorners } from '../geometry/hull-padding.js';
import { drawDashedPolygon } from '../geometry/dashed-polygon.js';
import type { PresentationRegionNode } from '../../presentation/presentation-scene.js';
import { createManagedText, destroyManagedText } from '../text/text-runtime.js';

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

interface RegionGraphics {
  readonly graphics: Graphics;
  readonly label: Text;
}

export function createRegionBoundaryRenderer(
  parentContainer: Container,
  _unusedLegacyOptions?: unknown,
): RegionBoundaryRenderer {
  const regionMap = new Map<string, RegionGraphics>();

  function clearAll(): void {
    for (const entry of regionMap.values()) {
      entry.graphics.destroy();
      destroyManagedText(entry.label);
    }
    regionMap.clear();
  }

  function getOrCreateRegion(key: string): RegionGraphics {
    const existing = regionMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const graphics = new Graphics();
    const label = createManagedText({
      text: '',
      style: buildLabelStyle(),
      anchor: { x: 0.5, y: 0.5 },
    });
    label.alpha = LABEL_ALPHA;

    parentContainer.addChild(graphics);
    parentContainer.addChild(label);

    const entry: RegionGraphics = { graphics, label };
    regionMap.set(key, entry);
    return entry;
  }

  function removeStaleRegions(activeKeys: ReadonlySet<string>): void {
    for (const [key, entry] of regionMap.entries()) {
      if (!activeKeys.has(key)) {
        entry.graphics.destroy();
        destroyManagedText(entry.label);
        regionMap.delete(key);
      }
    }
  }

  return {
    update(regions): void {
      if (regions.length === 0) {
        clearAll();
        return;
      }
      const activeKeys = new Set<string>();

      for (const regionNode of regions) {
        activeKeys.add(regionNode.key);
        const region = getOrCreateRegion(regionNode.key);
        drawRegion(
          region,
          regionNode.cornerPoints,
          regionNode.label,
          regionNode.style,
          DEFAULT_PADDING,
          DEFAULT_CORNER_RADIUS,
        );
      }

      removeStaleRegions(activeKeys);
    },

    destroy(): void {
      clearAll();
    },
  };
}

function drawRegion(
  region: RegionGraphics,
  cornerPoints: readonly Point[],
  labelText: string,
  style: PresentationRegionNode['style'],
  padding: number,
  cornerRadius: number,
): void {
  const hull = convexHull(cornerPoints);
  const paddedHull = padHull(hull, padding);
  const roundedHull = roundHullCorners(paddedHull, cornerRadius);

  const { graphics, label } = region;
  graphics.clear();

  // Fill
  const fillColor = style.fillColor;
  const fillAlpha = style.fillAlpha ?? DEFAULT_FILL_ALPHA;
  const flatCoords = flattenPoints(roundedHull);

  graphics.poly(flatCoords);
  graphics.fill({ color: fillColor, alpha: fillAlpha });

  // Border — dash/gap proportional to border width
  const borderColor = style.borderColor ?? fillColor;
  const borderWidth = style.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const borderStyle = style.borderStyle ?? DEFAULT_BORDER_STYLE;

  if (borderStyle === 'dashed') {
    const dashLength = borderWidth * DASH_WIDTH_MULTIPLIER;
    const gapLength = borderWidth * GAP_WIDTH_MULTIPLIER;
    graphics.setStrokeStyle({ color: borderColor, width: borderWidth });
    drawDashedPolygon(graphics, roundedHull, dashLength, gapLength);
    graphics.stroke();
  } else {
    graphics.poly(flatCoords);
    graphics.stroke({ color: borderColor, width: borderWidth });
  }

  // Label — auto-rotate and scale to span the hull's longest axis
  if (labelText.length === 0) {
    label.text = '';
    return;
  }

  const centroid = computeCentroid(hull);
  const axis = computeLongestAxis(hull);

  label.text = labelText;
  label.style.fontSize = LABEL_REFERENCE_FONT_SIZE;
  label.scale.set(1, 1);
  label.rotation = 0;

  // Measure at reference size, then compute scale to fill target span.
  // label.width may throw in environments without a canvas (e.g. tests).
  let measuredWidth = 0;
  try {
    measuredWidth = label.width;
  } catch {
    // No canvas available — skip scaling
  }
  const targetWidth = axis.length * LABEL_SPAN_FRACTION;

  if (measuredWidth > 0) {
    const scaleFactor = targetWidth / measuredWidth;
    label.scale.set(scaleFactor, scaleFactor);
  }

  label.rotation = axis.angle;
  label.position.set(centroid.x, centroid.y);
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
export function computeLongestAxis(hull: readonly Point[]): LongestAxis {
  if (hull.length <= 1) {
    return { angle: 0, length: 0 };
  }

  let maxDistSq = 0;
  let bestA: Point = hull[0]!;
  let bestB: Point = hull[0]!;

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

function flattenPoints(points: readonly Point[]): number[] {
  const result: number[] = [];
  for (const p of points) {
    result.push(p.x, p.y);
  }
  return result;
}

function computeCentroid(points: readonly Point[]): Point {
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
