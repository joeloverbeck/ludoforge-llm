import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { ContainerPool } from '../../../src/canvas/renderers/container-pool';

describe('ContainerPool', () => {
  it('acquire returns a Container instance', () => {
    const pool = new ContainerPool();

    const container = pool.acquire();

    expect(container).toBeInstanceOf(Container);
  });

  it('reuses released containers', () => {
    const pool = new ContainerPool();

    const first = pool.acquire();
    pool.release(first);

    const second = pool.acquire();

    expect(second).toBe(first);
  });

  it('resets container state on release', () => {
    const pool = new ContainerPool();
    const parent = new Container();
    const child = new Container();

    const container = pool.acquire();
    parent.addChild(container);
    container.addChild(child);

    container.position.set(10, 20);
    container.scale.set(2, 3);
    container.pivot.set(4, 5);
    container.skew.set(6, 7);
    container.rotation = 1.5;
    container.alpha = 0.25;
    container.visible = false;
    container.renderable = false;
    container.zIndex = 42;
    container.eventMode = 'static';
    container.interactiveChildren = false;

    pool.release(container);

    expect(container.parent).toBeNull();
    expect(container.children).toHaveLength(0);
    expect(container.position.x).toBe(0);
    expect(container.position.y).toBe(0);
    expect(container.scale.x).toBe(1);
    expect(container.scale.y).toBe(1);
    expect(container.pivot.x).toBe(0);
    expect(container.pivot.y).toBe(0);
    expect(container.skew.x).toBe(0);
    expect(container.skew.y).toBe(0);
    expect(container.rotation).toBe(0);
    expect(container.alpha).toBe(1);
    expect(container.visible).toBe(true);
    expect(container.renderable).toBe(true);
    expect(container.zIndex).toBe(0);
    expect(container.eventMode).toBe('none');
    expect(container.interactiveChildren).toBe(true);
  });

  it('destroys every currently pooled container on destroyAll', () => {
    const pool = new ContainerPool();

    const first = pool.acquire();
    const second = pool.acquire();
    const firstDestroySpy = vi.spyOn(first, 'destroy');
    const secondDestroySpy = vi.spyOn(second, 'destroy');

    pool.release(first);
    pool.release(second);
    pool.destroyAll();

    expect(firstDestroySpy).toHaveBeenCalledTimes(1);
    expect(secondDestroySpy).toHaveBeenCalledTimes(1);

    firstDestroySpy.mockRestore();
    secondDestroySpy.mockRestore();
  });

  it('handles repeated acquire/release cycles and ignores duplicate release', () => {
    const pool = new ContainerPool();

    const container = pool.acquire();
    pool.release(container);
    pool.release(container);

    const first = pool.acquire();
    const second = pool.acquire();

    expect(first).toBe(container);
    expect(second).toBeInstanceOf(Container);
    expect(second).not.toBe(container);
  });

  it('supports policy-based container creation and reset', () => {
    const created = new Container();
    const resetSpy = vi.fn();
    const pool = new ContainerPool({
      createContainer: () => created,
      resetContainer: (container) => {
        resetSpy(container);
      },
    });

    const acquired = pool.acquire();
    pool.release(acquired);
    const reused = pool.acquire();

    expect(acquired).toBe(created);
    expect(reused).toBe(created);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledWith(created);
  });

  it('supports policy-based destroy behavior', () => {
    const created = new Container();
    const destroySpy = vi.fn();
    const pool = new ContainerPool({
      createContainer: () => created,
      destroyContainer: (container) => {
        destroySpy(container);
      },
    });

    const acquired = pool.acquire();
    pool.release(acquired);
    pool.destroyAll();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledWith(created);
  });
});
