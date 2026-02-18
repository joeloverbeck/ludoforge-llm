import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreApi } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';

vi.mock('zustand', () => ({
  useStore: <TState, TSlice>(store: { getState(): TState }, selector: (state: TState) => TSlice): TSlice => {
    return selector(store.getState());
  },
}));

import { TurnOrderDisplay } from '../../src/ui/TurnOrderDisplay.js';
import styles from '../../src/ui/TurnOrderDisplay.module.css';

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
    mapSpaces: [],
    tokens: [],
    globalVars: [],
    playerVars: new Map(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'Human',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: 'usa',
      },
      {
        id: asPlayerId(1),
        displayName: 'AI',
        isHuman: false,
        isActive: false,
        isEliminated: true,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0), asPlayerId(1)],
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

describe('TurnOrderDisplay', () => {
  it('renders all players from turnOrder', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toContain('Human');
    expect(html).toContain('AI');
  });

  it('applies active styling to the active player chip', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({ activePlayerID: asPlayerId(1) })),
      }),
    );

    expect(html).toContain(styles.active);
  });

  it('applies eliminated styling to eliminated players', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel()),
      }),
    );

    expect(html).toContain(styles.eliminated);
  });

  it('skips unknown player IDs in turnOrder without crashing', () => {
    const html = renderToStaticMarkup(
      createElement(TurnOrderDisplay, {
        store: createStore(makeRenderModel({ turnOrder: [asPlayerId(0), asPlayerId(99), asPlayerId(1)] })),
      }),
    );

    const chips = html.match(/data-testid="turn-order-player-/gu) ?? [];
    expect(chips).toHaveLength(2);
    expect(html).toContain('Human');
    expect(html).toContain('AI');
  });

  it('does not render when renderModel is null', () => {
    const tree = TurnOrderDisplay({
      store: createStore(null),
    });

    expect(tree).toBeNull();
  });
});
