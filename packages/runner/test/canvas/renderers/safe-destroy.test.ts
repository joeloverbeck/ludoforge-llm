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
import {
  getDestroyFallbackCount,
  resetDestroyFallbackCount,
  safeDestroyChildren,
  safeDestroyContainer,
  safeDestroyDisplayObject,
} from '../../../src/canvas/renderers/safe-destroy';

describe('safeDestroyContainer', () => {
  it('calls destroy() normally when no error occurs', () => {
    const container = new MockContainer() as unknown as Container;
    const destroySpy = vi.spyOn(container, 'destroy');

    safeDestroyContainer(container);

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('catches error from destroy() and does not re-throw', () => {
    const container = new MockContainer() as unknown as Container;
    vi.spyOn(container, 'destroy').mockImplementation(() => {
      throw new TypeError('TexturePoolClass.returnTexture failed');
    });

    expect(() => safeDestroyContainer(container)).not.toThrow();
  });

  it('calls removeFromParent() as fallback when destroy() throws', () => {
    const parent = new MockContainer();
    const container = new MockContainer();
    parent.addChild(container);

    vi.spyOn(container, 'destroy').mockImplementation(() => {
      throw new TypeError('TexturePoolClass.returnTexture failed');
    });
    const removeFromParentSpy = vi.spyOn(container, 'removeFromParent');

    safeDestroyContainer(container as unknown as Container);

    expect(removeFromParentSpy).toHaveBeenCalledTimes(1);
    expect(parent.children).not.toContain(container);
  });

  it('logs a warning when destroy() throws', () => {
    const container = new MockContainer() as unknown as Container;
    const error = new TypeError('TexturePoolClass.returnTexture failed');
    vi.spyOn(container, 'destroy').mockImplementation(() => {
      throw error;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    safeDestroyContainer(container);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('destroy() failed'),
      error,
    );

    warnSpy.mockRestore();
  });
});

describe('safeDestroyDisplayObject', () => {
  it('passes destroy options through to destroy()', () => {
    const container = new MockContainer();
    const destroySpy = vi.spyOn(container, 'destroy');

    safeDestroyDisplayObject(
      container,
      { children: true },
    );

    expect(destroySpy).toHaveBeenCalledWith({ children: true });
  });
});

describe('destroy fallback counter', () => {
  it('increments when destroy() throws and resets to zero', () => {
    resetDestroyFallbackCount();
    expect(getDestroyFallbackCount()).toBe(0);

    const container = new MockContainer() as unknown as Container;
    vi.spyOn(container, 'destroy').mockImplementation(() => {
      throw new TypeError('TexturePoolClass.returnTexture failed');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    safeDestroyContainer(container);
    expect(getDestroyFallbackCount()).toBe(1);

    safeDestroyContainer(container);
    expect(getDestroyFallbackCount()).toBe(2);

    resetDestroyFallbackCount();
    expect(getDestroyFallbackCount()).toBe(0);

    warnSpy.mockRestore();
  });

  it('does not increment when destroy() succeeds', () => {
    resetDestroyFallbackCount();

    const container = new MockContainer() as unknown as Container;
    safeDestroyContainer(container);

    expect(getDestroyFallbackCount()).toBe(0);
  });
});

describe('safeDestroyChildren', () => {
  it('continues destroying remaining children when one child destroy throws', () => {
    const parent = new MockContainer();
    const first = new MockContainer();
    const second = new MockContainer();
    parent.addChild(first, second);

    vi.spyOn(first, 'destroy').mockImplementation(() => {
      throw new TypeError('TexturePoolClass.returnTexture failed');
    });
    const secondDestroySpy = vi.spyOn(second, 'destroy');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => safeDestroyChildren(parent as unknown as Container)).not.toThrow();

    expect(secondDestroySpy).toHaveBeenCalledTimes(1);
    expect(parent.children).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
