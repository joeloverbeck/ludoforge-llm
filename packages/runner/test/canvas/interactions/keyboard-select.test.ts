import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachKeyboardSelect } from '../../../src/canvas/interactions/keyboard-select';

interface MockKeyboardEvent {
  readonly key: string;
  readonly preventDefault: () => void;
}

class MockDocumentTarget {
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

  emitKey(key: string): MockKeyboardEvent {
    const event: MockKeyboardEvent = { key, preventDefault: vi.fn() };
    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

function installMockDocument(mockDocument: MockDocumentTarget): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: mockDocument,
  });

  return (): void => {
    if (descriptor === undefined) {
      delete (globalThis as { document?: unknown }).document;
      return;
    }

    Object.defineProperty(globalThis, 'document', descriptor);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attachKeyboardSelect', () => {
  it('cycles focus and confirms selection with arrows + enter/space', () => {
    const mockDocument = new MockDocumentTarget();
    const restoreDocument = installMockDocument(mockDocument);
    const onSelect = vi.fn();
    const onFocusChange = vi.fn();

    let focused: string | null = null;

    const cleanup = attachKeyboardSelect({
      getSelectableZoneIDs: () => ['a', 'b', 'c'],
      getCurrentFocusedZoneID: () => focused,
      onSelect,
      onFocusChange: (zoneID) => {
        focused = zoneID;
        onFocusChange(zoneID);
      },
    });

    mockDocument.emitKey('ArrowDown');
    expect(focused).toBe('a');

    mockDocument.emitKey('ArrowDown');
    expect(focused).toBe('b');

    mockDocument.emitKey('ArrowUp');
    expect(focused).toBe('a');

    mockDocument.emitKey('ArrowUp');
    expect(focused).toBe('c');

    mockDocument.emitKey('ArrowDown');
    expect(focused).toBe('a');

    mockDocument.emitKey('Enter');
    mockDocument.emitKey(' ');

    expect(onSelect).toHaveBeenNthCalledWith(1, 'a');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'a');

    mockDocument.emitKey('Escape');
    expect(onFocusChange).toHaveBeenLastCalledWith(null);

    cleanup();
    restoreDocument();
  });

  it('is a no-op for all key presses when there are no selectable zones', () => {
    const mockDocument = new MockDocumentTarget();
    const restoreDocument = installMockDocument(mockDocument);
    const onSelect = vi.fn();
    const onFocusChange = vi.fn();

    const cleanup = attachKeyboardSelect({
      getSelectableZoneIDs: () => [],
      getCurrentFocusedZoneID: () => null,
      onSelect,
      onFocusChange,
    });

    mockDocument.emitKey('ArrowDown');
    mockDocument.emitKey('ArrowUp');
    mockDocument.emitKey('Enter');
    mockDocument.emitKey(' ');
    mockDocument.emitKey('Escape');

    expect(onSelect).not.toHaveBeenCalled();
    expect(onFocusChange).not.toHaveBeenCalled();

    cleanup();
    restoreDocument();
  });

  it('ignores non-navigation keys and repairs stale focus on next navigation', () => {
    const mockDocument = new MockDocumentTarget();
    const restoreDocument = installMockDocument(mockDocument);

    let focused: string | null = 'z';

    const cleanup = attachKeyboardSelect({
      getSelectableZoneIDs: () => ['a', 'b', 'c'],
      getCurrentFocusedZoneID: () => focused,
      onSelect: vi.fn(),
      onFocusChange: (zoneID) => {
        focused = zoneID;
      },
    });

    mockDocument.emitKey('Tab');
    expect(focused).toBe('z');

    mockDocument.emitKey('ArrowDown');
    expect(focused).toBe('a');

    cleanup();
    restoreDocument();
  });

  it('cleanup removes the document keydown listener', () => {
    const mockDocument = new MockDocumentTarget();
    const restoreDocument = installMockDocument(mockDocument);

    const cleanup = attachKeyboardSelect({
      getSelectableZoneIDs: () => ['a'],
      getCurrentFocusedZoneID: () => null,
      onSelect: vi.fn(),
      onFocusChange: vi.fn(),
    });

    expect(mockDocument.listenerCount()).toBe(1);

    cleanup();

    expect(mockDocument.listenerCount()).toBe(0);
    restoreDocument();
  });
});
