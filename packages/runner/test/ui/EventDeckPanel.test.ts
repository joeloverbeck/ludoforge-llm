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
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: 5 },
          lookaheadCard: null,
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Strategy Deck');
  });

  it('shows played card title', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: 5 },
          lookaheadCard: null,
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Containment');
  });

  it('shows played card order number', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: 12 },
          lookaheadCard: null,
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('#12');
  });

  it('shows lookahead card title and number', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: null,
          lookaheadCard: { id: 'card-2', title: 'Gulf of Tonkin', orderNumber: 3 },
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Gulf of Tonkin');
    expect(html).toContain('#3');
  });

  it('shows "No card" when playedCard is null', () => {
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
                playedCard: null,
                lookaheadCard: null,
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

  it('renders both Now Playing and Up Next widget labels', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: 5 },
          lookaheadCard: { id: 'card-2', title: 'Gulf of Tonkin', orderNumber: 3 },
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Now Playing');
    expect(html).toContain('Up Next');
  });

  it('shows deck and discard counts', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: 5 },
          lookaheadCard: null,
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

  it('does not render order number when orderNumber is null', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, {
      store: createStore(makeRenderModel({
        eventDecks: [{
          id: 'strategy',
          displayName: 'Strategy Deck',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          playedCard: { id: 'card-1', title: 'Containment', orderNumber: null },
          lookaheadCard: null,
          deckSize: 22,
          discardSize: 3,
        }],
      })),
    }));

    expect(html).toContain('Containment');
    expect(html).not.toContain('#');
  });
});
