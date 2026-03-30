import type { Position } from '../spatial/position-types.js';
import {
  normalize,
  perpendicular,
} from '../canvas/geometry/bezier-utils.js';

export interface WaveConfig {
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
}

export function getPolylineLength(points: readonly Position[]): number {
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

export function resolvePolylinePointAtDistance(
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

export function samplePolylineWavePoints(
  points: readonly Position[],
  config: WaveConfig,
  wavySegments: number,
): readonly Position[] {
  const totalLength = getPolylineLength(points);
  if (totalLength === 0) {
    return [...points];
  }

  const segmentCount = Math.max(2, Math.trunc(wavySegments));
  const waveCycles = Math.max(1, totalLength * config.waveFrequency);
  const displacedPoints: Position[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const distance = totalLength * (index / segmentCount);
    const sample = resolvePolylinePointAtDistance(points, distance);
    const normal = perpendicular(normalize(sample.tangent));
    const offset = Math.sin((distance / totalLength) * Math.PI * 2 * waveCycles) * config.waveAmplitude;
    displacedPoints.push({
      x: sample.position.x + normal.x * offset,
      y: sample.position.y + normal.y * offset,
    });
  }

  return displacedPoints;
}

export function approximatePolylineHitPolygon(
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

export function resolvePolylineNormal(points: readonly Position[], index: number): Position {
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

const UPSIDE_DOWN_MIN = Math.PI / 2;
const UPSIDE_DOWN_MAX = (Math.PI * 3) / 2;

export function resolveLabelRotation(angle: number): number {
  const normalizedAngle = normalizeAngle(angle);
  if (normalizedAngle > UPSIDE_DOWN_MIN && normalizedAngle < UPSIDE_DOWN_MAX) {
    return normalizeAngle(normalizedAngle + Math.PI);
  }
  return normalizedAngle;
}

export function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized < 0) {
    normalized += Math.PI * 2;
  }
  while (normalized >= Math.PI * 2) {
    normalized -= Math.PI * 2;
  }
  return normalized;
}

export function flattenPoints(points: readonly Position[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}
