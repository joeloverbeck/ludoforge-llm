import { describe, expect, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { deriveBottomBarState } from '../../src/ui/bottom-bar-mode.js';

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
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
    expect(deriveBottomBarState(null)).toEqual({ kind: 'hidden' });
  });

  it('returns aiTurn when active player is not human', () => {
    const mode = deriveBottomBarState(makeRenderModel({ activePlayerID: asPlayerId(1) }));
    expect(mode).toEqual({ kind: 'aiTurn' });
  });

  it('returns choicePending when choiceUi is a pending variant', () => {
    const mode = deriveBottomBarState(
      makeRenderModel({
        choiceUi: {
          kind: 'discreteOne',
          options: [{
            choiceValueId: 's:1:x',
            value: 'x',
            displayName: 'X',
            target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
            legality: 'legal',
            illegalReason: null,
          }],
        },
      }),
    );
    expect(mode).toEqual({ kind: 'choicePending' });
  });

  it('returns choiceConfirm when choiceUi is confirmReady', () => {
    const mode = deriveBottomBarState(
      makeRenderModel({
        choiceUi: { kind: 'confirmReady' },
      }),
    );
    expect(mode).toEqual({ kind: 'choiceConfirm' });
  });

  it('returns choiceInvalid when choiceUi is invalid', () => {
    const mode = deriveBottomBarState(makeRenderModel({ choiceUi: { kind: 'invalid', reason: 'ACTION_MOVE_MISMATCH' } }));
    expect(mode).toEqual({ kind: 'choiceInvalid' });
  });

  it('returns actions for human-turn default state', () => {
    const mode = deriveBottomBarState(makeRenderModel());
    expect(mode).toEqual({ kind: 'actions' });
  });

  it('derives deterministic precedence/fallback for contradictory edge states', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly renderModel: NonNullable<GameStore['renderModel']> | null;
      readonly expected: ReturnType<typeof deriveBottomBarState>;
    }> = [
      {
        name: 'ai turn overrides pending choice mode',
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(1),
          choiceUi: {
            kind: 'discreteOne',
            options: [{
              choiceValueId: 's:1:x',
              value: 'x',
              displayName: 'X',
              target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
              legality: 'legal',
              illegalReason: null,
            }],
          },
        }),
        expected: { kind: 'aiTurn' },
      },
      {
        name: 'ai turn overrides confirm-ready mode',
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(1),
          choiceUi: { kind: 'confirmReady' },
        }),
        expected: { kind: 'aiTurn' },
      },
      {
        name: 'unknown active player falls back to aiTurn',
        renderModel: makeRenderModel({
          activePlayerID: asPlayerId(99),
        }),
        expected: { kind: 'aiTurn' },
      },
      {
        name: 'null render model is hidden',
        renderModel: null,
        expected: { kind: 'hidden' },
      },
    ];

    for (const testCase of cases) {
      expect(deriveBottomBarState(testCase.renderModel), testCase.name).toEqual(testCase.expected);
    }
  });
});
