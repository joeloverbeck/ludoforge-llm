import { describe, expect, it } from 'vitest';

import {
  computeProvinceBorders,
  effectiveRadius,
  polygonArea,
  selectiveSmoothPolygon,
  type ModifiedProvincePolygon,
} from '../../../src/canvas/renderers/province-border-utils';
import type { PresentationAdjacencyNode, PresentationZoneNode } from '../../../src/presentation/presentation-scene';

function makeProvinceZone(
  id: string,
  vertices: readonly number[],
  overrides: Partial<PresentationZoneNode> = {},
): PresentationZoneNode {
  return {
    id,
    displayName: id,
    ownerID: null,
    isSelectable: false,
    category: 'province',
    attributes: {},
    visual: {
      shape: 'polygon',
      width: 100,
      height: 100,
      color: null,
      connectionStyleKey: null,
      vertices,
      strokeColor: null,
    },
    render: {
      fillColor: '#4d5c6d',
      stroke: { color: '#111827', width: 1, alpha: 0.7 },
      nameLabel: { text: id, x: 0, y: 0, visible: true },
      markersLabel: { text: '', x: 0, y: 0, visible: false, markers: [] },
      hiddenStackCount: 0,
      badge: { visible: false, text: '', x: 0, y: 0 },
    },
    ...overrides,
  } as PresentationZoneNode;
}

function makeAdj(from: string, to: string): PresentationAdjacencyNode {
  return { from, to, category: null, isHighlighted: false };
}

describe('computeProvinceBorders', () => {
  it('returns empty map when no provinces have polygon shape', () => {
    const zones: PresentationZoneNode[] = [
      makeProvinceZone('a', []),
    ];
    const result = computeProvinceBorders(zones, new Map(), []);
    expect(result.size).toBe(0);
  });

  it('returns original vertices for provinces with no adjacent provinces', () => {
    const vertices = [0, -100, 100, 0, 0, 100, -100, 0];
    const zones = [makeProvinceZone('a', vertices)];
    const positions = new Map([['a', { x: 0, y: 0 }]]);
    const result = computeProvinceBorders(zones, positions, []);
    expect(result.size).toBe(1);
    const polygon = result.get('a')!;
    expect(polygon.vertices).toEqual(vertices);
    expect(polygon.segments.every((s) => !s.isBorder)).toBe(true);
  });

  it('modifies vertices facing an adjacent province', () => {
    // Province A at (0,0) with a diamond shape, province B close enough for proximity gate.
    // Diamond area = 20000, effectiveRadius ≈ 79.79. Gap at dist 190 ≈ 30 < 40.
    const verticesA = [0, -100, 100, 0, 0, 100, -100, 0]; // diamond
    const verticesB = [0, -100, 100, 0, 0, 100, -100, 0]; // diamond
    const zones = [
      makeProvinceZone('a', verticesA),
      makeProvinceZone('b', verticesB),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 190, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    expect(result.size).toBe(2);

    const polyA = result.get('a')!;
    // The vertex at index 1 (100, 0) faces B. It should be projected.
    expect(polyA.segments[1]!.isBorder).toBe(true);
    // The vertex at index 3 (-100, 0) faces away from B. It should NOT be projected.
    expect(polyA.segments[3]!.isBorder).toBe(false);

    // The projected vertex should be closer to the bisector (x=95) than original (x=100).
    const projectedX = polyA.vertices[2]!; // x of vertex at index 1
    expect(projectedX).toBeGreaterThan(80);
    expect(projectedX).toBeLessThanOrEqual(100);
  });

  it('skips non-province zones', () => {
    const zones = [
      makeProvinceZone('city', [0, -50, 50, 0, 0, 50, -50, 0], { category: 'city' }),
    ];
    const result = computeProvinceBorders(zones, new Map([['city', { x: 0, y: 0 }]]), []);
    expect(result.size).toBe(0);
  });

  it('handles three provinces at a corner', () => {
    // Diamond area = 12800, effectiveRadius ≈ 63.83. At dist 150, gap ≈ 22 < 40.
    const diamond = [0, -80, 80, 0, 0, 80, -80, 0];
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
      makeProvinceZone('c', diamond),
    ];
    // Equilateral triangle arrangement, close enough for proximity gate.
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 150, y: 0 }],
      ['c', { x: 75, y: 130 }],
    ]);
    const adjacencies = [makeAdj('a', 'b'), makeAdj('b', 'c'), makeAdj('a', 'c')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    expect(result.size).toBe(3);
    // All three provinces should have some border vertices.
    for (const polygon of result.values()) {
      expect(polygon.segments.some((s) => s.isBorder)).toBe(true);
    }
  });
});

