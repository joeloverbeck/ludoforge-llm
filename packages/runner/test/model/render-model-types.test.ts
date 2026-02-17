import { describe, expect, expectTypeOf, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { MoveParamValue, PlayerId } from '@ludoforge/engine/runtime';

import type {
  RenderChoiceOption,
  RenderModel,
  RenderTerminal,
  RenderToken,
  RenderZone,
} from '../../src/model/render-model';

describe('render-model types', () => {
  it('constructs RenderModel with all required fields', () => {
    const playerZero = asPlayerId(0);
    const playerOne = asPlayerId(1);

    const model: RenderModel = {
      zones: [
        {
          id: 'table',
          displayName: 'Table',
          ordering: 'set',
          tokenIDs: ['token:1'],
          hiddenTokenCount: 0,
          markers: [{ id: 'control', state: 'blue', possibleStates: ['blue', 'red'] }],
          visibility: 'public',
          isSelectable: false,
          isHighlighted: false,
          ownerID: null,
          metadata: {},
        },
      ],
      adjacencies: [{ from: 'table', to: 'reserve', isHighlighted: false }],
      mapSpaces: [
        {
          id: 'city-a',
          displayName: 'City A',
          spaceType: 'urban',
          population: 2,
          econ: 1,
          terrainTags: ['river'],
          country: 'us',
          coastal: false,
          adjacentTo: ['city-b'],
        },
      ],
      tokens: [
        {
          id: 'token:1',
          type: 'unit',
          zoneID: 'table',
          ownerID: playerZero,
          factionId: 'faction:a',
          faceUp: true,
          properties: { value: 1, label: 'A', active: true },
          isSelectable: false,
          isSelected: false,
        },
      ],
      globalVars: [{ name: 'round', value: 1, displayName: 'Round' }],
      playerVars: new Map<PlayerId, readonly { readonly name: string; readonly value: number | boolean; readonly displayName: string }[]>([
        [playerZero, [{ name: 'money', value: 3, displayName: 'Money' }]],
      ]),
      globalMarkers: [{ id: 'threat', state: 'low', possibleStates: ['low', 'high'] }],
      tracks: [
        {
          id: 'tempo',
          displayName: 'Tempo',
          scope: 'global',
          faction: null,
          min: 0,
          max: 10,
          currentValue: 4,
        },
      ],
      activeEffects: [
        {
          id: 'effect:1',
          sourceCardId: 'card:1',
          side: 'unshaded',
          duration: 'round',
          displayName: 'Effect 1',
        },
      ],
      players: [
        {
          id: playerZero,
          displayName: 'Player 0',
          isHuman: true,
          isActive: true,
          isEliminated: false,
          factionId: null,
        },
        {
          id: playerOne,
          displayName: 'Player 1',
          isHuman: false,
          isActive: false,
          isEliminated: false,
          factionId: 'faction:b',
        },
      ],
      activePlayerID: playerZero,
      turnOrder: [playerZero, playerOne],
      turnOrderType: 'roundRobin',
      simultaneousSubmitted: [],
      interruptStack: [{ phase: 'reaction', resumePhase: 'main' }],
      isInInterrupt: true,
      phaseName: 'main',
      phaseDisplayName: 'Main',
      eventDecks: [
        {
          id: 'events',
          displayName: 'Events',
          drawZoneId: 'deck',
          discardZoneId: 'discard',
          currentCardId: null,
          currentCardTitle: null,
          deckSize: 20,
          discardSize: 2,
        },
      ],
      actionGroups: [
        {
          groupName: 'Actions',
          actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }],
        },
      ],
      choiceBreadcrumb: [
        {
          decisionId: 'pick-zone',
          name: 'Pick Zone',
          displayName: 'Pick Zone',
          chosenValue: 'table' as MoveParamValue,
          chosenDisplayName: 'Table',
        },
      ],
      currentChoiceOptions: [
        {
          value: ['table', asPlayerId(1)] as MoveParamValue,
          displayName: 'Table, Player 1',
          legality: 'legal',
          illegalReason: null,
        },
      ],
      currentChoiceDomain: { min: 0, max: 3, step: 1 },
      choiceType: 'chooseN',
      choiceMin: 1,
      choiceMax: 2,
      moveEnumerationWarnings: [{ code: 'WARN', message: 'warning message' }],
      terminal: {
        type: 'win',
        player: playerZero,
        message: 'Player 0 wins!',
      },
    };

    expect(model.zones).toHaveLength(1);
    expectTypeOf(model).toMatchTypeOf<RenderModel>();
  });

  it('allows PlayerId | null for RenderZone.ownerID', () => {
    const ownedZone: RenderZone = {
      id: 'hand:0',
      displayName: 'Hand 0',
      ordering: 'stack',
      tokenIDs: [],
      hiddenTokenCount: 0,
      markers: [],
      visibility: 'owner',
      isSelectable: false,
      isHighlighted: false,
      ownerID: asPlayerId(0),
      metadata: {},
    };

    const neutralZone: RenderZone = {
      ...ownedZone,
      id: 'table',
      ownerID: null,
    };

    expect(ownedZone.ownerID).toEqual(asPlayerId(0));
    expect(neutralZone.ownerID).toBeNull();
  });

  it('allows PlayerId | null for RenderToken.ownerID', () => {
    const ownedToken: RenderToken = {
      id: 'token:1',
      type: 'unit',
      zoneID: 'hand:0',
      ownerID: asPlayerId(0),
      factionId: 'faction:a',
      faceUp: true,
      properties: {},
      isSelectable: false,
      isSelected: false,
    };

    const neutralToken: RenderToken = {
      ...ownedToken,
      id: 'token:2',
      ownerID: null,
      factionId: null,
    };

    expect(ownedToken.ownerID).toEqual(asPlayerId(0));
    expect(neutralToken.ownerID).toBeNull();
  });

  it('covers all RenderTerminal variants', () => {
    const terminals: readonly RenderTerminal[] = [
      { type: 'win', player: asPlayerId(0), message: 'Player 0 wins!' },
      { type: 'lossAll', message: 'All players lose.' },
      { type: 'draw', message: 'The game is a draw.' },
      {
        type: 'score',
        ranking: [
          { player: asPlayerId(0), score: 10 },
          { player: asPlayerId(1), score: 8 },
        ],
        message: 'Game over - final rankings.',
      },
    ];

    expect(terminals).toHaveLength(4);
    expectTypeOf(terminals[0]!).toMatchTypeOf<RenderTerminal>();
  });

  it('accepts MoveParamValue scalars and arrays for RenderChoiceOption.value', () => {
    const scalarOption: RenderChoiceOption = {
      value: 'zone:main' as MoveParamValue,
      displayName: 'Main Zone',
      legality: 'legal',
      illegalReason: null,
    };

    const vectorOption: RenderChoiceOption = {
      value: ['zone:main', asPlayerId(1)] as MoveParamValue,
      displayName: 'Main Zone + Player 1',
      legality: 'legal',
      illegalReason: null,
    };

    expectTypeOf(scalarOption.value).toMatchTypeOf<MoveParamValue>();
    expectTypeOf(vectorOption.value).toMatchTypeOf<MoveParamValue>();
  });
});
