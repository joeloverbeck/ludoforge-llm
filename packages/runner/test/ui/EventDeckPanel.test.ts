import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { EventDeckPanel } from '../../src/ui/EventDeckPanel.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

describe('EventDeckPanel', () => {
  it('renders deck display name', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          currentCardId: 'card-1',
          currentCardTitle: 'Containment',
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Strategy Deck');
  });

  it('shows current card title', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          currentCardId: 'card-1',
          currentCardTitle: 'Containment',
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Containment');
  });

  it('shows "No card" when currentCardTitle is null', () => {
    const html = renderToStaticMarkup(
      createElement(EventDeckPanel, {
        store: createStore(
          makeRenderModel({
            eventDecks: [
              {
                id: 'strategy',
                displayName: 'Strategy Deck',
                drawZoneId: 'deck',
                discardZoneId: 'discard',
                currentCardId: null,
                currentCardTitle: null,
                deckSize: 22,
                discardSize: 3,
              },
            ],
          }),
        ),
      }),
    );

    expect(html).toContain('No card');
  });

  it('shows deck and discard counts', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          currentCardId: 'card-1',
          currentCardTitle: 'Containment',
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Deck: 22');
    expect(html).toContain('Discard: 3');
  });

  it('does not render when eventDecks is empty', () => {
    const tree = EventDeckPanel({
      store: createStore(makeRenderModel({ eventDecks: [] })),
    });

    expect(tree).toBeNull();
  });
});
