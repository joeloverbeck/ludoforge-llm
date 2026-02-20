import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

const { MockContainer, MockGraphics } = vi.hoisted(() => {
  class HoistedMockContainer {
    children: HoistedMockGraphics[] = [];

    parent: HoistedMockContainer | null = null;

    addChild(...children: HoistedMockGraphics[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockGraphics[] {
      const removed = this.children;
      this.children = [];
      for (const child of removed) {
        child.parent = null;
      }
      return removed;
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    shape: { kind: 'ellipse' | 'rectangle' | 'roundedRect'; args: number[] } | null = null;

    fillColor: number | null = null;

    strokeStyle: { color: number; width: number; alpha: number } | null = null;

    destroyed = false;

    ellipse(x: number, y: number, halfWidth: number, halfHeight: number): this {
      this.shape = { kind: 'ellipse', args: [x, y, halfWidth, halfHeight] };
      return this;
    }

    rect(x: number, y: number, width: number, height: number): this {
      this.shape = { kind: 'rectangle', args: [x, y, width, height] };
      return this;
    }

    roundRect(x: number, y: number, width: number, height: number, radius: number): this {
      this.shape = { kind: 'roundedRect', args: [x, y, width, height, radius] };
      return this;
    }

    fill(color: number): this {
      this.fillColor = color;
      return this;
    }

    stroke(style: { color: number; width: number; alpha: number }): this {
      this.strokeStyle = style;
      return this;
    }

    destroy(): void {
      this.destroyed = true;
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

import { drawTableBackground } from '../../../src/canvas/renderers/table-background-renderer';

describe('drawTableBackground', () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };

  it('draws ellipse by default with default padding and color', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, {}, bounds);

    const graphics = container.children[0];
    expect(container.children).toHaveLength(1);
    expect(graphics?.shape).toEqual({ kind: 'ellipse', args: [0, 0, 180, 110] });
    expect(graphics?.fillColor).toBe(0x0a5c2e);
    expect(graphics?.strokeStyle).toBeNull();
  });

  it('applies explicit padding values to computed geometry', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, { paddingX: 10, paddingY: 20 }, bounds);

    const graphics = container.children[0];
    expect(graphics?.shape).toEqual({ kind: 'ellipse', args: [0, 0, 110, 70] });
  });

  it('draws rectangle shape when requested', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, { shape: 'rectangle' }, bounds);

    const graphics = container.children[0];
    expect(graphics?.shape?.kind).toBe('rectangle');
  });

  it('draws rounded rectangle shape when requested', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, { shape: 'roundedRect' }, bounds);

    const graphics = container.children[0];
    expect(graphics?.shape?.kind).toBe('roundedRect');
  });

  it('applies border width and border color when configured', () => {
    const container = new MockContainer();

    drawTableBackground(
      container as unknown as Container,
      { borderColor: '#4a2c0a', borderWidth: 4 },
      bounds,
    );

    const graphics = container.children[0];
    expect(graphics?.strokeStyle).toEqual({ color: 0x4a2c0a, width: 4, alpha: 1 });
  });

  it('clears and destroys previous graphics before drawing new background', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, { shape: 'ellipse' }, bounds);
    const first = container.children[0];

    drawTableBackground(container as unknown as Container, { shape: 'rectangle' }, bounds);

    expect(first?.destroyed).toBe(true);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.shape?.kind).toBe('rectangle');
  });

  it('clears existing graphics when background config is null', () => {
    const container = new MockContainer();

    drawTableBackground(container as unknown as Container, { shape: 'ellipse' }, bounds);
    const first = container.children[0];

    drawTableBackground(container as unknown as Container, null, bounds);

    expect(first?.destroyed).toBe(true);
    expect(container.children).toHaveLength(0);
  });
});
