// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import { PlayerHandPanel } from '../../src/ui/PlayerHandPanel.js';
import styles from '../../src/ui/PlayerHandPanel.module.css';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

afterEach(() => {
  cleanup();
});

describe('PlayerHandPanel', () => {
  it('renders tokens from owner-visible zones owned by the human player', () => {
    const html = renderToStaticMarkup(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [
          {
            id: 'human-hand',
            displayName: 'Human Hand',
            ordering: 'stack',
            tokenIDs: ['card-a', 'card-b'],
            hiddenTokenCount: 0,
            markers: [],
            visibility: 'owner',
            isSelectable: false,
            isHighlighted: false,
            ownerID: asPlayerId(0),
            category: null,
            attributes: {},
            visual: { shape: 'rectangle', width: 160, height: 100, color: null },
            metadata: {},
          },
          {
            id: 'ai-hand',
            displayName: 'AI Hand',
            ordering: 'stack',
            tokenIDs: ['card-c'],
            hiddenTokenCount: 0,
            markers: [],
            visibility: 'owner',
            isSelectable: false,
            isHighlighted: false,
            ownerID: asPlayerId(1),
            category: null,
            attributes: {},
            visual: { shape: 'rectangle', width: 160, height: 100, color: null },
            metadata: {},
          },
        ],
        tokens: [
          {
            id: 'card-a',
            type: 'Card',
            zoneID: 'human-hand',
            ownerID: asPlayerId(0),
            factionId: null,
            faceUp: true,
            properties: { rank: 'A', suit: 'Spades' },
            isSelectable: false,
            isSelected: false,
          },
          {
            id: 'card-b',
            type: 'Card',
            zoneID: 'human-hand',
            ownerID: asPlayerId(0),
            factionId: null,
            faceUp: true,
            properties: { rank: 'K', suit: 'Hearts' },
            isSelectable: false,
            isSelected: false,
          },
          {
            id: 'card-c',
            type: 'Card',
            zoneID: 'ai-hand',
            ownerID: asPlayerId(1),
            factionId: null,
            faceUp: false,
            properties: { rank: 'Q', suit: 'Clubs' },
            isSelectable: false,
            isSelected: false,
          },
        ],
      })),
    }));

    expect(html).toContain('data-testid="player-hand-panel"');
    expect(html).toContain('data-testid="player-hand-token-card-a"');
    expect(html).toContain('data-testid="player-hand-token-card-b"');
    expect(html).not.toContain('data-testid="player-hand-token-card-c"');
  });

  it('returns null when no owner-visible human tokens exist', () => {
    const html = renderToStaticMarkup(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [{
          id: 'public-pile',
          displayName: 'Public Pile',
          ordering: 'stack',
          tokenIDs: ['card-a'],
          hiddenTokenCount: 0,
          markers: [],
          visibility: 'public',
          isSelectable: false,
          isHighlighted: false,
          ownerID: null,
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null },
          metadata: {},
        }],
        tokens: [{
          id: 'card-a',
          type: 'Card',
          zoneID: 'public-pile',
          ownerID: null,
          factionId: null,
          faceUp: true,
          properties: { rank: 'A', suit: 'Spades' },
          isSelectable: false,
          isSelected: false,
        }],
      })),
    }));

    expect(html).toBe('');
  });

  it('shows token type as the primary label', () => {
    const html = renderToStaticMarkup(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [{
          id: 'human-hand',
          displayName: 'Human Hand',
          ordering: 'stack',
          tokenIDs: ['token-1'],
          hiddenTokenCount: 0,
          markers: [],
          visibility: 'owner',
          isSelectable: false,
          isHighlighted: false,
          ownerID: asPlayerId(0),
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null },
          metadata: {},
        }],
        tokens: [{
          id: 'token-1',
          type: 'Influence',
          zoneID: 'human-hand',
          ownerID: asPlayerId(0),
          factionId: null,
          faceUp: true,
          properties: {},
          isSelectable: false,
          isSelected: false,
        }],
      })),
    }));

    expect(html).toContain('Influence');
  });

  it('shows token properties as secondary info', () => {
    const html = renderToStaticMarkup(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [{
          id: 'human-hand',
          displayName: 'Human Hand',
          ordering: 'stack',
          tokenIDs: ['token-1'],
          hiddenTokenCount: 0,
          markers: [],
          visibility: 'owner',
          isSelectable: false,
          isHighlighted: false,
          ownerID: asPlayerId(0),
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null },
          metadata: {},
        }],
        tokens: [{
          id: 'token-1',
          type: 'Card',
          zoneID: 'human-hand',
          ownerID: asPlayerId(0),
          factionId: null,
          faceUp: true,
          properties: { suit: 'Spades', rank: 'A' },
          isSelectable: false,
          isSelected: false,
        }],
      })),
    }));

    expect(html).toContain('rank: A, suit: Spades');
  });

  it('applies interactive styling only for selectable tokens', () => {
    render(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [{
          id: 'human-hand',
          displayName: 'Human Hand',
          ordering: 'stack',
          tokenIDs: ['token-selectable', 'token-static'],
          hiddenTokenCount: 0,
          markers: [],
          visibility: 'owner',
          isSelectable: false,
          isHighlighted: false,
          ownerID: asPlayerId(0),
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null },
          metadata: {},
        }],
        tokens: [
          {
            id: 'token-selectable',
            type: 'Card',
            zoneID: 'human-hand',
            ownerID: asPlayerId(0),
            factionId: null,
            faceUp: true,
            properties: { rank: 'A' },
            isSelectable: true,
            isSelected: false,
          },
          {
            id: 'token-static',
            type: 'Card',
            zoneID: 'human-hand',
            ownerID: asPlayerId(0),
            factionId: null,
            faceUp: true,
            properties: { rank: 'K' },
            isSelectable: false,
            isSelected: false,
          },
        ],
      })),
    }));

    expect(screen.getByTestId('player-hand-token-token-selectable').className).toContain(styles.tokenSelectable);
    expect(screen.getByTestId('player-hand-token-token-static').className).not.toContain(styles.tokenSelectable);
  });

  it('collapse toggle hides and shows panel content', () => {
    render(createElement(PlayerHandPanel, {
      store: createStore(makeRenderModel({
        zones: [{
          id: 'human-hand',
          displayName: 'Human Hand',
          ordering: 'stack',
          tokenIDs: ['token-1'],
          hiddenTokenCount: 0,
          markers: [],
          visibility: 'owner',
          isSelectable: false,
          isHighlighted: false,
          ownerID: asPlayerId(0),
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null },
          metadata: {},
        }],
        tokens: [{
          id: 'token-1',
          type: 'Card',
          zoneID: 'human-hand',
          ownerID: asPlayerId(0),
          factionId: null,
          faceUp: true,
          properties: { rank: 'A' },
          isSelectable: false,
          isSelected: false,
        }],
      })),
    }));

    expect(screen.getByTestId('player-hand-panel-content')).toBeDefined();

    fireEvent.click(screen.getByTestId('player-hand-panel-toggle'));
    expect(screen.queryByTestId('player-hand-panel-content')).toBeNull();

    fireEvent.click(screen.getByTestId('player-hand-panel-toggle'));
    expect(screen.getByTestId('player-hand-panel-content')).toBeDefined();
  });
});
