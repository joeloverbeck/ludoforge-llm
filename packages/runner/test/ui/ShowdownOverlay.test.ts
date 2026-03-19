// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import { ShowdownOverlay } from '../../src/ui/ShowdownOverlay.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeShowdownModel(
  overrides: Partial<NonNullable<ReturnType<typeof makeRenderModel>>> = {},
) {
  return makeRenderModel({
    surfaces: {
      tableOverlays: [],
      showdown: {
        communityCards: [
          { id: 'tok:c1', type: 'poker-card', faceUp: true, properties: { rank: 'A', suit: 'hearts' } },
          { id: 'tok:c2', type: 'poker-card', faceUp: true, properties: { rank: 'K', suit: 'diamonds' } },
          { id: 'tok:c3', type: 'poker-card', faceUp: true, properties: { rank: 'Q', suit: 'spades' } },
        ],
        rankedPlayers: [
          {
            playerId: asPlayerId(0),
            displayName: 'Player 0',
            score: 8500000,
            holeCards: [
              { id: 'tok:h0a', type: 'poker-card', faceUp: true, properties: { rank: 'J', suit: 'hearts' } },
              { id: 'tok:h0b', type: 'poker-card', faceUp: true, properties: { rank: 'J', suit: 'spades' } },
            ],
          },
          {
            playerId: asPlayerId(1),
            displayName: 'Player 1',
            score: 3200000,
            holeCards: [
              { id: 'tok:h1a', type: 'poker-card', faceUp: true, properties: { rank: '9', suit: 'diamonds' } },
              { id: 'tok:h1b', type: 'poker-card', faceUp: true, properties: { rank: '8', suit: 'clubs' } },
            ],
          },
        ],
      },
    },
    ...overrides,
  });
}

describe('ShowdownOverlay', () => {
  it('returns null when showdown surface is absent', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeRenderModel()),
    }));

    expect(html).toBe('');
  });

  it('returns null when showdown surface has no ranked players', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel({
        surfaces: {
          tableOverlays: [],
          showdown: {
            communityCards: [],
            rankedPlayers: [],
          },
        },
      })),
    }));

    expect(html).toBe('');
  });

  it('renders showdown overlay with community cards and player rankings', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    expect(html).toContain('data-testid="showdown-overlay"');
    expect(html).toContain('data-testid="showdown-overlay-title"');
    expect(html).toContain('Showdown Results');
    expect(html).toContain('data-testid="showdown-community-cards"');
    expect(html).toContain('data-testid="showdown-player-rankings"');
  });

  it('sorts players by score descending (highest first)', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    const player0Pos = html.indexOf('Player 0');
    const player1Pos = html.indexOf('Player 1');
    expect(player0Pos).toBeLessThan(player1Pos);
  });

  it('displays scores for each player', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    expect(html).toContain('Score: 8500000');
    expect(html).toContain('Score: 3200000');
  });

  it('renders continue button that dismisses the overlay', () => {
    const { container } = render(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    expect(screen.getByTestId('showdown-overlay-continue')).toBeDefined();

    fireEvent.click(screen.getByTestId('showdown-overlay-continue'));

    expect(container.querySelector('[data-testid="showdown-overlay"]')).toBeNull();
  });

  it('resets dismissal state when a new showdown surface arrives', () => {
    let renderModel = makeShowdownModel();
    const store = createStore(renderModel);
    vi.spyOn(store, 'getState').mockImplementation(() => ({
      runnerProjection: null,
      runnerFrame: null,
      renderModel,
    }) as ReturnType<typeof store.getState>);

    const { container, rerender } = render(createElement(ShowdownOverlay, { store }));
    fireEvent.click(screen.getByTestId('showdown-overlay-continue'));
    expect(container.querySelector('[data-testid="showdown-overlay"]')).toBeNull();

    renderModel = makeShowdownModel({
      surfaces: {
        tableOverlays: [],
        showdown: {
          communityCards: [{ id: 'tok:c4', type: 'poker-card', faceUp: true, properties: { rank: '2', suit: 'clubs' } }],
          rankedPlayers: [
            {
              playerId: asPlayerId(0),
              displayName: 'Player 0',
              score: 9100000,
              holeCards: [],
            },
          ],
        },
      },
    });
    rerender(createElement(ShowdownOverlay, { store }));

    expect(container.querySelector('[data-testid="showdown-overlay"]')).not.toBeNull();
    expect(screen.getByText('Score: 9100000')).toBeDefined();
  });
});
