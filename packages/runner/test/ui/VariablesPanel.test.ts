// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';

import { VisualConfigContext } from '../../src/config/visual-config-context.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
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

function withVisualConfig(
  node: ReturnType<typeof createElement>,
  provider: VisualConfigProvider | null,
): ReturnType<typeof createElement> {
  return createElement(VisualConfigContext.Provider, { value: provider }, node);
}

describe('VariablesPanel', () => {
  it('renders global variables with display name and value without config', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'pot', displayName: 'Pot', value: 15000 }],
          })),
        }),
        null,
      ),
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

  it('renders prominent variables in a separate highlighted section', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'aid', displayName: 'Aid', value: 7 }],
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            prominent: ['aid'],
          },
        }),
      ),
    );

    expect(html).toContain('data-testid="variables-prominent-section"');
    expect(html).toContain(`data-testid="prominent-variable-${buildGlobalVariableKey('aid')}"`);
    expect(html).toContain(styles.prominent);
    expect(html).toContain(`data-testid="variable-${buildGlobalVariableKey('aid')}"`);
  });

  it('replaces default layout with configured panel groups', () => {
    const playerVars = new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>();
    playerVars.set(asPlayerId(0), [{ name: 'aid', displayName: 'Aid', value: 2 }]);
    playerVars.set(asPlayerId(1), [{ name: 'support', displayName: 'Support', value: 1 }]);

    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'aid', displayName: 'Aid', value: 3 }],
            playerVars,
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            panels: [{ name: 'Resources', vars: ['aid'] }, { name: 'Support', vars: ['support'] }],
          },
        }),
      ),
    );

    expect(html).toContain('data-testid="variables-panel-group-resources"');
    expect(html).toContain('data-testid="variables-panel-group-support"');
    expect(html).not.toContain('data-testid="variables-global-section"');
    expect(html).not.toContain('data-testid="variables-player-section"');
  });

  it('puts ungrouped variables into the Other section when panels are configured', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [
              { name: 'aid', displayName: 'Aid', value: 2 },
              { name: 'patronage', displayName: 'Patronage', value: 4 },
            ],
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            panels: [{ name: 'Resources', vars: ['aid'] }],
          },
        }),
      ),
    );

    expect(html).toContain('data-testid="variables-panel-group-other"');
    expect(html).toContain('Patronage');
  });

  it('formats percentage values when configured', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'aid', displayName: 'Aid', value: 75 }],
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            formatting: {
              aid: { type: 'percentage' },
            },
          },
        }),
      ),
    );

    expect(html).toContain('75%');
  });

  it('formats enum values with labels when configured', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'support', displayName: 'Support', value: 1 }],
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            formatting: {
              support: {
                type: 'enum',
                labels: ['None', 'Passive', 'Active'],
              },
            },
          },
        }),
      ),
    );

    expect(html).toContain('Passive');
  });

  it('formats values with suffix when configured', () => {
    const html = renderToStaticMarkup(
      withVisualConfig(
        createElement(VariablesPanel, {
          store: createStore(makeRenderModel({
            globalVars: [{ name: 'score', displayName: 'Score', value: 42 }],
          })),
        }),
        new VisualConfigProvider({
          version: 1,
          variables: {
            formatting: {
              score: { type: 'raw', suffix: ' pts' },
            },
          },
        }),
      ),
    );

    expect(html).toContain('42 pts');
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
    } as ReturnType<typeof createStore>;

    render(createElement(VariablesPanel, { store }));

    expect(screen.getByTestId('variables-panel-content')).toBeDefined();

    fireEvent.click(screen.getByTestId('variables-panel-toggle'));
    expect(screen.queryByTestId('variables-panel-content')).toBeNull();

    fireEvent.click(screen.getByTestId('variables-panel-toggle'));
    expect(screen.getByTestId('variables-panel-content')).toBeDefined();
  });

  it('highlights rows when variable values change between renders with config', () => {
    const state = {
      renderModel: makeRenderModel({
        globalVars: [{ name: 'pot', displayName: 'Pot', value: 100 }],
      }),
    };

    const store = {
      getState: () => state,
    } as ReturnType<typeof createStore>;

    const provider = new VisualConfigProvider({
      version: 1,
      variables: {
        panels: [{ name: 'Resources', vars: ['pot'] }],
        formatting: {
          pot: { type: 'percentage' },
        },
      },
    });

    const { rerender } = render(withVisualConfig(createElement(VariablesPanel, { store }), provider));

    state.renderModel = makeRenderModel({
      globalVars: [{ name: 'pot', displayName: 'Pot', value: 110 }],
    });

    rerender(withVisualConfig(createElement(VariablesPanel, { store }), provider));

    const row = screen.getByTestId(`variable-${buildGlobalVariableKey('pot')}`);
    expect(row.className).toContain(styles.rowChanged);
  });

  it('builds stable variable keys for global and per-player rows', () => {
    expect(buildGlobalVariableKey('pot')).toBe('global:pot');
    expect(buildPlayerVariableKey(asPlayerId(0), 'chips')).toBe('player:0:chips');
  });
});
