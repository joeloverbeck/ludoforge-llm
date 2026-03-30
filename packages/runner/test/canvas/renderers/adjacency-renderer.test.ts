import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { PresentationZoneNode } from '../../../src/presentation/presentation-scene';
import type { ResolvedZoneVisual } from '../../../src/config/visual-config-provider';

const {
  MockContainer,
  MockGraphics,
} = vi.hoisted(() => {
  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    visible = true;

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
    drawnFrom: { x: number; y: number } | null = null;

    drawnTo: { x: number; y: number } | null = null;

    strokeStyle: unknown;

    moveCalls: Array<{ x: number; y: number }> = [];

    lineCalls: Array<{ x: number; y: number }> = [];

    strokeCalls: unknown[] = [];

    clearCalls = 0;

    isDestroyed = false;

    clear(): this {
      this.clearCalls += 1;
      this.drawnFrom = null;
      this.drawnTo = null;
      this.strokeStyle = undefined;
      this.moveCalls = [];
      this.lineCalls = [];
      this.strokeCalls = [];
      return this;
    }

    moveTo(x: number, y: number): this {
      this.drawnFrom = { x, y };
      this.moveCalls.push({ x, y });
      return this;
    }

    lineTo(x: number, y: number): this {
      this.drawnTo = { x, y };
      this.lineCalls.push({ x, y });
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      this.strokeCalls.push(style);
      return this;
    }

    override destroy(): void {
      this.isDestroyed = true;
      super.destroy();
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
}));

import { createAdjacencyRenderer } from '../../../src/canvas/renderers/adjacency-renderer';
import { createDisposalQueue, type DisposalQueue } from '../../../src/canvas/renderers/disposal-queue';
import type { Position } from '../../../src/canvas/geometry';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider';
import type { RenderAdjacency } from '../../../src/model/render-model';

function makeAdjacency(overrides: Partial<RenderAdjacency> = {}): RenderAdjacency {
  return {
    from: 'zone:a',
    to: 'zone:b',
    category: null,
    isHighlighted: false,
    ...overrides,
  };
}

function createPositions(entries: readonly [string, Position][]): ReadonlyMap<string, Position> {
  return new Map(entries);
}

function makeZoneVisual(overrides: Partial<ResolvedZoneVisual> = {}): ResolvedZoneVisual {
  return {
    shape: 'rectangle',
    width: 20,
    height: 20,
    color: null,
    connectionStyleKey: null,
    vertices: null,
    strokeColor: null,
    ...overrides,
  };
}

function makeZone(id: string, visual: ResolvedZoneVisual = makeZoneVisual()): PresentationZoneNode {
  return {
    id,
    displayName: id,
    ownerID: null,
    isSelectable: false,
    category: null,
    attributes: {},
    visual,
    render: {
      fillColor: '#000000',
      stroke: { color: '#000000', width: 1, alpha: 1 },
      hiddenStackCount: 0,
      nameLabel: { text: id, x: 0, y: 0, visible: true },
      markersLabel: { text: '', x: 0, y: 0, visible: false },
      badge: null,
    },
  };
}

function createZones(entries: readonly [string, ResolvedZoneVisual?][]): readonly PresentationZoneNode[] {
  return entries.map(([id, visual]) => makeZone(id, visual ?? makeZoneVisual()));
}

function createRenderer(
  parent: InstanceType<typeof MockContainer>,
  visualConfigProvider: VisualConfigProvider,
  disposalQueue: DisposalQueue = createDisposalQueue({ scheduleFlush: () => {} }),
) {
  return {
    renderer: createAdjacencyRenderer(parent as unknown as Container, visualConfigProvider, {
      disposalQueue,
    }),
    disposalQueue,
  };
}

