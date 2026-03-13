export interface Point {
  readonly x: number;
  readonly y: number;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Andrew's monotone chain convex hull algorithm.
 * Returns vertices in counter-clockwise order.
 */
export function convexHull(points: readonly Point[]): readonly Point[] {
  if (points.length <= 1) {
    return points;
  }

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const n = sorted.length;

  if (n === 2) {
    return sorted[0]!.x === sorted[1]!.x && sorted[0]!.y === sorted[1]!.y
      ? [sorted[0]!]
      : sorted;
  }

  const lower: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, sorted[i]!) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]!);
  }

  const upper: Point[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, sorted[i]!) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]!);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}
