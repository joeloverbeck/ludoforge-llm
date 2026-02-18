import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GlobalMarkersBar, buildPossibleStatesTitle } from '../../src/ui/GlobalMarkersBar.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

describe('GlobalMarkersBar', () => {
  it('renders a chip for each global marker', () => {
    const html = renderToStaticMarkup(
      createElement(GlobalMarkersBar, {
        store: createStore(makeRenderModel({
          globalMarkers: [
            { id: 'support', state: 'high', possibleStates: ['low', 'high'] },
            { id: 'threat', state: 'low', possibleStates: ['low', 'high'] },
          ],
        })),
      }),
    );

    expect(html).toContain('data-testid="global-marker-support"');
    expect(html).toContain('data-testid="global-marker-threat"');
  });

  it('shows marker id and current state on each chip', () => {
    const html = renderToStaticMarkup(
      createElement(GlobalMarkersBar, {
        store: createStore(makeRenderModel({
          globalMarkers: [{ id: 'support', state: 'high', possibleStates: ['low', 'high'] }],
        })),
      }),
    );

    expect(html).toContain('support');
    expect(html).toContain('high');
  });

  it('returns null when globalMarkers is empty', () => {
    const html = renderToStaticMarkup(
      createElement(GlobalMarkersBar, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toBe('');
  });

  it('exposes possible states in chip title tooltip context', () => {
    const html = renderToStaticMarkup(
      createElement(GlobalMarkersBar, {
        store: createStore(makeRenderModel({
          globalMarkers: [{ id: 'support', state: 'high', possibleStates: ['low', 'high'] }],
        })),
      }),
    );

    expect(html).toContain('title="Possible states: low, high"');
  });

  it('formats possible-state title text deterministically', () => {
    expect(buildPossibleStatesTitle(['a', 'b'])).toBe('Possible states: a, b');
    expect(buildPossibleStatesTitle([])).toBe('Possible states: none');
  });
});
