import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActiveEffectsPanel, formatEffectSide } from '../../src/ui/ActiveEffectsPanel.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

describe('ActiveEffectsPanel', () => {
  it('renders each lasting effect entry', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveEffectsPanel, {
        store: createStore(makeRenderModel({
          activeEffects: [
            {
              id: 'effect-a',
              sourceCardId: 'card-a',
              side: 'unshaded',
              duration: 'turn',
              displayName: 'Card A',
            },
            {
              id: 'effect-b',
              sourceCardId: 'card-b',
              side: 'shaded',
              duration: 'round',
              displayName: 'Card B',
            },
          ],
        })),
      }),
    );

    expect(html).toContain('data-testid="active-effect-effect-a"');
    expect(html).toContain('data-testid="active-effect-effect-b"');
  });

  it('shows displayName, sourceCardId, side, and duration', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveEffectsPanel, {
        store: createStore(makeRenderModel({
          activeEffects: [
            {
              id: 'effect-a',
              sourceCardId: 'card-a',
              side: 'shaded',
              duration: 'turn',
              displayName: 'Card A',
            },
          ],
        })),
      }),
    );

    expect(html).toContain('Card A');
    expect(html).toContain('card-a');
    expect(html).toContain('Shaded');
    expect(html).toContain('turn');
  });

  it('returns null when activeEffects is empty', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveEffectsPanel, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toBe('');
  });

  it('formats side labels for UI display', () => {
    expect(formatEffectSide('shaded')).toBe('Shaded');
    expect(formatEffectSide('unshaded')).toBe('Unshaded');
  });
});
