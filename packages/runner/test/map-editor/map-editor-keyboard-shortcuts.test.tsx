// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { useMapEditorKeyboardShortcuts } from '../../src/map-editor/use-map-editor-keyboard-shortcuts.js';
import type { ConnectionRouteDefinition, VisualConfig } from '../../src/map-editor/map-editor-types.js';

afterEach(() => {
  cleanup();
});

describe('useMapEditorKeyboardShortcuts', () => {
  it('handles undo and redo shortcuts with ctrl or meta modifiers', () => {
    const store = createStore();
    store.getState().moveZone('zone:a', { x: 10, y: 10 });
    render(createElement(ShortcutHarness, { store }));

    dispatchKey('z', { ctrlKey: true });
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });

    dispatchKey('z', { metaKey: true, shiftKey: true });
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 10, y: 10 });
  });

  it('clears selection on escape and toggles grid on g', () => {
    const store = createStore();
    store.getState().selectZone('zone:a');
    store.getState().selectRoute('route:road');
    render(createElement(ShortcutHarness, { store }));

    dispatchKey('Escape');
    expect(store.getState().selectedZoneId).toBeNull();
    expect(store.getState().selectedRouteId).toBeNull();

    dispatchKey('g');
    expect(store.getState().showGrid).toBe(true);
  });

  it('ignores keyboard shortcuts for editable targets', () => {
    const store = createStore();
    render(createElement(ShortcutHarness, { store }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    dispatchKey('g', { target: input });

    expect(store.getState().showGrid).toBe(false);
    input.remove();
  });

  it('removes keyboard handling on unmount', () => {
    const store = createStore();
    const rendered = render(createElement(ShortcutHarness, { store }));

    rendered.unmount();
    dispatchKey('g');

    expect(store.getState().showGrid).toBe(false);
  });
});

function ShortcutHarness({ store }: { readonly store: ReturnType<typeof createStore> }) {
  useMapEditorKeyboardShortcuts(store);
  return null;
}

function dispatchKey(
  key: string,
  options: Partial<Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> & {
    readonly target?: EventTarget | null;
  } = {},
): void {
  const init: KeyboardEventInit = {
    key,
    bubbles: true,
    cancelable: true,
  };
  if (options.ctrlKey !== undefined) {
    init.ctrlKey = options.ctrlKey;
  }
  if (options.metaKey !== undefined) {
    init.metaKey = options.metaKey;
  }
  if (options.shiftKey !== undefined) {
    init.shiftKey = options.shiftKey;
  }
  if (options.altKey !== undefined) {
    init.altKey = options.altKey;
  }
  const event = new KeyboardEvent('keydown', init);
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: options.target ?? document.body,
  });
  document.dispatchEvent(event);
}

function createStore() {
  return createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [{ id: 'zone:a', owner: 'none', visibility: 'public', ordering: 'stack' }],
    } as unknown as GameDef,
    {
      version: 1,
      zones: {
        connectionAnchors: {
          'waypoint-1': { x: 20, y: 20 },
        },
        connectionRoutes: {
          'route:road': {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'anchor', anchorId: 'waypoint-1' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [
              { kind: 'straight' },
              { kind: 'straight' },
            ],
          } satisfies ConnectionRouteDefinition,
        },
      },
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
      ['zone:b', { x: 40, y: 0 }],
    ]),
  );
}
