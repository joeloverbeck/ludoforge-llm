// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { MapEditorToolbar } from '../../src/map-editor/map-editor-toolbar.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

afterEach(() => {
  cleanup();
});

describe('MapEditorToolbar', () => {
  it('disables undo and redo buttons when there is no history', () => {
    const store = createStore();
    renderToolbar(store);

    expect((screen.getByTestId('map-editor-undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('map-editor-redo-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('invokes undo and redo actions from the toolbar', () => {
    const store = createStore();
    store.getState().moveZone('zone:a', { x: 10, y: 20 });

    renderToolbar(store);

    fireEvent.click(screen.getByTestId('map-editor-undo-button'));
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });

    fireEvent.click(screen.getByTestId('map-editor-redo-button'));
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 10, y: 20 });
  });

  it('reflects grid and snap state and updates grid size', () => {
    const store = createStore();
    renderToolbar(store);

    const gridButton = screen.getByTestId('map-editor-grid-button') as HTMLButtonElement;
    const snapButton = screen.getByTestId('map-editor-snap-button') as HTMLButtonElement;
    const gridInput = screen.getByTestId('map-editor-grid-size-input') as HTMLInputElement;

    expect(gridButton.getAttribute('aria-pressed')).toBe('false');
    expect(snapButton.getAttribute('aria-pressed')).toBe('false');
    expect(gridInput.disabled).toBe(true);

    fireEvent.click(gridButton);
    fireEvent.click(snapButton);
    fireEvent.change(screen.getByTestId('map-editor-grid-size-input'), { target: { value: '32' } });

    expect(store.getState().showGrid).toBe(true);
    expect(store.getState().snapToGrid).toBe(true);
    expect(store.getState().gridSize).toBe(32);
  });

  it('shows a dirty indicator and confirms before navigating back', () => {
    const store = createStore();
    store.getState().moveZone('zone:a', { x: 10, y: 20 });
    const onBack = vi.fn();
    const confirmDiscard = vi.fn(() => false);

    renderToolbar(store, { onBack, confirmDiscard });

    expect(screen.getByTestId('map-editor-dirty-indicator')).toBeTruthy();
    fireEvent.click(screen.getByTestId('map-editor-back-button'));

    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('calls back immediately when there are no unsaved changes', () => {
    const onBack = vi.fn();

    renderToolbar(createStore(), { onBack });
    fireEvent.click(screen.getByTestId('map-editor-back-button'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

function renderToolbar(
  store = createStore(),
  overrides: Partial<{
    onBack: () => void;
    onExport: () => void;
    confirmDiscard: (message: string) => boolean;
  }> = {},
) {
  const props = {
    title: 'Fire in the Lake',
    store,
    onBack: overrides.onBack ?? vi.fn(),
    onExport: overrides.onExport ?? vi.fn(),
  };

  return render(createElement(MapEditorToolbar, {
    ...props,
    ...(overrides.confirmDiscard === undefined ? {} : { confirmDiscard: overrides.confirmDiscard }),
  }));
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
        connectionRoutes: {},
      },
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
    ]),
  );
}
