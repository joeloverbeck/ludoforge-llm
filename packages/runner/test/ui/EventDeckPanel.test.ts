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

import { EventDeckPanel } from '../../src/ui/EventDeckPanel.js';

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
    eventDecks: [
      {
        id: 'strategy',
        displayName: 'Strategy Deck',
        drawZoneId: 'deck',
        discardZoneId: 'discard',
        currentCardId: 'card-1',
        currentCardTitle: 'Containment',
        deckSize: 22,
        discardSize: 3,
      },
    ],
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
    getState: () => ({ renderModel }),
  } as unknown as StoreApi<GameStore>;
}

describe('EventDeckPanel', () => {
  it('renders deck display name', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, { store: createStore(makeRenderModel()) }));

    expect(html).toContain('Strategy Deck');
  });

  it('shows current card title', () => {
    const html = renderToStaticMarkup(createElement(EventDeckPanel, { store: createStore(makeRenderModel()) }));

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
    const html = renderToStaticMarkup(createElement(EventDeckPanel, { store: createStore(makeRenderModel()) }));

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
