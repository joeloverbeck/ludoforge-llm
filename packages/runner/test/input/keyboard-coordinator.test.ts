import { describe, expect, it, vi } from 'vitest';

import { createKeyboardCoordinator } from '../../src/input/keyboard-coordinator.js';

interface MockKeyboardEvent {
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
}

class MockKeydownTarget {
  private readonly listeners = new Set<(event: MockKeyboardEvent) => void>();

  addEventListener(type: 'keydown', listener: (event: MockKeyboardEvent) => void): void {
    if (type !== 'keydown') {
      return;
    }
    this.listeners.add(listener);
  }

  removeEventListener(type: 'keydown', listener: (event: MockKeyboardEvent) => void): void {
    if (type !== 'keydown') {
      return;
    }
    this.listeners.delete(listener);
  }

  emit(key: string, defaultPrevented = false): MockKeyboardEvent {
    let prevented = defaultPrevented;
    const event: MockKeyboardEvent = {
      key,
      target: null,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

describe('createKeyboardCoordinator', () => {
  it('invokes handlers by priority and prevents default when handled', () => {
    const target = new MockKeydownTarget();
    const coordinator = createKeyboardCoordinator(target);
    const lowPriority = vi.fn(() => true);
    const highPriority = vi.fn(() => true);

    coordinator.register(lowPriority, { priority: 10 });
    coordinator.register(highPriority, { priority: 20 });

    const event = target.emit('Enter');

    expect(highPriority).toHaveBeenCalledTimes(1);
    expect(lowPriority).toHaveBeenCalledTimes(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('skips processing when event is already defaultPrevented', () => {
    const target = new MockKeydownTarget();
    const coordinator = createKeyboardCoordinator(target);
    const handler = vi.fn(() => true);
    coordinator.register(handler, { priority: 10 });

    const event = target.emit('Enter', true);
    expect(handler).toHaveBeenCalledTimes(0);
    expect(event.defaultPrevented).toBe(true);
  });

  it('unregisters handlers and removes listener on destroy', () => {
    const target = new MockKeydownTarget();
    const coordinator = createKeyboardCoordinator(target);
    const handler = vi.fn(() => true);
    const cleanup = coordinator.register(handler, { priority: 10 });

    expect(target.listenerCount()).toBe(1);

    cleanup();
    target.emit('z');
    expect(handler).toHaveBeenCalledTimes(0);

    coordinator.destroy();
    expect(target.listenerCount()).toBe(0);
  });
});
