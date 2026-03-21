import type { Point2D } from './point2d.js';
import { quadraticBezierPoint } from './bezier-utils.js';

/**
 * Move each edge of a convex hull outward by `padding` along its normal,
 * then compute new vertex positions at edge intersections.
 */
export function padHull(hull: readonly Point2D[], padding: number): readonly Point2D[] {
  const n = hull.length;
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    const p = hull[0]!;
    return [
      { x: p.x - padding, y: p.y - padding },
      { x: p.x + padding, y: p.y - padding },
      { x: p.x + padding, y: p.y + padding },
      { x: p.x - padding, y: p.y + padding },
    ];
  }
  if (n === 2) {
    return padLineSegment(hull[0]!, hull[1]!, padding);
  }

  const result: Point2D[] = [];

  for (let i = 0; i < n; i += 1) {
    const prev = hull[(i - 1 + n) % n]!;
    const curr = hull[i]!;
    const next = hull[(i + 1) % n]!;

    const n1 = edgeOutwardNormal(prev, curr);
    const n2 = edgeOutwardNormal(curr, next);

    // Bisector direction
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const bLen = Math.sqrt(bx * bx + by * by);

    if (bLen < 1e-10) {
      result.push({ x: curr.x + n1.x * padding, y: curr.y + n1.y * padding });
      continue;
    }

    // The offset along the bisector so that each edge moves outward by `padding`
    const cosHalfAngle = (n1.x * bx + n1.y * by) / bLen;
    const offset = cosHalfAngle > 1e-10 ? padding / cosHalfAngle : padding;
    const clampedOffset = Math.min(offset, padding * 3);

    result.push({
      x: curr.x + (bx / bLen) * clampedOffset,
      y: curr.y + (by / bLen) * clampedOffset,
    });
  }

  return result;
}

function padLineSegment(a: Point2D, b: Point2D, padding: number): readonly Point2D[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) {
    return padHull([a], padding);
  }
  const nx = -dy / len;
  const ny = dx / len;
  const ex = dx / len;
  const ey = dy / len;

  return [
    { x: a.x + nx * padding - ex * padding, y: a.y + ny * padding - ey * padding },
    { x: b.x + nx * padding + ex * padding, y: b.y + ny * padding + ey * padding },
    { x: b.x - nx * padding + ex * padding, y: b.y - ny * padding + ey * padding },
    { x: a.x - nx * padding - ex * padding, y: a.y - ny * padding - ey * padding },
  ];
}

function edgeOutwardNormal(from: Point2D, to: Point2D): Point2D {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) {
    return { x: 0, y: -1 };
  }
  // For CCW hull, outward normal is (dy, -dx) normalized (right of edge direction)
  return { x: dy / len, y: -dx / len };
}

const SAMPLES_PER_CORNER = 8;

/**
 * Replace each sharp vertex of the hull with a quadratic bezier arc.
 * `cornerRadius` controls how far the control points are from the vertex.
 */
export function roundHullCorners(hull: readonly Point2D[], cornerRadius: number): readonly Point2D[] {
  const n = hull.length;
  if (n < 3) {
    return hull;
  }

  const result: Point2D[] = [];

  for (let i = 0; i < n; i += 1) {
    const prev = hull[(i - 1 + n) % n]!;
    const curr = hull[i]!;
    const next = hull[(i + 1) % n]!;

    const toPrevX = prev.x - curr.x;
    const toPrevY = prev.y - curr.y;
    const toPrevLen = Math.sqrt(toPrevX * toPrevX + toPrevY * toPrevY);

    const toNextX = next.x - curr.x;
    const toNextY = next.y - curr.y;
    const toNextLen = Math.sqrt(toNextX * toNextX + toNextY * toNextY);

    const radius = Math.min(cornerRadius, toPrevLen * 0.4, toNextLen * 0.4);

    const p0: Point2D = {
      x: curr.x + (toPrevX / toPrevLen) * radius,
      y: curr.y + (toPrevY / toPrevLen) * radius,
    };
    const p2: Point2D = {
      x: curr.x + (toNextX / toNextLen) * radius,
      y: curr.y + (toNextY / toNextLen) * radius,
    };

    for (let s = 0; s <= SAMPLES_PER_CORNER; s += 1) {
      result.push(quadraticBezierPoint(s / SAMPLES_PER_CORNER, p0, curr, p2));
    }
  }

  return result;
}
