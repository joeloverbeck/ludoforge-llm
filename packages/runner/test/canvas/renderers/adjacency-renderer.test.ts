import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

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

    clearCalls = 0;

    isDestroyed = false;

    clear(): this {
      this.clearCalls += 1;
      this.drawnFrom = null;
      this.drawnTo = null;
      this.strokeStyle = undefined;
      return this;
    }

    moveTo(x: number, y: number): this {
      this.drawnFrom = { x, y };
      return this;
    }

    lineTo(x: number, y: number): this {
      this.drawnTo = { x, y };
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
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
import type { Position } from '../../../src/canvas/geometry';
import type { RenderAdjacency } from '../../../src/model/render-model';

function makeAdjacency(overrides: Partial<RenderAdjacency> = {}): RenderAdjacency {
  return {
    from: 'zone:a',
    to: 'zone:b',
    isHighlighted: false,
    ...overrides,
  };
}

function createPositions(entries: readonly [string, Position][]): ReadonlyMap<string, Position> {
  return new Map(entries);
}

describe('createAdjacencyRenderer', () => {
  it('update with empty array creates no graphics objects', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update([], new Map());

    expect(parent.children).toHaveLength(0);
  });

  it('creates one graphics object per unique adjacency pair and dedupes reversed pairs', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

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
    );

    expect(parent.children).toHaveLength(2);
  });

  it('removes and destroys graphics when a pair is removed on subsequent update', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' }), makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
    );

    const firstGraphics = parent.children[0] as InstanceType<typeof MockGraphics>;

    renderer.update(
      [makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
    );

    expect(firstGraphics.isDestroyed).toBe(true);
    expect(parent.children).toHaveLength(1);
  });

  it('adds graphics for newly added pairs on subsequent update', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
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
    );

    expect(parent.children).toHaveLength(2);
  });

  it('updates line endpoints in place when positions change', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 30, y: 40 }],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.drawnFrom).toEqual({ x: 10, y: 20 });
    expect(graphics.drawnTo).toEqual({ x: 30, y: 40 });
    expect(graphics.clearCalls).toBe(1);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 100, y: 200 }],
        ['zone:b', { x: 300, y: 400 }],
      ]),
    );

    expect(parent.children[0]).toBe(graphics);
    expect(graphics.drawnFrom).toEqual({ x: 100, y: 200 });
    expect(graphics.drawnTo).toEqual({ x: 300, y: 400 });
    expect(graphics.clearCalls).toBe(2);
  });

  it('uses highlighted style when adjacency is highlighted (including merged bidirectional pairs)', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update(
      [
        makeAdjacency({ from: 'zone:a', to: 'zone:b', isHighlighted: false }),
        makeAdjacency({ from: 'zone:b', to: 'zone:a', isHighlighted: true }),
      ],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 30, y: 40 }],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.strokeStyle).toEqual({ color: 0x93c5fd, width: 3, alpha: 0.7 });
  });

  it('skips missing positions without throwing and toggles visibility until positions exist', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    expect(() => {
      renderer.update([makeAdjacency({ from: 'zone:a', to: 'zone:b' })], createPositions([['zone:a', { x: 10, y: 20 }]]));
    }).not.toThrow();

    expect(parent.children).toHaveLength(0);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 30, y: 40 }],
      ]),
    );

    const graphics = parent.children[0] as InstanceType<typeof MockGraphics>;
    expect(graphics.visible).toBe(true);

    renderer.update([makeAdjacency({ from: 'zone:a', to: 'zone:b' })], createPositions([['zone:a', { x: 10, y: 20 }]]));
    expect(graphics.visible).toBe(false);
  });

  it('destroy removes and destroys all graphics', () => {
    const parent = new MockContainer();
    const renderer = createAdjacencyRenderer(parent as unknown as Container);

    renderer.update(
      [makeAdjacency({ from: 'zone:a', to: 'zone:b' }), makeAdjacency({ from: 'zone:c', to: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 1, y: 2 }],
        ['zone:b', { x: 3, y: 4 }],
        ['zone:c', { x: 5, y: 6 }],
        ['zone:d', { x: 7, y: 8 }],
      ]),
    );

    const first = parent.children[0] as InstanceType<typeof MockGraphics>;
    const second = parent.children[1] as InstanceType<typeof MockGraphics>;

    renderer.destroy();

    expect(first.isDestroyed).toBe(true);
    expect(second.isDestroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
  });
});
