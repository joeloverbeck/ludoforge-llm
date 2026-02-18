import { describe, expect, it } from 'vitest';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { deriveBottomBarState } from '../../src/ui/bottom-bar-mode.js';

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
    actionGroups: [{ groupName: 'Core', actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }] }],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

describe('deriveBottomBarState', () => {
  it('returns hidden when renderModel is null', () => {
    expect(deriveBottomBarState(null, null, null)).toEqual({ kind: 'hidden' });
  });

  it('returns aiTurn when active player is not human', () => {
    const mode = deriveBottomBarState(makeRenderModel({ activePlayerID: asPlayerId(1) }), null, null);
    expect(mode).toEqual({ kind: 'aiTurn' });
  });

  it('returns choicePending when choiceUi is a pending variant', () => {
    const mode = deriveBottomBarState(
      makeRenderModel({
        choiceUi: {
          kind: 'discreteOne',
          options: [{ value: 'x', displayName: 'X', legality: 'legal', illegalReason: null }],
        },
      }),
      asActionId('pass'),
      { actionId: asActionId('pass'), params: {} },
    );
    expect(mode).toEqual({ kind: 'choicePending' });
  });

  it('returns choiceConfirm when move is fully constructed and no pending choice payload remains', () => {
    const mode = deriveBottomBarState(
      makeRenderModel({
        choiceUi: { kind: 'confirmReady' },
      }),
      asActionId('pass'),
      { actionId: asActionId('pass'), params: {} },
    );
    expect(mode).toEqual({ kind: 'choiceConfirm' });
  });

  it('falls back to actions when choiceUi is confirmReady without a full move payload', () => {
    const mode = deriveBottomBarState(makeRenderModel({ choiceUi: { kind: 'confirmReady' } }), asActionId('pass'), null);
    expect(mode).toEqual({ kind: 'actions' });
  });

  it('returns actions for human-turn default state', () => {
    const mode = deriveBottomBarState(makeRenderModel(), null, null);
    expect(mode).toEqual({ kind: 'actions' });
  });
});
