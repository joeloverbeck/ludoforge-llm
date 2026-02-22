import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

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

  class HoistedMockText {
    text: string;
    style: Record<string, unknown>;
    position = new MockPoint();
    anchor = new MockAnchor();
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;
    visible = true;
    renderable = true;
    parent: HoistedMockContainer | null = null;
    destroy = vi.fn();
    removeFromParent = vi.fn();

    constructor(options: { text: string; style: Record<string, unknown> }) {
      this.text = options.text;
      this.style = options.style;
    }
  }

  class HoistedMockContainer {
    children: HoistedMockText[] = [];
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;

    addChild(...children: HoistedMockText[]): void {
      for (const child of children) {
        child.parent = this;
      }
      this.children.push(...children);
    }

    removeChildren(): HoistedMockText[] {
      const removed = this.children;
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
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

import { createTextSlotPool } from '../../../src/canvas/renderers/text-slot-pool';

describe('createTextSlotPool', () => {
  it('acquire creates a new Text and adds it to the parent', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    const slot = pool.acquire(0);

    expect(slot).toBeDefined();
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(pool.allocatedCount).toBe(1);
  });

  it('acquire at the same index reuses the same Text instance', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    const first = pool.acquire(0);
    const second = pool.acquire(0);

    expect(second).toBe(first);
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(1);
    expect(pool.allocatedCount).toBe(1);
  });

  it('acquire at different indices creates separate Text instances', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    const slot0 = pool.acquire(0);
    const slot1 = pool.acquire(1);

    expect(slot0).not.toBe(slot1);
    expect((parent as unknown as InstanceType<typeof MockContainer>).children).toHaveLength(2);
    expect(pool.allocatedCount).toBe(2);
  });

  it('hideFrom hides slots at and beyond the given index', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    pool.acquire(0);
    pool.acquire(1);
    pool.acquire(2);
    pool.hideFrom(1);

    const children = (parent as unknown as InstanceType<typeof MockContainer>).children;
    expect((children[0] as unknown as { visible: boolean }).visible).toBe(true);
    expect((children[1] as unknown as { visible: boolean }).visible).toBe(false);
    expect((children[1] as unknown as { renderable: boolean }).renderable).toBe(false);
    expect((children[2] as unknown as { visible: boolean }).visible).toBe(false);
    expect((children[2] as unknown as { renderable: boolean }).renderable).toBe(false);
  });

  it('hideFrom(0) hides all slots', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    pool.acquire(0);
    pool.acquire(1);
    pool.hideFrom(0);

    const children = (parent as unknown as InstanceType<typeof MockContainer>).children;
    expect((children[0] as unknown as { visible: boolean }).visible).toBe(false);
    expect((children[1] as unknown as { visible: boolean }).visible).toBe(false);
  });

  it('acquire after hideFrom re-shows the slot', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    pool.acquire(0);
    pool.acquire(1);
    pool.hideFrom(0);

    const reacquired = pool.acquire(0);

    expect((reacquired as unknown as { visible: boolean }).visible).toBe(true);
    expect((reacquired as unknown as { renderable: boolean }).renderable).toBe(true);
  });

  it('acquire re-adds slot to parent if removed', () => {
    const parent = new MockContainer();
    const pool = createTextSlotPool(parent as unknown as Container);

    const slot = pool.acquire(0) as unknown as InstanceType<typeof MockText>;
    slot.parent = null;

    const reacquired = pool.acquire(0) as unknown as InstanceType<typeof MockText>;

    expect(reacquired).toBe(slot);
    expect(reacquired.parent).toBe(parent);
  });

  it('allocatedCount tracks total allocated slots, not just visible', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    pool.acquire(0);
    pool.acquire(1);
    pool.acquire(2);
    pool.hideFrom(1);

    expect(pool.allocatedCount).toBe(3);
  });

  it('destroyAll destroys each slot', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    const slot0 = pool.acquire(0) as unknown as InstanceType<typeof MockText>;
    const slot1 = pool.acquire(1) as unknown as InstanceType<typeof MockText>;

    pool.destroyAll();

    expect(slot0.destroy).toHaveBeenCalledTimes(1);
    expect(slot1.destroy).toHaveBeenCalledTimes(1);
    expect(pool.allocatedCount).toBe(0);
  });

  it('new Text instances have eventMode none and interactiveChildren false', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    const slot = pool.acquire(0) as unknown as InstanceType<typeof MockText>;

    expect(slot.eventMode).toBe('none');
    expect(slot.interactiveChildren).toBe(false);
  });

  it('hideFrom beyond allocated count is a no-op', () => {
    const parent = new MockContainer() as unknown as Container;
    const pool = createTextSlotPool(parent);

    pool.acquire(0);

    expect(() => pool.hideFrom(5)).not.toThrow();
    const children = (parent as unknown as InstanceType<typeof MockContainer>).children;
    expect((children[0] as unknown as { visible: boolean }).visible).toBe(true);
  });
});
