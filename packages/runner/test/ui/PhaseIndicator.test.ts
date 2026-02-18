import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { PhaseIndicator } from '../../src/ui/PhaseIndicator.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

describe('PhaseIndicator', () => {
  it('renders the phase display name', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ phaseDisplayName: 'Action Round' })),
      }),
    );

    expect(html).toContain('Action Round');
  });

  it('falls back to phaseName when phaseDisplayName is empty', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ phaseName: 'combat', phaseDisplayName: '   ' })),
      }),
    );

    expect(html).toContain('combat');
  });

  it('shows active player display name', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({
          activePlayerID: asPlayerId(1),
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Human',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: 'ussr',
            },
            {
              id: asPlayerId(1),
              displayName: 'AI',
              isHuman: false,
              isActive: false,
              isEliminated: false,
              factionId: null,
            },
          ],
        })),
      }),
    );

    expect(html).toContain('AI');
  });

  it('applies CSS-variable-based faction color binding with fallback', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({
          activePlayerID: asPlayerId(0),
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Human',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: 'ussr',
            },
          ],
        })),
      }),
    );

    expect(html).toContain('var(--faction-ussr, var(--faction-0))');
  });

  it('does not render when renderModel is null', () => {
    const tree = PhaseIndicator({
      store: createStore(null),
    });

    expect(tree).toBeNull();
  });
});
