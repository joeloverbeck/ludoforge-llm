import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActiveEffectsPanel } from '../../src/ui/ActiveEffectsPanel.js';
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
              displayName: 'Card A',
              attributes: [
                { key: 'duration', label: 'Duration', value: 'turn' },
              ],
            },
            {
              id: 'effect-b',
              displayName: 'Card B',
              attributes: [
                { key: 'duration', label: 'Duration', value: 'round' },
              ],
            },
          ],
        })),
      }),
    );

    expect(html).toContain('data-testid="active-effect-effect-a"');
    expect(html).toContain('data-testid="active-effect-effect-b"');
  });

  it('shows displayName and generic attribute rows', () => {
    const html = renderToStaticMarkup(
      createElement(ActiveEffectsPanel, {
        store: createStore(makeRenderModel({
          activeEffects: [
            {
              id: 'effect-a',
              displayName: 'Card A',
              attributes: [
                { key: 'sourceCardId', label: 'Source Card Id', value: 'card-a' },
                { key: 'side', label: 'Side', value: 'shaded' },
                { key: 'duration', label: 'Duration', value: 'turn' },
              ],
            },
          ],
        })),
      }),
    );

    expect(html).toContain('Card A');
    expect(html).toContain('card-a');
    expect(html).toContain('shaded');
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
});
