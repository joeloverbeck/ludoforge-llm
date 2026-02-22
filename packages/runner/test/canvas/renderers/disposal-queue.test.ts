import { describe, expect, it, vi } from 'vitest';

const { MockContainer } = vi.hoisted(() => {
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
    scale = new MockPoint();
    pivot = new MockPoint();
    skew = new MockPoint();
    rotation = 0;
    alpha = 1;
    visible = true;
    renderable = true;
    zIndex = 0;
    eventMode: 'none' | 'static' = 'none';
    interactiveChildren = true;
    sortableChildren = false;
    destroyed = false;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockContainer[] {
      const removed = this.children;
      for (const child of this.children) {
        child.parent = null;
      }
      this.children = [];
      return removed;
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    }

    removeAllListeners(): void {}

    destroy(): void {
      this.destroyed = true;
      this.removeFromParent();
      this.removeChildren();
    }
  }

  return { MockContainer: HoistedMockContainer };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
}));

import type { Container } from 'pixi.js';
import { createDisposalQueue, type DisposalQueue } from '../../../src/canvas/renderers/disposal-queue';

function createQueueWithSyncFlush(): DisposalQueue {
  return createDisposalQueue({ scheduleFlush: (fn: () => void) => fn() });
}

describe('createDisposalQueue', () => {
  it('enqueue removes from parent and sets visible/renderable to false', () => {
    const queue = createQueueWithSyncFlush();
    const parent = new MockContainer();
    const container = new MockContainer();
    parent.addChild(container);

    queue.enqueue(container as unknown as Container);

    expect(parent.children).not.toContain(container);
    expect(container.visible).toBe(false);
    expect(container.renderable).toBe(false);
  });

  it('enqueue does NOT call destroy() immediately', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();
    const destroySpy = vi.spyOn(container, 'destroy');

    queue.enqueue(container as unknown as Container);

    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('enqueue keeps children attached until deferred flush', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();
    const child = new MockContainer();
    container.addChild(child);

    queue.enqueue(container as unknown as Container);

    expect(container.children).toHaveLength(1);
    expect(container.children[0]).toBe(child);
  });

  it('flush calls safeDestroyDisplayObject on enqueued items and clears the queue', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();

    queue.enqueue(container as unknown as Container);
    queue.flush();

    expect(container.destroyed).toBe(true);
  });

  it('flush destroys enqueued containers with children option enabled', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();
    const destroySpy = vi.spyOn(container, 'destroy');

    queue.enqueue(container as unknown as Container);
    queue.flush();

    expect(destroySpy).toHaveBeenCalledWith({ children: true });
  });

  it('flush is idempotent — second flush has no effect', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();
    const destroySpy = vi.spyOn(container, 'destroy');

    queue.enqueue(container as unknown as Container);
    queue.flush();
    queue.flush();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('double-enqueue of same object is idempotent (Set-based dedup)', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();
    const destroySpy = vi.spyOn(container, 'destroy');

    queue.enqueue(container as unknown as Container);
    queue.enqueue(container as unknown as Container);
    queue.flush();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('auto-flushes via scheduled callback', () => {
    let scheduledFn: (() => void) | null = null;
    const queue = createDisposalQueue({
      scheduleFlush: (fn: () => void) => { scheduledFn = fn; },
    });
    const container = new MockContainer();

    queue.enqueue(container as unknown as Container);

    // Not yet destroyed — flush hasn't fired
    expect(container.destroyed).toBe(false);
    expect(scheduledFn).not.toBeNull();

    // Fire the scheduled flush
    scheduledFn!();

    expect(container.destroyed).toBe(true);
  });

  it('coalesces multiple enqueues into a single scheduled flush', () => {
    let scheduleCount = 0;
    let scheduledFn: (() => void) | null = null;
    const queue = createDisposalQueue({
      scheduleFlush: (fn: () => void) => { scheduleCount += 1; scheduledFn = fn; },
    });
    const c1 = new MockContainer();
    const c2 = new MockContainer();

    queue.enqueue(c1 as unknown as Container);
    queue.enqueue(c2 as unknown as Container);

    // Should schedule only once
    expect(scheduleCount).toBe(1);

    // Fire flush — both destroyed
    scheduledFn!();
    expect(c1.destroyed).toBe(true);
    expect(c2.destroyed).toBe(true);
  });

  it('destroy() synchronously flushes remaining items', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();

    queue.enqueue(container as unknown as Container);
    queue.destroy();

    expect(container.destroyed).toBe(true);
  });

  it('enqueue after destroy() is a no-op', () => {
    const queue = createDisposalQueue({ scheduleFlush: () => {} });
    const container = new MockContainer();

    queue.destroy();
    queue.enqueue(container as unknown as Container);

    expect(container.destroyed).toBe(false);
  });
});
