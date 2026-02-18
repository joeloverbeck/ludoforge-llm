// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { Scoreboard, calculateTrackFillPercent } from '../../src/ui/Scoreboard.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

afterEach(() => {
  cleanup();
});

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
    mapSpaces: [],
    tokens: [],
    globalVars: [],
    playerVars: new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'Player 0',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function createStore(renderModel: GameStore['renderModel']): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel,
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('Scoreboard', () => {
  it('renders a progress bar for each track', () => {
    const html = renderToStaticMarkup(
      createElement(Scoreboard, {
        store: createStore(makeRenderModel({
          tracks: [
            { id: 'pot', displayName: 'Pot', scope: 'global', faction: null, min: 0, max: 100, currentValue: 10 },
            { id: 'aid', displayName: 'Aid', scope: 'global', faction: null, min: 0, max: 20, currentValue: 5 },
          ],
        })),
      }),
    );

    expect(html).toContain('data-testid="track-pot"');
    expect(html).toContain('data-testid="track-aid"');
  });

  it('progress bar width matches normalized ratio', () => {
    render(createElement(Scoreboard, {
      store: createStore(makeRenderModel({
        tracks: [{ id: 'pot', displayName: 'Pot', scope: 'global', faction: null, min: 0, max: 200, currentValue: 100 }],
      })),
    }));

    const fill = screen.getByTestId('track-fill-pot') as HTMLDivElement;
    expect(fill.style.width).toBe('50%');
  });

  it('groups faction-scoped tracks by faction', () => {
    const html = renderToStaticMarkup(
      createElement(Scoreboard, {
        store: createStore(makeRenderModel({
          tracks: [
            { id: 'us-ops', displayName: 'US Ops', scope: 'faction', faction: 'us', min: 0, max: 6, currentValue: 2 },
            { id: 'ussr-ops', displayName: 'USSR Ops', scope: 'faction', faction: 'ussr', min: 0, max: 6, currentValue: 3 },
          ],
        })),
      }),
    );

    expect(html).toContain('data-testid="scoreboard-faction-us"');
    expect(html).toContain('data-testid="scoreboard-faction-ussr"');
  });

  it('renders global-scoped tracks in a dedicated section', () => {
    const html = renderToStaticMarkup(
      createElement(Scoreboard, {
        store: createStore(makeRenderModel({
          tracks: [{ id: 'pot', displayName: 'Pot', scope: 'global', faction: null, min: 0, max: 100, currentValue: 70 }],
        })),
      }),
    );

    expect(html).toContain('data-testid="scoreboard-global-section"');
  });

  it('returns null when tracks are empty', () => {
    const html = renderToStaticMarkup(
      createElement(Scoreboard, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toBe('');
  });

  it('collapse toggle hides and shows scoreboard content', () => {
    render(createElement(Scoreboard, {
      store: createStore(makeRenderModel({
        tracks: [{ id: 'pot', displayName: 'Pot', scope: 'global', faction: null, min: 0, max: 100, currentValue: 50 }],
      })),
    }));

    expect(screen.getByTestId('scoreboard-content')).toBeDefined();
    fireEvent.click(screen.getByTestId('scoreboard-toggle'));
    expect(screen.queryByTestId('scoreboard-content')).toBeNull();
    fireEvent.click(screen.getByTestId('scoreboard-toggle'));
    expect(screen.getByTestId('scoreboard-content')).toBeDefined();
  });

  it('handles degenerate track ranges safely when max <= min', () => {
    expect(calculateTrackFillPercent({
      id: 'degenerate',
      displayName: 'Degenerate',
      scope: 'global',
      faction: null,
      min: 5,
      max: 5,
      currentValue: 5,
    })).toBe(0);

    expect(calculateTrackFillPercent({
      id: 'degenerate-filled',
      displayName: 'Degenerate Filled',
      scope: 'global',
      faction: null,
      min: 5,
      max: 5,
      currentValue: 6,
    })).toBe(100);
  });

});
