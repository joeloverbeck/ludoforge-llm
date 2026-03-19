import { asPlayerId } from '@ludoforge/engine/runtime';
import type { StoreApi } from 'zustand';

import type { GameStore } from '../../../src/store/game-store.js';

export function makeRenderModelFixture(
  overrides: Partial<NonNullable<GameStore['renderModel']>> = {},
): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
    tokens: [],
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
      {
        id: asPlayerId(1),
        displayName: 'Player 1',
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
    choiceContext: null,
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    runtimeEligible: [],
    surfaces: {
      tableOverlays: [],
      showdown: null,
    },
    victoryStandings: null,
    terminal: null,
    ...overrides,
  };
}

export function createRenderModelStore(renderModel: GameStore['renderModel']): StoreApi<GameStore> {
  const snapshot = { runnerProjection: null, runnerFrame: null, renderModel };
  return {
    getState: () => snapshot,
    getInitialState: () => snapshot,
    subscribe: () => () => {},
  } as unknown as StoreApi<GameStore>;
}
