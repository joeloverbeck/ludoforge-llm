// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';

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
  const playerVars = new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>([
    [asPlayerId(0), [{ name: 'showdownScore', value: 8500000, displayName: 'Showdown Score' }]],
    [asPlayerId(1), [{ name: 'showdownScore', value: 3200000, displayName: 'Showdown Score' }]],
  ]);

  return makeRenderModel({
    phaseName: 'showdown',
    zones: [
      {
        id: 'community:none',
        displayName: 'Community',
        ordering: 'queue' as const,
        tokenIDs: ['tok:c1', 'tok:c2', 'tok:c3'],
        hiddenTokenCount: 0,
        markers: [],
        visibility: 'public' as const,
        isSelectable: false,
        isHighlighted: false,
        ownerID: null,
        category: null,
        attributes: {},
        visual: { shape: 'rectangle' as const, width: 100, height: 50, color: null },
        metadata: {},
      },
      {
        id: 'hand:0',
        displayName: 'Hand P0',
        ordering: 'set' as const,
        tokenIDs: ['tok:h0a', 'tok:h0b'],
        hiddenTokenCount: 0,
        markers: [],
        visibility: 'owner' as const,
        isSelectable: false,
        isHighlighted: false,
        ownerID: asPlayerId(0),
        category: null,
        attributes: {},
        visual: { shape: 'rectangle' as const, width: 100, height: 50, color: null },
        metadata: {},
      },
      {
        id: 'hand:1',
        displayName: 'Hand P1',
        ordering: 'set' as const,
        tokenIDs: ['tok:h1a', 'tok:h1b'],
        hiddenTokenCount: 0,
        markers: [],
        visibility: 'owner' as const,
        isSelectable: false,
        isHighlighted: false,
        ownerID: asPlayerId(1),
        category: null,
        attributes: {},
        visual: { shape: 'rectangle' as const, width: 100, height: 50, color: null },
        metadata: {},
      },
    ],
    tokens: [
      { id: 'tok:c1', type: 'poker-card', zoneID: 'community:none', ownerID: null, factionId: null, faceUp: true, properties: { rank: 'A', suit: 'hearts' }, isSelectable: false, isSelected: false },
      { id: 'tok:c2', type: 'poker-card', zoneID: 'community:none', ownerID: null, factionId: null, faceUp: true, properties: { rank: 'K', suit: 'diamonds' }, isSelectable: false, isSelected: false },
      { id: 'tok:c3', type: 'poker-card', zoneID: 'community:none', ownerID: null, factionId: null, faceUp: true, properties: { rank: 'Q', suit: 'spades' }, isSelectable: false, isSelected: false },
      { id: 'tok:h0a', type: 'poker-card', zoneID: 'hand:0', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: { rank: 'J', suit: 'hearts' }, isSelectable: false, isSelected: false },
      { id: 'tok:h0b', type: 'poker-card', zoneID: 'hand:0', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: { rank: 'J', suit: 'spades' }, isSelectable: false, isSelected: false },
      { id: 'tok:h1a', type: 'poker-card', zoneID: 'hand:1', ownerID: asPlayerId(1), factionId: null, faceUp: true, properties: { rank: '9', suit: 'diamonds' }, isSelectable: false, isSelected: false },
      { id: 'tok:h1b', type: 'poker-card', zoneID: 'hand:1', ownerID: asPlayerId(1), factionId: null, faceUp: true, properties: { rank: '8', suit: 'clubs' }, isSelectable: false, isSelected: false },
    ],
    playerVars,
    ...overrides,
  });
}

describe('ShowdownOverlay', () => {
  it('returns null when not in showdown phase', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeRenderModel({ phaseName: 'main' })),
    }));

    expect(html).toBe('');
  });

  it('returns null when in showdown phase but no players have showdownScore', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeRenderModel({ phaseName: 'showdown' })),
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
    // Player 0 has higher score (8500000), should appear first
    expect(player0Pos).toBeLessThan(player1Pos);
  });

  it('displays scores for each player', () => {
    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    expect(html).toContain('Score: 8500000');
    expect(html).toContain('Score: 3200000');
  });

  it('excludes eliminated players from rankings', () => {
    const model = makeShowdownModel({
      players: [
        { id: asPlayerId(0), displayName: 'Player 0', isHuman: true, isActive: true, isEliminated: false, factionId: null },
        { id: asPlayerId(1), displayName: 'Player 1', isHuman: false, isActive: false, isEliminated: true, factionId: null },
      ],
    });

    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(model),
    }));

    expect(html).toContain('Player 0');
    expect(html).not.toContain('data-testid="showdown-player-1"');
  });

  it('renders continue button that dismisses the overlay', () => {
    const { container } = render(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel()),
    }));

    expect(screen.getByTestId('showdown-overlay-continue')).toBeDefined();

    fireEvent.click(screen.getByTestId('showdown-overlay-continue'));

    // After clicking, overlay should be dismissed (no longer rendered)
    expect(container.querySelector('[data-testid="showdown-overlay"]')).toBeNull();
  });

  it('returns null when showdownScore is 0 for all players (uncontested pot)', () => {
    const zeroScoreVars = new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>([
      [asPlayerId(0), [{ name: 'showdownScore', value: 0, displayName: 'Showdown Score' }]],
      [asPlayerId(1), [{ name: 'showdownScore', value: 0, displayName: 'Showdown Score' }]],
    ]);

    const html = renderToStaticMarkup(createElement(ShowdownOverlay, {
      store: createStore(makeShowdownModel({ playerVars: zeroScoreVars })),
    }));

    expect(html).toBe('');
  });
});
