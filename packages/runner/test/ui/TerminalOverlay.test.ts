// @vitest-environment jsdom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import { TerminalOverlay } from '../../src/ui/TerminalOverlay.js';
import { createRenderModelStore as createStore, makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => selector(store.getState()),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TerminalOverlay', () => {
  it('returns null when terminal is null', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({ terminal: null })),
    }));

    expect(html).toBe('');
  });

  it('renders win message with winner name for win terminals', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'win',
          player: asPlayerId(1),
          message: 'Player 1 wins!',
        },
      })),
    }));

    expect(html).toContain('data-testid="terminal-overlay"');
    expect(html).toContain('data-testid="terminal-overlay-winner"');
    expect(html).toContain('Player 1');
    expect(html).toContain('Player 1 wins!');
  });

  it('falls back to player id text when winner is not found in players', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        players: [
          {
            id: asPlayerId(0),
            displayName: 'Only Player',
            isHuman: true,
            isActive: true,
            isEliminated: false,
            factionId: null,
          },
        ],
        terminal: {
          type: 'win',
          player: asPlayerId(77),
          message: 'Unexpected winner id',
        },
      })),
    }));

    expect(html).toContain('Player 77');
  });

  it('renders draw message for draw terminals', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'draw',
          message: 'The game is a draw.',
        },
      })),
    }));

    expect(html).toContain('Draw');
    expect(html).toContain('The game is a draw.');
  });

  it('renders ranked scores for score terminals in provided order', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'score',
          message: 'Game over - final rankings.',
          ranking: [
            { player: asPlayerId(1), score: 120 },
            { player: asPlayerId(0), score: 95 },
          ],
        },
      })),
    }));

    expect(html).toContain('Final Scores');
    expect(html).toContain('Player 1');
    expect(html).toContain('Player 0');
    expect(html.indexOf('Player 1')).toBeLessThan(html.indexOf('Player 0'));
  });

  it('renders loss message for lossAll terminals', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'lossAll',
          message: 'All players lose.',
        },
      })),
    }));

    expect(html).toContain('Defeat');
    expect(html).toContain('All players lose.');
  });

  it('renders optional victory ranking for win terminals when present', () => {
    const html = renderToStaticMarkup(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'win',
          player: asPlayerId(0),
          message: 'Player 0 wins!',
          victory: {
            timing: 'endOfTurn',
            checkpointId: 'cp-1',
            winnerFaction: 'Blue',
            ranking: [
              { faction: 'Blue', margin: 5, rank: 1, tieBreakKey: 'vp' },
              { faction: 'Red', margin: 0, rank: 2, tieBreakKey: 'vp' },
            ],
          },
        },
      })),
    }));

    expect(html).toContain('Victory Ranking');
    expect(html).toContain('#1');
    expect(html).toContain('Blue');
    expect(html).toContain('Margin 5');
  });

  it('invokes onNewGame when New Game is clicked', () => {
    const onNewGame = vi.fn();
    const onReturnToMenu = vi.fn();

    render(createElement(TerminalOverlay, {
      store: createStore(makeRenderModel({
        terminal: {
          type: 'draw',
          message: 'Draw',
        },
      })),
      onNewGame,
      onReturnToMenu,
    }));

    fireEvent.click(screen.getByTestId('terminal-overlay-return-menu'));
    expect(onReturnToMenu).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('terminal-overlay-new-game'));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it('uses modal z-index and semi-transparent backdrop in CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/TerminalOverlay.module.css'), 'utf-8');
    const backdropBlock = css.match(/\.backdrop\s*\{[^}]*\}/u)?.[0] ?? '';

    expect(backdropBlock).toContain('z-index: var(--z-modal);');
    expect(backdropBlock).toContain('background: rgba(8, 10, 19, 0.6);');
  });
});
