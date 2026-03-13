import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';

import {
  createRegionBoundaryRenderer,
  computeLongestAxis,
  normalizeAngleForReadability,
} from '../../../src/canvas/renderers/region-boundary-renderer.js';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import type { RenderZone } from '../../../src/model/render-model';
import type { Position } from '../../../src/canvas/geometry';
import type { AttributeValue } from '@ludoforge/engine/runtime';

function makeZone(
  id: string,
  category: string | null,
  attributes: Readonly<Record<string, AttributeValue>> = {},
): RenderZone {
  return {
    id,
    displayName: id,
    ordering: 'stack',
    tokenIDs: [],
    hiddenTokenCount: 0,
    markers: [],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category,
    attributes,
    visual: { shape: 'rectangle', width: 100, height: 80, color: null },
    metadata: {},
  };
}

function makePositions(entries: Array<[string, number, number]>): ReadonlyMap<string, Position> {
  return new Map(entries.map(([id, x, y]) => [id, { x, y }]));
}

describe('createRegionBoundaryRenderer', () => {
  let parentContainer: Container;

  beforeEach(() => {
    parentContainer = new Container();
  });

  it('does nothing when no regions config exists', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [makeZone('zone-a', 'province', { country: 'southVietnam' })];
    const positions = makePositions([['zone-a', 100, 100]]);

    renderer.update(zones, positions);
    expect(parentContainer.children).toHaveLength(0);
  });

  it('creates region graphics for zones with matching attribute and style', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        groupByAttribute: 'country',
        padding: 20,
        cornerRadius: 15,
        styles: {
          southVietnam: {
            fillColor: '#2a6e3f',
            fillAlpha: 0.15,
            borderColor: '#4a9e6f',
            borderStyle: 'dashed',
            borderWidth: 2,
            label: 'South Vietnam',
          },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [
      makeZone('zone-a', 'province', { country: 'southVietnam' }),
      makeZone('zone-b', 'province', { country: 'southVietnam' }),
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 100],
    ]);

    renderer.update(zones, positions);
    // Should have added Graphics + Text for one region
    expect(parentContainer.children.length).toBe(2);
  });

  it('creates separate region graphics per attribute value', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        styles: {
          southVietnam: { fillColor: '#2a6e3f', label: 'South Vietnam' },
          cambodia: { fillColor: '#3b4f8a', label: 'Cambodia' },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [
      makeZone('zone-a', 'province', { country: 'southVietnam' }),
      makeZone('zone-b', 'province', { country: 'cambodia' }),
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 300],
    ]);

    renderer.update(zones, positions);
    // 2 regions * (1 Graphics + 1 Text) = 4 children
    expect(parentContainer.children.length).toBe(4);
  });

  it('skips zones without the groupBy attribute', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        styles: {
          southVietnam: { fillColor: '#2a6e3f' },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [
      makeZone('zone-a', 'province', { country: 'southVietnam' }),
      makeZone('zone-b', 'province', {}), // no country attribute
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 300],
    ]);

    renderer.update(zones, positions);
    // Only one region (southVietnam)
    expect(parentContainer.children.length).toBe(2);
  });

  it('removes stale regions when zones change', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        styles: {
          southVietnam: { fillColor: '#2a6e3f' },
          cambodia: { fillColor: '#3b4f8a' },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    // First update: both regions
    const zones1 = [
      makeZone('zone-a', 'province', { country: 'southVietnam' }),
      makeZone('zone-b', 'province', { country: 'cambodia' }),
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 300],
    ]);
    renderer.update(zones1, positions);
    expect(parentContainer.children.length).toBe(4);

    // Second update: only southVietnam
    const zones2 = [makeZone('zone-a', 'province', { country: 'southVietnam' })];
    renderer.update(zones2, positions);
    expect(parentContainer.children.length).toBe(2);
  });

  it('clears everything on destroy', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        styles: { southVietnam: { fillColor: '#2a6e3f' } },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [makeZone('zone-a', 'province', { country: 'southVietnam' })];
    const positions = makePositions([['zone-a', 100, 100]]);
    renderer.update(zones, positions);

    renderer.destroy();
    expect(parentContainer.children.length).toBe(0);
  });

  it('supports custom groupByAttribute', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        groupByAttribute: 'terrain',
        styles: {
          highland: { fillColor: '#6b5b3e' },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [
      makeZone('zone-a', 'province', { terrain: 'highland' }),
      makeZone('zone-b', 'province', { terrain: 'lowland' }),
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 300],
    ]);

    renderer.update(zones, positions);
    // Only highland has a style
    expect(parentContainer.children.length).toBe(2);
  });
});

