// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';

import { VariablesPanel, buildGlobalVariableKey, buildPlayerVariableKey } from '../../src/ui/VariablesPanel.js';
import styles from '../../src/ui/VariablesPanel.module.css';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

afterEach(() => {
  cleanup();
});

describe('VariablesPanel', () => {
  it('renders global variables with display name and value', () => {
    const html = renderToStaticMarkup(
      createElement(VariablesPanel, {
        store: createStore(makeRenderModel({
          globalVars: [{ name: 'pot', displayName: 'Pot', value: 15000 }],
        })),
      }),
    );

    expect(html).toContain('data-testid="variables-global-section"');
    expect(html).toContain('Pot');
    expect(html).toContain('15000');
  });

  it('renders per-player variables grouped by player', () => {
    const playerVars = new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>();
    playerVars.set(asPlayerId(0), [{ name: 'chips', displayName: 'Chips', value: 500 }]);
    playerVars.set(asPlayerId(1), [{ name: 'chips', displayName: 'Chips', value: 450 }]);

    const html = renderToStaticMarkup(
      createElement(VariablesPanel, {
        store: createStore(makeRenderModel({ playerVars })),
      }),
    );

    expect(html).toContain('data-testid="variables-player-0"');
    expect(html).toContain('data-testid="variables-player-1"');
    expect(html).toContain('Chips');
  });

  it('returns null when both globalVars and playerVars are empty', () => {
    const html = renderToStaticMarkup(
      createElement(VariablesPanel, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toBe('');
  });

  it('collapse toggle hides and shows content', () => {
    const state = {
      renderModel: makeRenderModel({
        globalVars: [{ name: 'pot', displayName: 'Pot', value: 100 }],
      }),
    };

    const store = {
      getState: () => state,
    };

    render(createElement(VariablesPanel, { store }));

    expect(screen.getByTestId('variables-panel-content')).toBeDefined();

    fireEvent.click(screen.getByTestId('variables-panel-toggle'));
    expect(screen.queryByTestId('variables-panel-content')).toBeNull();

    fireEvent.click(screen.getByTestId('variables-panel-toggle'));
    expect(screen.getByTestId('variables-panel-content')).toBeDefined();
  });

  it('highlights rows when variable values change between renders', () => {
    const state = {
      renderModel: makeRenderModel({
        globalVars: [{ name: 'pot', displayName: 'Pot', value: 100 }],
      }),
    };

    const store = {
      getState: () => state,
    };

    const { rerender } = render(createElement(VariablesPanel, { store }));

    state.renderModel = makeRenderModel({
      globalVars: [{ name: 'pot', displayName: 'Pot', value: 110 }],
    });

    rerender(createElement(VariablesPanel, { store }));

    const row = screen.getByTestId(`variable-${buildGlobalVariableKey('pot')}`);
    expect(row.className).toContain(styles.rowChanged);
  });

  it('builds stable variable keys for global and per-player rows', () => {
    expect(buildGlobalVariableKey('pot')).toBe('global:pot');
    expect(buildPlayerVariableKey(asPlayerId(0), 'chips')).toBe('player:0:chips');
  });
});
