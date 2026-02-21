import { describe, expect, it, vi } from 'vitest';

const { MockContainer, MockGraphics, MockText } = vi.hoisted(() => {
  class MockPoint {
    x = 0;
    y = 0;
    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];
    parent: HoistedMockContainer | null = null;
    position = new MockPoint();
    rotation = 0;
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;
    destroyed = false;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockContainer[] {
      const removed = this.children;
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
    }

    removeFromParent(): void {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
      }
    }

    destroy(): void {
      this.destroyed = true;
      this.removeFromParent();
      this.removeChildren();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    clear(): this {
      return this;
    }

    roundRect(): this {
      return this;
    }

    fill(_style: unknown): this {
      return this;
    }

    stroke(_style: unknown): this {
      return this;
    }

    circle(): this {
      return this;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;
    style: unknown;

    constructor(options: { text: string; style?: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
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
  createHiddenZoneStackVisual,
  updateHiddenZoneStackVisual,
} from '../../../src/canvas/renderers/hidden-zone-stack';

describe('hidden-zone-stack memoization', () => {
  it('does not rebuild card children when called twice with identical inputs', () => {
    const visual = createHiddenZoneStackVisual();

    updateHiddenZoneStackVisual(visual, 3, 160, 100);

    const cardsContainer = (visual as unknown as { cards: InstanceType<typeof MockContainer> }).cards;
    const firstChildren = [...cardsContainer.children];
    expect(firstChildren.length).toBeGreaterThan(0);

    updateHiddenZoneStackVisual(visual, 3, 160, 100);

    expect(cardsContainer.children).toHaveLength(firstChildren.length);
    for (let i = 0; i < firstChildren.length; i += 1) {
      expect(cardsContainer.children[i]).toBe(firstChildren[i]);
    }
  });

  it('rebuilds card children when hidden token count changes', () => {
    const visual = createHiddenZoneStackVisual();

    updateHiddenZoneStackVisual(visual, 2, 160, 100);

    const cardsContainer = (visual as unknown as { cards: InstanceType<typeof MockContainer> }).cards;
    const firstChildren = [...cardsContainer.children];

    updateHiddenZoneStackVisual(visual, 4, 160, 100);

    const secondChildren = cardsContainer.children;
    expect(secondChildren.length).not.toBe(firstChildren.length);
  });

  it('rebuilds card children when zone dimensions change', () => {
    const visual = createHiddenZoneStackVisual();

    updateHiddenZoneStackVisual(visual, 3, 160, 100);

    const cardsContainer = (visual as unknown as { cards: InstanceType<typeof MockContainer> }).cards;
    const firstChildren = [...cardsContainer.children];

    updateHiddenZoneStackVisual(visual, 3, 300, 200);

    expect(cardsContainer.children[0]).not.toBe(firstChildren[0]);
  });

  it('resets signature when count drops to zero and rebuilds on next non-zero call', () => {
    const visual = createHiddenZoneStackVisual();

    updateHiddenZoneStackVisual(visual, 3, 160, 100);

    const cardsContainer = (visual as unknown as { cards: InstanceType<typeof MockContainer> }).cards;
    expect(cardsContainer.children.length).toBeGreaterThan(0);

    updateHiddenZoneStackVisual(visual, 0, 160, 100);
    expect(cardsContainer.children).toHaveLength(0);

    updateHiddenZoneStackVisual(visual, 3, 160, 100);
    expect(cardsContainer.children.length).toBeGreaterThan(0);
  });
});
