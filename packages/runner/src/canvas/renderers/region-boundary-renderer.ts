import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';

import type { Position } from '../geometry';
import type { RenderZone } from '../../model/render-model';
import type { VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { RegionStyle } from '../../config/visual-config-types.js';
import type { RegionBoundaryRenderer } from './renderer-types';
import { convexHull, type Point } from '../geometry/convex-hull.js';
import { padHull, roundHullCorners } from '../geometry/hull-padding.js';
import { drawDashedPolygon } from '../geometry/dashed-polygon.js';

const DEFAULT_FILL_ALPHA = 0.15;
const DEFAULT_BORDER_STYLE = 'dashed' as const;
const DEFAULT_BORDER_WIDTH = 4;
const DEFAULT_GROUP_BY_ATTRIBUTE = 'country';
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
  options: { readonly visualConfigProvider: VisualConfigProvider },
): RegionBoundaryRenderer {
  const regionMap = new Map<string, RegionGraphics>();

  function clearAll(): void {
    for (const entry of regionMap.values()) {
      entry.graphics.destroy();
      entry.label.destroy();
    }
    regionMap.clear();
  }

  function getOrCreateRegion(key: string): RegionGraphics {
    const existing = regionMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const graphics = new Graphics();
    const label = new Text({ text: '', style: buildLabelStyle() });
    label.anchor.set(0.5, 0.5);
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
        entry.label.destroy();
        regionMap.delete(key);
      }
    }
  }

  return {
    update(zones: readonly RenderZone[], positions: ReadonlyMap<string, Position>): void {
      const config = options.visualConfigProvider.getRegionBoundaryConfig();
      if (config === null) {
        clearAll();
        return;
      }

      const groupByAttribute = config.groupByAttribute ?? DEFAULT_GROUP_BY_ATTRIBUTE;
      const padding = config.padding ?? DEFAULT_PADDING;
      const cornerRadius = config.cornerRadius ?? DEFAULT_CORNER_RADIUS;
      const styles = config.styles ?? {};

      const groups = groupZonesByAttribute(zones, groupByAttribute);
      const activeKeys = new Set<string>();

      for (const [attributeValue, groupZones] of groups.entries()) {
        const style = styles[attributeValue];
        if (style === undefined) {
          continue;
        }

        const cornerPoints = collectZoneCornerPoints(groupZones, positions, options.visualConfigProvider);
        if (cornerPoints.length === 0) {
          continue;
        }

        activeKeys.add(attributeValue);
        const region = getOrCreateRegion(attributeValue);
        drawRegion(region, cornerPoints, style, padding, cornerRadius);
      }

      removeStaleRegions(activeKeys);
    },

    destroy(): void {
      clearAll();
    },
  };
}

function groupZonesByAttribute(
  zones: readonly RenderZone[],
  attribute: string,
): ReadonlyMap<string, readonly RenderZone[]> {
  const groups = new Map<string, RenderZone[]>();

  for (const zone of zones) {
    const value = zone.attributes[attribute];
    if (typeof value !== 'string') {
      continue;
    }

    let group = groups.get(value);
    if (group === undefined) {
      group = [];
      groups.set(value, group);
    }
    group.push(zone);
  }

  return groups;
}

function collectZoneCornerPoints(
  zones: readonly RenderZone[],
  positions: ReadonlyMap<string, Position>,
  visualConfigProvider: VisualConfigProvider,
): readonly Point[] {
  const points: Point[] = [];

  for (const zone of zones) {
    const pos = positions.get(zone.id);
    if (pos === undefined) {
      continue;
    }

    const visual = visualConfigProvider.resolveZoneVisual(
      zone.id,
      zone.category,
      zone.attributes as Readonly<Record<string, unknown>>,
    );
    const halfW = visual.width / 2;
    const halfH = visual.height / 2;

    points.push(
      { x: pos.x - halfW, y: pos.y - halfH },
      { x: pos.x + halfW, y: pos.y - halfH },
      { x: pos.x + halfW, y: pos.y + halfH },
      { x: pos.x - halfW, y: pos.y + halfH },
    );
  }

  return points;
}

function drawRegion(
  region: RegionGraphics,
  cornerPoints: readonly Point[],
  style: RegionStyle,
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
  const labelText = style.label ?? '';
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
