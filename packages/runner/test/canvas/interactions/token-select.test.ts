import type { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { attachTokenSelectHandlers } from '../../../src/canvas/interactions/token-select';

interface MockPointerEvent {
  readonly global: { readonly x: number; readonly y: number };
  readonly stopPropagation: () => void;
}

class MockInteractiveContainer {
  eventMode: 'none' | 'static' = 'none';

  interactiveChildren = true;

  cursor = 'default';

  private readonly listeners = new Map<string, Set<(event: MockPointerEvent) => void>>();

  on(event: string, handler: (event: MockPointerEvent) => void): this {
    const handlers = this.listeners.get(event) ?? new Set<(event: MockPointerEvent) => void>();
    handlers.add(handler);
    this.listeners.set(event, handlers);
    return this;
  }

  off(event: string, handler: (event: MockPointerEvent) => void): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, payload: MockPointerEvent): void {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

function pointer(x: number, y: number, stopPropagation = vi.fn()): MockPointerEvent {
  return { global: { x, y }, stopPropagation };
}

describe('attachTokenSelectHandlers', () => {
  it('dispatches when pointerup happens without drag and token is selectable', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(10, 10));
    container.emit('pointerup', pointer(10, 10));

    expect(dispatcher).toHaveBeenCalledWith({ type: 'token', id: 'token:1' });
  });

  it('does not dispatch when movement exceeds drag threshold', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(0, 0));
    container.emit('pointermove', pointer(9, 0));
    container.emit('pointerup', pointer(9, 0));

    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('does not dispatch when token is not selectable at pointerup time', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();
    let selectable = true;

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => selectable,
      dispatcher,
    );

    container.emit('pointerdown', pointer(0, 0));
    selectable = false;
    container.emit('pointerup', pointer(0, 0));

    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('dispatches when movement is below drag threshold jitter', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(0, 0));
    container.emit('pointermove', pointer(3, 4));
    container.emit('pointerup', pointer(3, 4));

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  it('calls stopPropagation on pointerup', () => {
    const container = new MockInteractiveContainer();
    const stopPropagation = vi.fn();

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      vi.fn(),
    );

    container.emit('pointerdown', pointer(0, 0, stopPropagation));
    container.emit('pointerup', pointer(0, 0, stopPropagation));

    expect(stopPropagation).toHaveBeenCalled();
  });

  it('cleanup removes all listeners', () => {
    const container = new MockInteractiveContainer();
    const cleanup = attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      vi.fn(),
    );

    expect(container.listenerCount('pointerdown')).toBe(1);
    expect(container.listenerCount('pointermove')).toBe(1);
    expect(container.listenerCount('pointerup')).toBe(1);
    expect(container.listenerCount('pointerupoutside')).toBe(1);
    expect(container.listenerCount('pointerover')).toBe(1);
    expect(container.listenerCount('pointerout')).toBe(1);

    cleanup();

    expect(container.listenerCount('pointerdown')).toBe(0);
    expect(container.listenerCount('pointermove')).toBe(0);
    expect(container.listenerCount('pointerup')).toBe(0);
    expect(container.listenerCount('pointerupoutside')).toBe(0);
    expect(container.listenerCount('pointerover')).toBe(0);
    expect(container.listenerCount('pointerout')).toBe(0);
  });

  it('emits hover enter and leave callbacks', () => {
    const container = new MockInteractiveContainer();
    const onHoverChange = vi.fn();

    attachTokenSelectHandlers(
      container as unknown as Container,
      'token:1',
      () => true,
      vi.fn(),
      { onHoverChange },
    );

    container.emit('pointerover', pointer(0, 0));
    container.emit('pointerout', pointer(0, 0));

    expect(onHoverChange).toHaveBeenNthCalledWith(1, true);
    expect(onHoverChange).toHaveBeenNthCalledWith(2, false);
  });
});
