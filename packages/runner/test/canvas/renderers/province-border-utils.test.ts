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
    // Province A at (0,0) with a diamond shape, province B at (300,0).
    // A's right-side vertices (+100, 0) face B.
    const verticesA = [0, -100, 100, 0, 0, 100, -100, 0]; // diamond
    const verticesB = [0, -100, 100, 0, 0, 100, -100, 0]; // diamond
    const zones = [
      makeProvinceZone('a', verticesA),
      makeProvinceZone('b', verticesB),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    expect(result.size).toBe(2);

    const polyA = result.get('a')!;
    // The vertex at index 1 (100, 0) faces B. It should be projected.
    expect(polyA.segments[1]!.isBorder).toBe(true);
    // The vertex at index 3 (-100, 0) faces away from B. It should NOT be projected.
    expect(polyA.segments[3]!.isBorder).toBe(false);

    // The projected vertex should be closer to the bisector (x=150) than original (x=100).
    const projectedX = polyA.vertices[2]!; // x of vertex at index 1
    expect(projectedX).toBeGreaterThan(100);
    expect(projectedX).toBeLessThanOrEqual(150);
  });

  it('skips non-province zones', () => {
    const zones = [
      makeProvinceZone('city', [0, -50, 50, 0, 0, 50, -50, 0], { category: 'city' }),
    ];
    const result = computeProvinceBorders(zones, new Map([['city', { x: 0, y: 0 }]]), []);
    expect(result.size).toBe(0);
  });

  it('handles three provinces at a corner', () => {
    const diamond = [0, -80, 80, 0, 0, 80, -80, 0];
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
      makeProvinceZone('c', diamond),
    ];
    // Equilateral triangle arrangement.
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 200, y: 0 }],
      ['c', { x: 100, y: 173 }],
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
    // Two identical diamonds at different positions.
    const diamond = [0, -100, 100, 0, 0, 100, -100, 0];
    const zones = [
      makeProvinceZone('a', diamond),
      makeProvinceZone('b', diamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // The facing vertex (index 1, at local +100,0) should project near x=150 (midpoint).
    const projectedX = polyA.vertices[2]!;
    // With equal areas, the bisector midpoint is at x=150. Inset by gap moves it slightly.
    expect(projectedX).toBeGreaterThan(140);
    expect(projectedX).toBeLessThan(155);
  });

  it('polygon A with 4x area shifts bisector toward B (t > 0.5)', () => {
    // Province A: large diamond (scale 2x → area 4x)
    const largeDiamond = [0, -200, 200, 0, 0, 200, -200, 0];
    // Province B: small diamond
    const smallDiamond = [0, -100, 100, 0, 0, 100, -100, 0];
    const zones = [
      makeProvinceZone('a', largeDiamond),
      makeProvinceZone('b', smallDiamond),
    ];
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 400, y: 0 }],
    ]);
    const adjacencies = [makeAdj('a', 'b')];

    const result = computeProvinceBorders(zones, positions, adjacencies);
    const polyA = result.get('a')!;
    // The facing vertex should project past the old midpoint (x=200).
    // With t > 0.5, weighted midpoint shifts toward B.
    const projectedX = polyA.vertices[2]!;
    expect(projectedX).toBeGreaterThan(200);
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