describe('polygonArea', () => {
  it('returns 0 for fewer than 3 vertices', () => {
    expect(polygonArea([0, 0, 10, 10])).toBe(0);
    expect(polygonArea([])).toBe(0);
  });

  it('computes correct area for a right triangle', () => {
    // Triangle with vertices (0,0), (10,0), (0,10) → area = 50
    expect(polygonArea([0, 0, 10, 0, 0, 10])).toBe(50);
  });

  it('computes correct area for a rectangle', () => {
    // 100×200 rectangle → area = 20000
    expect(polygonArea([0, 0, 100, 0, 100, 200, 0, 200])).toBe(20000);
  });

  it('returns positive area regardless of winding order', () => {
    // CW winding
    const cw = [0, 0, 0, 10, 10, 0];
    // CCW winding
    const ccw = [0, 0, 10, 0, 0, 10];
    expect(polygonArea(cw)).toBe(polygonArea(ccw));
  });
});

describe('effectiveRadius', () => {
  it('returns 0 for area 0', () => {
    expect(effectiveRadius(0)).toBe(0);
  });

  it('returns correct radius for a known area', () => {
    // Circle with area π → radius = 1
    expect(effectiveRadius(Math.PI)).toBeCloseTo(1, 10);
  });

  it('returns correct radius for area 100π', () => {
    expect(effectiveRadius(100 * Math.PI)).toBeCloseTo(10, 10);
  });
});

