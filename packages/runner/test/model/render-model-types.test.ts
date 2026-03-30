import { describe, expect, expectTypeOf, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { DecisionKey, MoveParamValue } from '@ludoforge/engine/runtime';

import { serializeChoiceValueIdentity } from '../../src/model/choice-value-utils';
import type {
  RenderChoiceOption,
  RenderChoiceUi,
  RenderModel,
  RenderSurfaceModel,
  RenderTerminal,
  RenderToken,
  RenderZone,
} from '../../src/model/render-model';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

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
          markers: [{ id: 'control', displayName: 'Control', state: 'blue', possibleStates: ['blue', 'red'] }],
          visibility: 'public',
          isSelectable: false,
          isHighlighted: false,
          ownerID: null,
          category: null,
          attributes: {},
          visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null, vertices: null },
          metadata: {},
        },
      ],
      adjacencies: [{ from: 'table', to: 'reserve', category: null, isHighlighted: false }],
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
      activeEffects: [
        {
          id: 'effect:1',
          displayName: 'Effect 1',
          attributes: [
            { key: 'duration', label: 'Duration', value: 'round' },
            { key: 'side', label: 'Side', value: 'unshaded' },
          ],
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
          playedCard: null,
          lookaheadCard: null,
          deckSize: 20,
          discardSize: 2,
        },
      ],
      actionGroups: [
        {
          groupKey: 'Actions',
          groupName: 'Actions',
          actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }],
        },
      ],
      hiddenActionsByClass: new Map(),
      choiceBreadcrumb: [
        {
          decisionKey: asDecisionKey('pick-zone'),
          name: 'Pick Zone',
          displayName: 'Pick Zone',
          chosenValueId: serializeChoiceValueIdentity('table' as MoveParamValue),
          chosenValue: 'table' as MoveParamValue,
          chosenDisplayName: 'Table',
          iterationGroupId: null,
          iterationLabel: null,
        },
      ],
      choiceContext: null,
      selectedActionDisplayName: null,
      choiceUi: {
        kind: 'discreteMany',
        decisionKey: asDecisionKey('pick-tokens'),
        options: [
          {
            choiceValueId: serializeChoiceValueIdentity(['table', asPlayerId(1)] as MoveParamValue),
            value: ['table', asPlayerId(1)] as MoveParamValue,
            displayName: 'Table, Player 1',
            target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
            legality: 'legal',
            illegalReason: null,
          },
        ],
        min: 1,
        max: 2,
        selectedChoiceValueIds: [],
        canConfirm: false,
      },
      moveEnumerationWarnings: [{ code: 'WARN', message: 'warning message' }],
      runtimeEligible: [],
      surfaces: {
        tableOverlays: [
          {
            key: 'overlay:pot',
            type: 'text',
            text: 'Pot: 42',
            point: { x: 0, y: 0 },
            signature: 'pot=42',
          },
        ],
        showdown: {
          communityCards: [
            {
              id: 'tok:c1',
              type: 'poker-card',
              faceUp: true,
              properties: { rank: 'A', suit: 'hearts' },
            },
          ],
          rankedPlayers: [
            {
              playerId: playerZero,
              displayName: 'Player 0',
              score: 42,
              holeCards: [
                {
                  id: 'tok:h1',
                  type: 'poker-card',
                  faceUp: true,
                  properties: { rank: 'K', suit: 'spades' },
                },
              ],
            },
          ],
        },
      },
      victoryStandings: null,
      terminal: {
        type: 'win',
        player: playerZero,
        message: 'Player 0 wins!',
      },
    };

    expect(model.zones).toHaveLength(1);
    expect('globalMarkers' in (model as object)).toBe(false);
    expect('tracks' in (model as object)).toBe(false);
    expectTypeOf(model).toMatchTypeOf<RenderModel>();
  });

  it('covers the RenderSurfaceModel default-capable shape', () => {
    const surfaces: RenderSurfaceModel = {
      tableOverlays: [],
      showdown: null,
    };

    expect(surfaces.tableOverlays).toEqual([]);
    expect(surfaces.showdown).toBeNull();
    expectTypeOf(surfaces).toMatchTypeOf<RenderSurfaceModel>();
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
      category: null,
      attributes: {},
      visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null, vertices: null },
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
      choiceValueId: serializeChoiceValueIdentity('zone:main' as MoveParamValue),
      value: 'zone:main' as MoveParamValue,
      displayName: 'Main Zone',
      target: { kind: 'zone', entityId: 'zone:main', displaySource: 'zone' },
      legality: 'legal',
      illegalReason: null,
    };

    const vectorOption: RenderChoiceOption = {
      choiceValueId: serializeChoiceValueIdentity(['zone:main', asPlayerId(1)] as MoveParamValue),
      value: ['zone:main', asPlayerId(1)] as MoveParamValue,
      displayName: 'Main Zone + Player 1',
      target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
      legality: 'legal',
      illegalReason: null,
    };

    expectTypeOf(scalarOption.value).toMatchTypeOf<MoveParamValue>();
    expectTypeOf(vectorOption.value).toMatchTypeOf<MoveParamValue>();
  });

  it('covers all RenderChoiceUi variants', () => {
    const choices: readonly RenderChoiceUi[] = [
      { kind: 'none' },
      { kind: 'confirmReady' },
      {
        kind: 'discreteOne',
        decisionKey: asDecisionKey('pick-zone'),
        options: [{
          choiceValueId: serializeChoiceValueIdentity('zone:a' as MoveParamValue),
          value: 'zone:a' as MoveParamValue,
          displayName: 'Zone A',
          target: { kind: 'zone', entityId: 'zone:a', displaySource: 'zone' },
          legality: 'legal',
          illegalReason: null,
        }],
      },
      {
        kind: 'discreteMany',
        decisionKey: asDecisionKey('pick-zones'),
        options: [{
          choiceValueId: serializeChoiceValueIdentity('zone:a' as MoveParamValue),
          value: 'zone:a' as MoveParamValue,
          displayName: 'Zone A',
          target: { kind: 'zone', entityId: 'zone:a', displaySource: 'zone' },
          legality: 'legal',
          illegalReason: null,
        }],
        min: 1,
        max: 2,
        selectedChoiceValueIds: [],
        canConfirm: false,
      },
      {
        kind: 'numeric',
        decisionKey: asDecisionKey('pick-amount'),
        domain: { min: 0, max: 5, step: 1 },
      },
      {
        kind: 'invalid',
        reason: 'ACTION_MOVE_MISMATCH',
      },
    ];
    expect(choices).toHaveLength(6);
  });
});
