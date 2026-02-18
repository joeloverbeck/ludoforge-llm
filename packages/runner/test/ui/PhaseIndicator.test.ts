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

import { PhaseIndicator } from '../../src/ui/PhaseIndicator.js';

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
        factionId: 'ussr',
      },
      {
        id: asPlayerId(1),
        displayName: 'AI',
        isHuman: false,
        isActive: false,
        isEliminated: false,
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

describe('PhaseIndicator', () => {
  it('renders the phase display name', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ phaseDisplayName: 'Action Round' })),
      }),
    );

    expect(html).toContain('Action Round');
  });

  it('falls back to phaseName when phaseDisplayName is empty', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ phaseName: 'combat', phaseDisplayName: '   ' })),
      }),
    );

    expect(html).toContain('combat');
  });

  it('shows active player display name', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ activePlayerID: asPlayerId(1) })),
      }),
    );

    expect(html).toContain('AI');
  });

  it('applies CSS-variable-based faction color binding with fallback', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseIndicator, {
        store: createStore(makeRenderModel({ activePlayerID: asPlayerId(0) })),
      }),
    );

    expect(html).toContain('var(--faction-ussr, var(--faction-0))');
  });

  it('does not render when renderModel is null', () => {
    const tree = PhaseIndicator({
      store: createStore(null),
    });

    expect(tree).toBeNull();
  });
});