describe('weighted bisector', () => {
  it('equal-area polygons produce midpoint bisector (t ≈ 0.5)', () => {
    // Two identical diamonds close enough for proximity gate.
    // Diamond area = 20000, r ≈ 79.79. At dist 180, gap ≈ 20 < 40.
    const diamond = [0, -100, 100, 0, 0, 100, -100, 0];
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 180, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // The facing vertex (index 1, at local +100,0) should project near x=90 (midpoint).
    const projectedX = polyA.vertices[2]!;
    // With equal areas, the bisector midpoint is at x=90. Inset by gap moves it slightly.
    expect(projectedX).toBeGreaterThan(80);
    expect(projectedX).toBeLessThan(95);
  });

  it('polygon A with 4x area shifts bisector toward B (t > 0.5)', () => {
    // Province A: large diamond (scale 2x → area 4x), r_A ≈ 159.58
    // Province B: small diamond, r_B ≈ 79.79
    // At dist 260, gap ≈ 260 - 159.58 - 79.79 ≈ 20.63 < 40.
    const largeDiamond = [0, -200, 200, 0, 0, 200, -200, 0];
    const smallDiamond = [0, -100, 100, 0, 0, 100, -100, 0];
    const zones = [
      makeProvinceZone('a', largeDiamond),
      makeProvinceZone('b', smallDiamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 260, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // The facing vertex should project past the simple midpoint (x=130).
    // With t > 0.5, weighted midpoint shifts toward B.
    const projectedX = polyA.vertices[2]!;
    expect(projectedX).toBeGreaterThan(130);
  });
});

describe('proximity gate', () => {
  const diamond = [0, -100, 100, 0, 0, 100, -100, 0] as const;
  // Diamond area = 20000, effectiveRadius ≈ 79.79
  const r = Math.sqrt(20000 / Math.PI);

  it('skips border when gap > PROXIMITY_THRESHOLD (40px)', () => {
    // Place provinces 600px apart → gap ≈ 600 - 2*79.79 ≈ 440 >> 40
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 600, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // All vertices should be non-border (proximity gate skipped the pair).
    expect(polyA.segments.every((s) => !s.isBorder)).toBe(true);
    // Vertices should be unchanged from original.
    expect([...polyA.vertices]).toEqual([...diamond]);
  });

  it('produces border when gap < PROXIMITY_THRESHOLD (40px)', () => {
    // Place provinces so gap ≈ 180 - 2*79.79 ≈ 20 < 40
    const dist = 2 * r + 20; // gap = 20px
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: dist, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // At least one vertex should be a border vertex.
    expect(polyA.segments.some((s) => s.isBorder)).toBe(true);
  });

  it('excludes border at exactly PROXIMITY_THRESHOLD boundary', () => {
    // gap = exactly 40 → not greater than threshold, so border should form
    const dist = 2 * r + 40;
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: dist, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // gap === 40, condition is `gap > 40` so this pair is NOT skipped.
    expect(polyA.segments.some((s) => s.isBorder)).toBe(true);
  });

  it('just beyond threshold excludes border', () => {
    // gap = 40.01 → greater than threshold, border skipped
    const dist = 2 * r + 40.01;
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: dist, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    expect(polyA.segments.every((s) => !s.isBorder)).toBe(true);
  });
});

describe('soft cone blending', () => {
  // Province A at origin, Province B to the east. Bisector angle from A = 0 (east).
  // FACING_CONE_HALF = π/3 (60°), BLEND_MARGIN = π/12 (15°).
  // Blend zone: angleDiff ∈ [45°, 60°].
  // Triangle at R=100 has area≈12990, effectiveRadius≈64. dist=140 → gap≈11 < 40.
  const R = 100;
  const dist = 140;

  function vertexAt(angleDeg: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180;
    return [R * Math.cos(rad), R * Math.sin(rad)];
  }

  function buildTestPolygon(angleDegrees: number[]): readonly number[] {
    const verts: number[] = [];
    for (const deg of angleDegrees) {
      const [x, y] = vertexAt(deg);
      verts.push(x, y);
    }
    return verts;
  }

  function runBlendTest(angleDegrees: number[]) {
    const verts = buildTestPolygon(angleDegrees);
    const zones = [
      makeProvinceZone('a', verts),
      makeProvinceZone('b', verts),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: dist, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];
    return computeProvinceBorders(zones, positions, adjacencies).get('a')!;
  }

  it('vertex at cone center (0°): fully projected, isBorder: true', () => {
    // Angles: 0° (facing B), 120°, 240° (both outside cone)
    const poly = runBlendTest([0, 120, 240]);
    expect(poly.segments[0]!.isBorder).toBe(true);
    // Vertex should be moved toward bisector (x changed from 100)
    const projX = poly.vertices[0]!;
    expect(projX).not.toBeCloseTo(R, 0);
  });

  it('vertex deep in cone (30°): fully projected, isBorder: true', () => {
    // 30° is well inside the 45° blend boundary
    const poly = runBlendTest([30, 150, 270]);
    expect(poly.segments[0]!.isBorder).toBe(true);
  });

  it('vertex in blend zone (52°): partially projected, isBorder: false', () => {
    // 52° is inside the cone (< 60°) but inside the blend zone (> 45°)
    const poly = runBlendTest([52, 180, 300]);
    expect(poly.segments[0]!.isBorder).toBe(false);
    // Position should be between original and fully projected
    const blendedX = poly.vertices[0]!;
    const originalX = vertexAt(52)[0];
    // Not exactly the original position (some blending happened)
    expect(blendedX).not.toBeCloseTo(originalX, 1);
  });

  it('vertex at cone edge (60°): blend ≈ 0, essentially original, isBorder: false', () => {
    // 60° is exactly at the cone boundary — blend should be ~0
    const poly = runBlendTest([60, 180, 300]);
    expect(poly.segments[0]!.isBorder).toBe(false);
    const blendedX = poly.vertices[0]!;
    const originalX = vertexAt(60)[0];
    // Should be very close to original position
    expect(blendedX).toBeCloseTo(originalX, 0);
  });

  it('vertex outside cone (70°): not projected at all', () => {
    // 70° is outside the ±60° cone entirely
    const poly = runBlendTest([70, 190, 310]);
    expect(poly.segments[0]!.isBorder).toBe(false);
    const blendedX = poly.vertices[0]!;
    const blendedY = poly.vertices[1]!;
    const [origX, origY] = vertexAt(70);
    expect(blendedX).toBeCloseTo(origX, 5);
    expect(blendedY).toBeCloseTo(origY, 5);
  });
});

describe('selectiveSmoothPolygon', () => {
  it('returns vertices unchanged when iterations is 0', () => {
    const polygon: ModifiedProvincePolygon = {
      vertices: [0, 0, 100, 0, 100, 100, 0, 100],
      segments: [
        { isBorder: false },
        { isBorder: false },
        { isBorder: false },
        { isBorder: false },
      ],
    };
    const result = selectiveSmoothPolygon(polygon, 0);
    expect(result).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
  });

  it('smooths non-border segments with Chaikin algorithm', () => {
    const polygon: ModifiedProvincePolygon = {
      vertices: [0, 0, 100, 0, 100, 100, 0, 100],
      segments: [
        { isBorder: false },
        { isBorder: false },
        { isBorder: false },
        { isBorder: false },
      ],
    };
    const result = selectiveSmoothPolygon(polygon, 1);
    // After 1 iteration of Chaikin on 4 vertices, should produce 8 vertices (16 numbers).
    expect(result.length).toBe(16);
  });

  it('preserves border segments without smoothing', () => {
    const polygon: ModifiedProvincePolygon = {
      vertices: [0, 0, 100, 0, 100, 100, 0, 100],
      segments: [
        { isBorder: true },
        { isBorder: true },
        { isBorder: true },
        { isBorder: true },
      ],
    };
    const result = selectiveSmoothPolygon(polygon, 2);
    // All border: the "border-to-border" path duplicates vertices but doesn't subdivide.
    // Each pair of consecutive border vertices produces 2 output vertices,
    // so 4 pairs × 2 = 8 vertices × 2 coords = 16 numbers per iteration.
    // The actual content should include the original vertex values.
    expect(result).toContain(0);
    expect(result).toContain(100);
  });
});