describe('normalizeAngleForReadability', () => {
  it('returns 0 for angle 0 (rightward)', () => {
    expect(normalizeAngleForReadability(0)).toBe(0);
  });

  it('preserves angles within -π/2 to π/2 (right-facing)', () => {
    const angle = Math.PI / 4; // 45° — already right-facing
    expect(normalizeAngleForReadability(angle)).toBe(angle);
  });

  it('preserves small negative angles (slightly downward-right)', () => {
    const angle = -Math.PI / 4; // -45°
    expect(normalizeAngleForReadability(angle)).toBe(angle);
  });

  it('flips angle pointing left (> π/2) to face right', () => {
    const angle = (3 * Math.PI) / 4; // 135° — pointing left-upward
    const normalized = normalizeAngleForReadability(angle);
    // Should become 135° - 180° = -45°
    expect(normalized).toBeCloseTo(-Math.PI / 4);
  });

  it('flips angle pointing left (< -π/2) to face right', () => {
    const angle = (-3 * Math.PI) / 4; // -135° — pointing left-downward
    const normalized = normalizeAngleForReadability(angle);
    // Should become -135° + 180° = 45°
    expect(normalized).toBeCloseTo(Math.PI / 4);
  });

  it('flips straight-up vertical (close to π) to face right', () => {
    const angle = Math.PI * 0.9; // ~162° — clearly leftward
    const normalized = normalizeAngleForReadability(angle);
    expect(normalized).toBeCloseTo(angle - Math.PI);
    expect(Math.abs(normalized)).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('preserves exactly π/2 (straight down)', () => {
    // At exactly π/2, text reads downward — acceptable boundary
    expect(normalizeAngleForReadability(Math.PI / 2)).toBe(Math.PI / 2);
  });

  it('preserves exactly -π/2 (straight up)', () => {
    expect(normalizeAngleForReadability(-Math.PI / 2)).toBe(-Math.PI / 2);
  });
});

describe('computeLongestAxis', () => {
  it('returns zero for empty hull', () => {
    expect(computeLongestAxis([])).toEqual({ angle: 0, length: 0 });
  });

  it('returns zero for single-point hull', () => {
    expect(computeLongestAxis([{ x: 5, y: 5 }])).toEqual({ angle: 0, length: 0 });
  });

  it('computes correct length for horizontal pair', () => {
    const axis = computeLongestAxis([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(axis.length).toBeCloseTo(100);
    expect(axis.angle).toBeCloseTo(0); // horizontal → 0 radians
  });

  it('computes correct length for vertical pair', () => {
    const axis = computeLongestAxis([
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ]);
    expect(axis.length).toBeCloseTo(200);
    // Vertical axis should be normalized to -π/2 or π/2
    expect(Math.abs(axis.angle)).toBeCloseTo(Math.PI / 2);
  });

  it('normalizes angle so text reads left-to-right for leftward axis', () => {
    // Points arranged so longest axis goes from right to left
    const axis = computeLongestAxis([
      { x: 100, y: 0 },
      { x: -100, y: 50 },
    ]);
    // Raw angle would be > π/2 (pointing left), normalized should be in [-π/2, π/2]
    expect(Math.abs(axis.angle)).toBeLessThanOrEqual(Math.PI / 2 + 0.01);
  });

  it('finds the diameter among multiple hull points', () => {
    const axis = computeLongestAxis([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 300, y: 10 },
      { x: 150, y: -20 },
    ]);
    // Distance between (0,0) and (300,10) ≈ 300.17 — should be the longest
    expect(axis.length).toBeCloseTo(Math.sqrt(300 * 300 + 10 * 10));
  });
});
