import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';
import type { StoreApi } from 'zustand';

import type { GameStore } from '../../../src/store/game-store.js';

export function makeRenderModelFixture(
  overrides: Partial<NonNullable<GameStore['renderModel']>> = {},
): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
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
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

export function createRenderModelStore(renderModel: GameStore['renderModel']): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel,
    }),
  } as unknown as StoreApi<GameStore>;
}