describe('createAdjacencyRenderer', () => {
  it('update with empty array creates no graphics objects', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update([], new Map(), []);

    expect(parent.children).toHaveLength(0);
  });

  it('creates one graphics object per unique adjacency pair and dedupes reversed pairs', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [
        makeAdjacency({ from: 'zone:a', to: 'zone:b' }),
        makeAdjacency({ from: 'zone:c', to: 'zone:d' }),
        makeAdjacency({ from: 'zone:b', to: 'zone:a' }),
      ],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
        ['zone:c'],
        ['zone:d'],
      ]),
    );

    expect(parent.children).toHaveLength(2);
  });

  it('retires removed graphics through the shared disposal queue', () => {
    const parent = new MockContainer();
    const disposalQueue = createDisposalQueue({ scheduleFlush: () => {} });
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null), disposalQueue);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' }), makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
        ['zone:c'],
        ['zone:d'],
      ]),
    );

    const firstGraphics = parent.children[0] as InstanceType<typeof MockGraphics>;

    renderer.update(
      [makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
      createZones([
        ['zone:c'],
        ['zone:d'],
      ]),
    );

    expect(firstGraphics.isDestroyed).toBe(false);
    expect(parent.children).toHaveLength(1);
    disposalQueue.flush();
    expect(firstGraphics.isDestroyed).toBe(true);
  });

  it('adds graphics for newly added pairs on subsequent update', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' }), makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
        ['zone:c'],
        ['zone:d'],
      ]),
    );

    expect(parent.children).toHaveLength(2);
  });

  it('clips rectangle endpoints to zone edges and strokes each dash segment explicitly', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a', makeZoneVisual({ width: 20, height: 30 })],
        ['zone:b', makeZoneVisual({ width: 20, height: 30 })],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.moveCalls).toEqual([
      { x: 20, y: 20 },
      { x: 35, y: 20 },
      { x: 50, y: 20 },
      { x: 65, y: 20 },
      { x: 80, y: 20 },
      { x: 95, y: 20 },
    ]);
    expect(graphics.lineCalls).toEqual([
      { x: 30, y: 20 },
      { x: 45, y: 20 },
      { x: 60, y: 20 },
      { x: 75, y: 20 },
      { x: 90, y: 20 },
      { x: 100, y: 20 },
    ]);
    expect(graphics.strokeCalls).toEqual(new Array(6).fill({ color: 0xffffff, width: 3.5, alpha: 0.85 }));
    expect(graphics.clearCalls).toBe(1);
  });

  it('updates clipped endpoints in place when positions change', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.moveCalls[0]).toEqual({ x: 20, y: 20 });
    expect(graphics.lineCalls.at(-1)).toEqual({ x: 100, y: 20 });

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 100, y: 200 }],
        ['zone:b', { x: 300, y: 200 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    expect(parent.children[0]).toBe(graphics);
    expect(graphics.moveCalls[0]).toEqual({ x: 110, y: 200 });
    expect(graphics.lineCalls.at(-1)).toEqual({ x: 285, y: 200 });
    expect(graphics.clearCalls).toBe(2);
  });

  it('uses highlighted style when adjacency is highlighted (including merged bidirectional pairs)', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [
        makeAdjacency({ from: 'zone:a', to: 'zone:b', isHighlighted: false }),
        makeAdjacency({ from: 'zone:b', to: 'zone:a', isHighlighted: true }),
      ],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0xffffff, width: 4.5, alpha: 1.0 });
    expect(graphics.strokeCalls.length).toBeGreaterThan(0);
    expect(graphics.strokeCalls).toEqual(new Array(graphics.strokeCalls.length).fill({ color: 0xffffff, width: 4.5, alpha: 1.0 }));
  });

  it('uses category style from visual config provider when present', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(
      parent,
      new VisualConfigProvider({
        version: 1,
        edges: {
          categoryStyles: {
            loc: { color: '#8b7355', width: 2, alpha: 0.4 },
          },
        },
      }),
    );

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b', category: 'loc', isHighlighted: false })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0x8b7355, width: 2, alpha: 0.4 });
  });

  it('uses highlighted style over category style when highlighted', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(
      parent,
      new VisualConfigProvider({
        version: 1,
        edges: {
          categoryStyles: {
            loc: { color: '#8b7355', width: 2, alpha: 0.4 },
          },
          highlighted: {
            color: '#00ffff',
            width: 6,
            alpha: 0.95,
          },
        },
      }),
    );

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b', category: 'loc', isHighlighted: true })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0x00ffff, width: 6, alpha: 0.95 });
  });

  it('falls back to the shared default color when the resolved color is invalid', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(
      parent,
      new VisualConfigProvider({
        version: 1,
        edges: {
          default: {
            color: 'not-a-color',
            width: 7,
            alpha: 0.25,
          },
        },
      }),
    );

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0xffffff, width: 7, alpha: 0.25 });
  });

  it('falls back to the shared highlighted color when the highlighted resolved color is invalid', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(
      parent,
      new VisualConfigProvider({
        version: 1,
        edges: {
          highlighted: {
            color: 'not-a-color',
            width: 9,
            alpha: 0.4,
          },
        },
      }),
    );

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b', isHighlighted: true })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0xffffff, width: 9, alpha: 0.4 });
  });

  it('skips missing positions without throwing and toggles visibility until positions exist', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    expect(() => {
      renderer.update(
        [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
        createPositions([['zone:a', { x: 10, y: 20 }]]),
        createZones([
          ['zone:a'],
          ['zone:b'],
        ]),
      );
    }).not.toThrow();

    expect(parent.children).toHaveLength(0);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 30, y: 40 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.visible).toBe(true);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([['zone:a', { x: 10, y: 20 }]]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );
    expect(graphics.visible).toBe(false);
  });

  it('hides existing graphics when zone visuals are missing', () => {
    const parent = new MockContainer();
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null));

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.visible).toBe(true);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 110, y: 20 }],
      ]),
      createZones([
        ['zone:a'],
      ]),
    );

    expect(graphics.visible).toBe(false);
  });

  it('destroy retires all graphics through the shared disposal queue', () => {
    const parent = new MockContainer();
    const disposalQueue = createDisposalQueue({ scheduleFlush: () => {} });
    const { renderer } = createRenderer(parent, new VisualConfigProvider(null), disposalQueue);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' }), makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
      createZones([
        ['zone:a'],
        ['zone:b'],
        ['zone:c'],
        ['zone:d'],
      ]),
    );

    const first = parent.children[0] as InstanceType<typeof MockGraphics>;
    const second = parent.children[1] as InstanceType<typeof MockGraphics>;

    renderer.destroy();

    expect(first.isDestroyed).toBe(false);
    expect(second.isDestroyed).toBe(false);
    expect(parent.children).toHaveLength(0);
    disposalQueue.flush();
    expect(first.isDestroyed).toBe(true);
    expect(second.isDestroyed).toBe(true);
  });
});
