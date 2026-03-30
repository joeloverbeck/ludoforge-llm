import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from 'pixi.js';

const { MockContainer, MockGraphics, MockText } = vi.hoisted(() => {
  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    visible = true;

    renderable = true;

    alpha = 1;

    rotation = 0;

    eventMode = 'auto';

    interactiveChildren = true;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    destroy(): void {
      this.removeFromParent();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    clearCalls = 0;

    polyCalls: number[][] = [];

    fillCalls: unknown[] = [];

    moveCalls: Array<{ x: number; y: number }> = [];

    lineCalls: Array<{ x: number; y: number }> = [];

    strokeCalls: unknown[] = [];

    clear(): this {
      this.clearCalls += 1;
      this.polyCalls = [];
      this.fillCalls = [];
      this.moveCalls = [];
      this.lineCalls = [];
      this.strokeCalls = [];
      return this;
    }

    poly(points: number[]): this {
      this.polyCalls.push(points);
      return this;
    }

    fill(style: unknown): this {
      this.fillCalls.push(style);
      return this;
    }

    moveTo(x: number, y: number): this {
      this.moveCalls.push({ x, y });
      return this;
    }

    lineTo(x: number, y: number): this {
      this.lineCalls.push({ x, y });
      return this;
    }

    stroke(style?: unknown): this {
      this.strokeCalls.push(style);
      return this;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text = '';

    style: unknown = {};

    width = 0;

    anchor = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.anchor.x = x;
        this.anchor.y = y;
      },
    };

    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      },
    };

    scale = {
      x: 1,
      y: 1,
      set: (x: number, y: number) => {
        this.scale.x = x;
        this.scale.y = y;
      },
    };

    constructor(options: { text?: string; style?: unknown } = {}) {
      super();
      this.text = options.text ?? '';
      this.style = options.style ?? {};
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
  Text: MockText,
}));

import {
  createRegionBoundaryRenderer,
  computeLongestAxis,
  normalizeAngleForReadability,
} from '../../../src/canvas/renderers/region-boundary-renderer.js';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import { resolveRegionNodes } from '../../../src/presentation/presentation-scene.js';
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
    visual: { shape: 'rectangle', width: 100, height: 80, color: null, connectionStyleKey: null, vertices: null, strokeColor: null },
    metadata: {},
  };
}

function makePositions(entries: Array<[string, number, number]>): ReadonlyMap<string, Position> {
  return new Map(entries.map(([id, x, y]) => [id, { x, y }]));
}

function updateRenderer(
  renderer: ReturnType<typeof createRegionBoundaryRenderer>,
  provider: VisualConfigProvider,
  zones: readonly RenderZone[],
  positions: ReadonlyMap<string, Position>,
): void {
  renderer.update(resolveRegionNodes(zones, positions, provider));
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

    updateRenderer(renderer, provider, zones, positions);
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

    updateRenderer(renderer, provider, zones, positions);
    // Should have added Graphics + Text for one region
    expect(parentContainer.children.length).toBe(2);
  });

  it('strokes dashed region borders as isolated dash segments', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        groupByAttribute: 'country',
        styles: {
          southVietnam: {
            fillColor: '#2a6e3f',
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

    updateRenderer(renderer, provider, zones, positions);

    const graphics = parentContainer.children[0] as unknown as InstanceType<typeof MockGraphics>;
    expect(graphics.fillCalls).toHaveLength(1);
    expect(graphics.moveCalls.length).toBeGreaterThan(0);
    expect(graphics.lineCalls).toHaveLength(graphics.moveCalls.length);
    expect(graphics.strokeCalls.length).toBe(graphics.moveCalls.length);
    expect(graphics.strokeCalls).toEqual(
      new Array(graphics.moveCalls.length).fill({ color: '#4a9e6f', width: 2 }),
    );
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

    updateRenderer(renderer, provider, zones, positions);
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

    updateRenderer(renderer, provider, zones, positions);
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
    updateRenderer(renderer, provider, zones1, positions);
    expect(parentContainer.children.length).toBe(4);

    // Second update: only southVietnam
    const zones2 = [makeZone('zone-a', 'province', { country: 'southVietnam' })];
    updateRenderer(renderer, provider, zones2, positions);
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
    updateRenderer(renderer, provider, zones, positions);

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

    updateRenderer(renderer, provider, zones, positions);
    // Only highland has a style
    expect(parentContainer.children.length).toBe(2);
  });

  it('keeps solid region borders as a single polygon stroke', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      regions: {
        groupByAttribute: 'country',
        styles: {
          cambodia: {
            fillColor: '#3b4f8a',
            borderColor: '#6b82cc',
            borderStyle: 'solid',
            borderWidth: 3,
            label: 'Cambodia',
          },
        },
      },
    });
    const renderer = createRegionBoundaryRenderer(parentContainer, { visualConfigProvider: provider });

    const zones = [
      makeZone('zone-a', 'province', { country: 'cambodia' }),
      makeZone('zone-b', 'province', { country: 'cambodia' }),
    ];
    const positions = makePositions([
      ['zone-a', 100, 100],
      ['zone-b', 300, 100],
    ]);

    updateRenderer(renderer, provider, zones, positions);

    const graphics = parentContainer.children[0] as unknown as InstanceType<typeof MockGraphics>;
    expect(graphics.polyCalls).toHaveLength(2);
    expect(graphics.moveCalls).toEqual([]);
    expect(graphics.lineCalls).toEqual([]);
    expect(graphics.strokeCalls).toEqual([{ color: '#6b82cc', width: 3 }]);
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
