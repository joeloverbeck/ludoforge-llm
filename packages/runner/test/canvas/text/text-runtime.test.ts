import { describe, expect, it, vi } from 'vitest';
import type { Container, Text } from 'pixi.js';

const { MockContainer, MockText } = vi.hoisted(() => {
  class MockPoint {
    x = 0;
    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockAnchor {
    x = 0;
    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class HoistedMockContainer {
    children: HoistedMockText[] = [];
    parent: HoistedMockContainer | null = null;
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;

    addChild(...children: HoistedMockText[]): void {
      for (const child of children) {
        child.removeFromParent();
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockText[] {
      const removed = this.children;
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child !== this as unknown as HoistedMockText);
      this.parent = null;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;
    style: Record<string, unknown> | undefined;
    position = new MockPoint();
    anchor = new MockAnchor();
    visible = true;
    renderable = true;
    destroy = vi.fn(() => {
      this.removeFromParent();
    });

    constructor(options: { text: string; style?: Record<string, unknown> }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Text: MockText,
}));

import {
  createManagedText,
  createTextSlotPool,
  destroyManagedText,
} from '../../../src/canvas/text/text-runtime';

describe('createManagedText', () => {
  it('creates non-interactive text nodes with optional parent, anchor, and position', () => {
    const parent = new MockContainer() as unknown as Container;

    const text = createManagedText({
      parent,
      text: 'Hello',
      style: { fill: '#fff', fontSize: 12 },
      anchor: { x: 0.5, y: 1 },
      position: { x: 10, y: 20 },
    }) as unknown as InstanceType<typeof MockText>;

    expect(text.text).toBe('Hello');
    expect(text.parent).toBe(parent);
    expect(text.anchor.x).toBe(0.5);
    expect(text.anchor.y).toBe(1);
    expect(text.position.x).toBe(10);
    expect(text.position.y).toBe(20);
    expect(text.eventMode).toBe('none');
    expect(text.interactiveChildren).toBe(false);
  });
});

describe('destroyManagedText', () => {
  it('removes text from its parent before destroying it', () => {
    const parent = new MockContainer() as unknown as Container;
    const text = createManagedText({ parent, text: 'Hello' }) as unknown as InstanceType<typeof MockText>;

    destroyManagedText(text as unknown as Text);

    expect(text.parent).toBeNull();
    expect(text.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('createTextSlotPool', () => {
  function createPool(parent: Container) {
    return createTextSlotPool({
      parentContainer: parent,
      createText: () => createManagedText({
        style: { fill: '#f8fafc', fontSize: 12, fontFamily: 'monospace' },
      }),
    });
  }

  it('acquire creates a new Text and adds it to the parent', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createPool(parent);

    const slot = pool.acquire(0);

    expect(slot).toBeDefined();
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(pool.allocatedCount).toBe(1);
  });

  it('acquire at the same index reuses the same Text instance', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createPool(parent);

    const first = pool.acquire(0);
    const second = pool.acquire(0);

    expect(second).toBe(first);
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(pool.allocatedCount).toBe(1);
  });

  it('hideFrom hides slots at and beyond the given index', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createPool(parent);

    pool.acquire(0);
    pool.acquire(1);
    pool.acquire(2);
    pool.hideFrom(1);

    const children = (parent as unknown as InstanceType<typeof MockContainer>).children;
    expect(children[0]?.visible).toBe(true);
    expect(children[1]?.visible).toBe(false);
    expect(children[1]?.renderable).toBe(false);
    expect(children[2]?.visible).toBe(false);
    expect(children[2]?.renderable).toBe(false);
  });

  it('acquire re-adds a previously detached slot to the parent', () => {
    const parent = new MockContainer();
    const pool = createPool(parent as unknown as Container);

    const slot = pool.acquire(0) as unknown as InstanceType<typeof MockText>;
    slot.removeFromParent();

    const reacquired = pool.acquire(0) as unknown as InstanceType<typeof MockText>;

    expect(reacquired).toBe(slot);
    expect(reacquired.parent).toBe(parent);
  });

  it('destroyAll removes and destroys every slot', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createPool(parent);

    const slot0 = pool.acquire(0) as unknown as InstanceType<typeof MockText>;
    const slot1 = pool.acquire(1) as unknown as InstanceType<typeof MockText>;

    pool.destroyAll();

    expect(slot0.destroy).toHaveBeenCalledTimes(1);
    expect(slot1.destroy).toHaveBeenCalledTimes(1);
    expect(slot0.parent).toBeNull();
    expect(slot1.parent).toBeNull();
    expect(pool.allocatedCount).toBe(0);
  });
});
