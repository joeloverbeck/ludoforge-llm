import type { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { attachZoneSelectHandlers } from '../../../src/canvas/interactions/zone-select';

interface MockPointerEvent {
  readonly global: { readonly x: number; readonly y: number };
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

function pointer(x: number, y: number): MockPointerEvent {
  return { global: { x, y } };
}

describe('attachZoneSelectHandlers', () => {
  it('dispatches when pointerup happens without drag and zone is selectable', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();

    attachZoneSelectHandlers(
      container as unknown as Container,
      'zone:a',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(10, 10));
    container.emit('pointerup', pointer(10, 10));

    expect(dispatcher).toHaveBeenCalledWith({ type: 'zone', id: 'zone:a' });
  });

  it('does not dispatch when movement exceeds drag threshold', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();

    attachZoneSelectHandlers(
      container as unknown as Container,
      'zone:a',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(0, 0));
    container.emit('pointermove', pointer(10, 0));
    container.emit('pointerup', pointer(10, 0));

    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('does not dispatch when zone is not selectable at pointerup time', () => {
    const container = new MockInteractiveContainer();
    const dispatcher = vi.fn();
    let selectable = true;

    attachZoneSelectHandlers(
      container as unknown as Container,
      'zone:a',
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

    attachZoneSelectHandlers(
      container as unknown as Container,
      'zone:a',
      () => true,
      dispatcher,
    );

    container.emit('pointerdown', pointer(0, 0));
    container.emit('pointermove', pointer(3, 4));
    container.emit('pointerup', pointer(3, 4));

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  it('cleanup removes all listeners', () => {
    const container = new MockInteractiveContainer();
    const cleanup = attachZoneSelectHandlers(
      container as unknown as Container,
      'zone:a',
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
});
