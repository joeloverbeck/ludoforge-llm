import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  type DecisionKey,
  type MoveParamValue,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type LegalMoveEnumerationResult,
  type Move,
  type TerminalResult,
  type Token,
} from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';
import type { RenderContext } from '../../src/store/store-types.js';
import { deriveProjectedRenderModel, type DerivedProjection } from './helpers/derive-projected-render-model.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-project-render-model-state-test',
      players: {
        min: 2,
        max: 2,
      },
    },
    globalVars: [
      {
        name: 'round',
        type: 'int',
        init: 0,
        min: 0,
        max: 20,
      },
      {
        name: 'threat',
        type: 'boolean',
        init: false,
      },
    ],
    perPlayerVars: [
      {
        name: 'support',
        type: 'int',
        init: 0,
        min: 0,
        max: 100,
      },
      {
        name: 'eligible',
        type: 'boolean',
        init: false,
      },
    ],
    zones: [
      {
        id: 'table',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
      },
      {
        id: 'draw',
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
      },
      {
        id: 'discard',
        owner: 'none',
        visibility: 'public',
        ordering: 'stack',
      },
      {
        id: 'played',
        owner: 'none',
        visibility: 'public',
        ordering: 'stack',
      },
    ],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'tick',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'round', delta: 1 } }],
        limits: [],
      },
    ],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'round' }, right: 999 },
          result: { type: 'draw' },
        },
      ],
    },
  });

  if (compiled.gameDef === null) {
    throw new Error(`Expected fixture to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }

  return compiled.gameDef;
}

function makeRenderContext(
  playerCount: number,
  playerID = asPlayerId(0),
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return {
    playerID,
    legalMoveResult: { moves: [], warnings: [] },
    choicePending: null,
    selectedAction: null,
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map(
      Array.from({ length: playerCount }, (_unused, player) => [asPlayerId(player), 'human' as const]),
    ),
    terminal: null,
    ...overrides,
  };
}

function deriveModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
  options: {
    readonly previous?: DerivedProjection | null;
    readonly visualConfigProvider?: VisualConfigProvider;
  } = {},
) {
  return deriveProjectedRenderModel(state, def, context, options).model;
}

function token(id: string, type = 'piece', props: Token['props'] = {}): Token {
  return {
    id: asTokenId(id),
    type,
    props,
  };
}

function expectedRenderChoiceOption(
  value: MoveParamValue,
  displayName: string,
  legality: 'legal' | 'illegal' | 'unknown',
  illegalReason: string | null,
  target: {
    readonly kind: 'zone' | 'token' | 'scalar';
    readonly entityId: string | null;
    readonly displaySource: 'zone' | 'token' | 'fallback';
  } = { kind: 'scalar', entityId: null, displaySource: 'fallback' },
) {
  return {
    choiceValueId: serializeChoiceValueIdentity(value),
    value,
    displayName,
    target,
    legality,
    illegalReason,
  } as const;
}

function expectedRenderChoiceStep(
  decisionKey: string,
  name: string,
  displayName: string,
  chosenValue: MoveParamValue,
  chosenDisplayName: string,
  iterationGroupId: string | null = null,
  iterationLabel: string | null = null,
) {
  return {
    decisionKey: asDecisionKey(decisionKey),
    name,
    displayName,
    chosenValueId: serializeChoiceValueIdentity(chosenValue),
    chosenValue,
    chosenDisplayName,
    iterationGroupId,
    iterationLabel,
  } as const;
}

function withStateMetadata(baseDef: GameDef, baseState: GameState): { readonly def: GameDef; readonly state: GameState } {
  const def: GameDef = {
    ...baseDef,
    seats: [{ id: 'us' }, { id: 'nva' }],
    markerLattices: [
      { id: 'terror', states: ['none', 'low', 'high'], defaultState: 'none' },
    ],
    globalMarkerLattices: [
      { id: 'support', states: ['low', 'high'], defaultState: 'low' },
    ],
    tracks: [
      { id: 'round', scope: 'global', min: 0, max: 20, initial: 0 },
      { id: 'support', scope: 'seat', seat: 'us', min: 0, max: 100, initial: 0 },
      { id: 'momentum', scope: 'seat', seat: 'arvn', min: 3, max: 9, initial: 3 },
    ],
    eventDecks: [
      {
        id: 'strategy',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [
          { id: 'card-a', title: 'Card A', sideMode: 'single' },
          { id: 'card-b', title: 'Card B', sideMode: 'single' },
        ],
      },
    ],
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          windows: [],
          cardLifecycle: {
            played: 'played:none',
            lookahead: 'draw:none',
            leader: 'discard:none',
          },
          eligibility: {
            seats: ['us', 'nva'],
          },
          actionClassByActionId: {},
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn'],
        },
      },
    },
  };

  const state: GameState = {
    ...baseState,
    globalVars: {
      ...baseState.globalVars,
      round: 3,
      threat: true,
    },
    perPlayerVars: {
      ...baseState.perPlayerVars,
      '0': { ...baseState.perPlayerVars['0'], support: 7, eligible: true },
      '1': { ...baseState.perPlayerVars['1'], support: 2, eligible: false },
    },
    markers: {
      'table:none': {
        terror: 'high',
        status: 'fortified',
      },
    },
    globalMarkers: {
      support: 'high',
      threat_level: 'low',
    },
    activeLastingEffects: [
      {
        id: 'effect-card-a',
        sourceCardId: 'card-a',
        side: 'unshaded',
        duration: 'turn',
        setupEffects: [],
      },
      {
        id: 'effect-missing-card',
        sourceCardId: 'missing-card',
        side: 'shaded',
        duration: 'round',
        setupEffects: [],
      },
    ],
    interruptPhaseStack: [
      {
        phase: asPhaseId('reaction'),
        resumePhase: asPhaseId('main'),
      },
    ],
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['us', 'nva'],
        eligibility: {
          us: true,
          nva: true,
        },
        currentCard: {
          firstEligible: 'us',
          secondEligible: 'nva',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...baseState.zones,
      'table:none': [],
      'draw:none': [
        token('tok-201', 'event-card', { cardId: 'card-b', eventDeckId: 'strategy', isCoup: false }),
        token('tok-202', 'event-card', { cardId: 'card-c', eventDeckId: 'strategy', isCoup: false }),
      ],
      'discard:none': [
        token('tok-203', 'event-card', { cardId: 'card-z', eventDeckId: 'strategy', isCoup: false }),
      ],
      'played:none': [
        token('tok-200', 'event-card', { cardId: 'card-a', eventDeckId: 'strategy', isCoup: false }),
      ],
    },
  };

  return { def, state };
}

describe('projectRenderModel state metadata', () => {
  it('derives global/player vars that still power surviving runner surfaces', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 5, 2).state;
    const { def, state } = withStateMetadata(baseDef, baseState);

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.globalVars).toEqual([
      { name: 'round', value: 3, displayName: 'Round' },
      { name: 'threat', value: true, displayName: 'Threat' },
    ]);
    expect(model.playerVars.get(asPlayerId(0))).toEqual([
      { name: 'eligible', value: true, displayName: 'Eligible' },
      { name: 'support', value: 7, displayName: 'Support' },
    ]);
    expect(model.playerVars.get(asPlayerId(1))).toEqual([
      { name: 'eligible', value: false, displayName: 'Eligible' },
      { name: 'support', value: 2, displayName: 'Support' },
    ]);
    expect(model.surfaces).toEqual({
      tableOverlays: [],
      showdown: null,
    });
    expect('globalMarkers' in (model as object)).toBe(false);
    expect('tracks' in (model as object)).toBe(false);

    expect(model.zones.find((zone) => zone.id === 'table:none')?.markers).toEqual([
      { id: 'status', displayName: 'Status', state: 'fortified', possibleStates: [] },
      { id: 'terror', displayName: 'Terror', state: 'high', possibleStates: ['none', 'low', 'high'] },
    ]);
  });

  it('handles missing optional metadata without crashing', () => {
    const def = compileFixture();
    const state = initialState(def, 6, 2).state;

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.activeEffects).toEqual([]);
    expect(model.eventDecks).toEqual([]);
    expect(model.interruptStack).toEqual([]);
    expect(model.isInInterrupt).toBe(false);
  });

  it('derives active effects, interrupt stack, and event deck metadata', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 8, 2).state;
    const { def, state } = withStateMetadata(baseDef, baseState);

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.activeEffects).toEqual([
      {
        id: 'effect-card-a',
        displayName: 'Card A',
        attributes: [
          { key: 'duration', label: 'Duration', value: 'turn' },
          { key: 'side', label: 'Side', value: 'unshaded' },
          { key: 'sourceCardId', label: 'Source Card Id', value: 'card-a' },
        ],
      },
      {
        id: 'effect-missing-card',
        displayName: 'Missing Card',
        attributes: [
          { key: 'duration', label: 'Duration', value: 'round' },
          { key: 'side', label: 'Side', value: 'shaded' },
          { key: 'sourceCardId', label: 'Source Card Id', value: 'missing-card' },
        ],
      },
    ]);
    expect(model.interruptStack).toEqual([
      {
        phase: 'reaction',
        resumePhase: 'main',
      },
    ]);
    expect(model.isInInterrupt).toBe(true);
    expect(model.eventDecks).toEqual([
      {
        id: 'strategy',
        displayName: 'Strategy',
        drawZoneId: 'draw:none',
        discardZoneId: 'discard:none',
        playedCard: { id: 'card-a', title: 'Card A', orderNumber: null, eligibility: null, sideMode: 'single', unshadedText: null, shadedText: null },
        lookaheadCard: { id: 'card-b', title: 'Card B', orderNumber: null, eligibility: null, sideMode: 'single', unshadedText: null, shadedText: null },
        deckSize: 2,
        discardSize: 1,
      },
    ]);
  });

  it('resolves event deck cards from token props.cardId, not token.id', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 5, 2).state;
    const { def, state: stateWithMetadata } = withStateMetadata(baseDef, baseState);
    // Override zones with realistic token shapes: numeric ordinal IDs + cardId in props
    const state: GameState = {
      ...stateWithMetadata,
      zones: {
        ...stateWithMetadata.zones,
        'draw:none': [
          token('tok-201', 'event-card', { cardId: 'card-b', eventDeckId: 'strategy', isCoup: false }),
          token('tok-202', 'event-card', { cardId: 'card-c', eventDeckId: 'strategy', isCoup: false }),
        ],
        'discard:none': [
          token('tok-203', 'event-card', { cardId: 'card-z', eventDeckId: 'strategy', isCoup: false }),
        ],
        'played:none': [
          token('tok-200', 'event-card', { cardId: 'card-a', eventDeckId: 'strategy', isCoup: false }),
        ],
      },
    };

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.eventDecks[0]?.playedCard).toEqual({
      id: 'card-a',
      title: 'Card A',
      orderNumber: null,
      eligibility: null,
      sideMode: 'single',
      unshadedText: null,
      shadedText: null,
    });
    expect(model.eventDecks[0]?.lookaheadCard).toEqual({
      id: 'card-b',
      title: 'Card B',
      orderNumber: null,
      eligibility: null,
      sideMode: 'single',
      unshadedText: null,
      shadedText: null,
    });
  });

  it('projects lasting effect attributes deterministically and excludes non-display payloads', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 80, 2).state;
    const { def, state: stateWithMetadata } = withStateMetadata(baseDef, baseState);
    const state: GameState = {
      ...stateWithMetadata,
      activeLastingEffects: [
        {
          id: 'effect-extended',
          sourceCardId: 'card-a',
          side: 'unshaded',
          branchId: 'ops-window',
          duration: 'turn',
          setupEffects: [],
          teardownEffects: [],
          remainingTurnBoundaries: 2,
        },
      ],
    };

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.activeEffects).toEqual([
      {
        id: 'effect-extended',
        displayName: 'Card A',
        attributes: [
          { key: 'branchId', label: 'Branch Id', value: 'ops-window' },
          { key: 'duration', label: 'Duration', value: 'turn' },
          { key: 'remainingTurnBoundaries', label: 'Remaining Turn Boundaries', value: '2' },
          { key: 'side', label: 'Side', value: 'unshaded' },
          { key: 'sourceCardId', label: 'Source Card Id', value: 'card-a' },
        ],
      },
    ]);
  });

  it('projects active effects in deterministic source order/key order without reviving dead fields', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 81, 2).state;
    const { def, state: stateWithMetadata } = withStateMetadata(baseDef, baseState);
    const state: GameState = {
      ...stateWithMetadata,
      globalMarkers: {
        zeta: 'high',
        alpha: 'low',
      },
      activeLastingEffects: [
        {
          id: 'effect-b',
          sourceCardId: 'card-b',
          side: 'shaded',
          duration: 'round',
          setupEffects: [],
        },
        {
          id: 'effect-a',
          sourceCardId: 'card-a',
          side: 'unshaded',
          duration: 'turn',
          setupEffects: [],
        },
      ],
    };

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect('globalMarkers' in (model as object)).toBe(false);
    expect(model.activeEffects.map((effect) => effect.id)).toEqual(['effect-b', 'effect-a']);
  });

  it('derives players and card-driven turn order', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 21, 2).state;
    const { def, state } = withStateMetadata(baseDef, {
      ...baseState,
      activePlayer: asPlayerId(1),
      perPlayerVars: {
        ...baseState.perPlayerVars,
        '1': { ...baseState.perPlayerVars['1'], eliminated: true },
      },
    });

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        playerSeats: new Map([
          [asPlayerId(0), 'human'],
          [asPlayerId(1), 'ai-random'],
        ]),
      }),
    );

    expect(model.players).toEqual([
      {
        id: asPlayerId(0),
        displayName: 'Us',
        isHuman: true,
        isActive: false,
        isEliminated: false,
        factionId: 'us',
      },
      {
        id: asPlayerId(1),
        displayName: 'Nva',
        isHuman: false,
        isActive: true,
        isEliminated: true,
        factionId: 'nva',
      },
    ]);
    expect(model.turnOrder).toEqual([asPlayerId(0), asPlayerId(1)]);
  });

  it('maps card-driven runtime seat ids to seat factions and visual display names', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 121, 2).state;
    const { def: metadataDef, state: metadataState } = withStateMetadata(baseDef, baseState);
    const baseTurnOrder = metadataDef.turnOrder;
    if (baseTurnOrder === undefined || baseTurnOrder.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order for mapping test fixture.');
    }

    const def: GameDef = {
      ...metadataDef,
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        ...baseTurnOrder,
        type: 'cardDriven',
        config: {
          ...baseTurnOrder.config,
          turnFlow: {
            ...baseTurnOrder.config.turnFlow,
            eligibility: {
              ...baseTurnOrder.config.turnFlow.eligibility,
              seats: ['us', 'nva'],
            },
            cardSeatOrderMapping: {
              US: 'us',
              NVA: 'nva',
            },
          },
        },
      },
    };

    const state: GameState = {
      ...metadataState,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['nva', 'us'],
          eligibility: {
            us: true,
            nva: true,
          },
          currentCard: {
            firstEligible: 'nva',
            secondEligible: 'us',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const visualConfigProvider = new VisualConfigProvider({
      version: 1,
      factions: {
        us: { displayName: 'United States' },
        nva: { displayName: 'North Vietnam' },
      },
    });
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0)),
      { visualConfigProvider },
    );

    expect(model.players).toEqual([
      {
        id: asPlayerId(0),
        displayName: 'United States',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: 'us',
      },
      {
        id: asPlayerId(1),
        displayName: 'North Vietnam',
        isHuman: true,
        isActive: false,
        isEliminated: false,
        factionId: 'nva',
      },
    ]);
    expect(model.turnOrder).toEqual([asPlayerId(1), asPlayerId(0)]);
  });

  it('derives fixed-order turn order from currentIndex', () => {
    const def = compileFixture();
    const baseState = initialState(def, 22, 2).state;
    const state: GameState = {
      ...baseState,
      turnOrderState: {
        type: 'fixedOrder',
        currentIndex: 1,
      },
    };

    const model = deriveModel(state, def, makeRenderContext(state.playerCount));

    expect(model.turnOrderType).toBe('fixedOrder');
    expect(model.turnOrder).toEqual([asPlayerId(1), asPlayerId(0)]);
  });

  it('groups actions, derives choice fields, and maps move warnings', () => {
    const def = compileFixture();
    const state = initialState(def, 23, 2).state;

    const legalMoveResult: LegalMoveEnumerationResult = {
      moves: [
        { actionId: asActionId('train-us'), params: {}, actionClass: 'ops' },
        { actionId: asActionId('train-us'), params: { amount: 1 }, actionClass: 'ops' },
        { actionId: asActionId('pass'), params: {} },
      ] satisfies readonly Move[],
      warnings: [
        { code: 'EMPTY_QUERY_RESULT', message: 'query produced no rows', context: { query: 'q1' } },
      ],
    };
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('pick-target'),
      name: 'pickTarget',
      type: 'chooseN',
      min: 1,
      max: 2,
      selected: [],
      canConfirm: false,
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'token-a', legality: 'legal', illegalReason: null },
      ],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        legalMoveResult,
        choicePending,
        selectedAction: asActionId('train-us'),
        partialMove: { actionId: asActionId('train-us'), params: {} },
        choiceStack: [{ decisionKey: asDecisionKey('pick-action'), name: 'pickAction', value: 'train-us' }],
      }),
    );

    expect(model.actionGroups).toEqual([
      {
        groupKey: 'ops',
        groupName: 'Ops',
        actions: [{ actionId: 'train-us', displayName: 'Train Us', isAvailable: true, actionClass: 'ops' }],
      },
      {
        groupKey: 'Actions',
        groupName: 'Actions',
        actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }],
      },
    ]);
    expect(model.choiceUi).toEqual({
      kind: 'discreteMany',
      decisionKey: 'pick-target',
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null),
        expectedRenderChoiceOption('token-a', 'Token A', 'legal', null),
      ],
      min: 1,
      max: 2,
      selectedChoiceValueIds: [],
      canConfirm: false,
    });
    expect(model.choiceBreadcrumb).toEqual([
      expectedRenderChoiceStep('pick-action', 'pickAction', 'Pick Action', 'train-us', 'Train Us'),
    ]);
    expect(model.moveEnumerationWarnings).toEqual([
      { code: 'EMPTY_QUERY_RESULT', message: 'query produced no rows' },
    ]);
  });

  it('projects choice option legality and illegal reason from choicePending metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'blocked-zone', legality: 'illegal', illegalReason: 'pipelineLegalityFailed' },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null, {
          kind: 'zone',
          entityId: 'table:none',
          displaySource: 'zone',
        }),
        expectedRenderChoiceOption('blocked-zone', 'Blocked Zone', 'illegal', 'pipelineLegalityFailed'),
      ],
    });
  });

  it('filters out options with actionPreconditionFailed from discreteOne', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'blocked-action', legality: 'illegal', illegalReason: 'actionPreconditionFailed' },
        { value: 'blocked-zone', legality: 'illegal', illegalReason: 'emptyDomain' },
      ],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null),
        expectedRenderChoiceOption('blocked-zone', 'Blocked Zone', 'illegal', 'emptyDomain'),
      ],
    });
  });

  it('filters out options with actionPreconditionFailed from discreteMany', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseN',
      min: 1,
      max: 3,
      selected: [],
      canConfirm: false,
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'blocked-action', legality: 'illegal', illegalReason: 'actionPreconditionFailed' },
      ],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteMany',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null),
      ],
      min: 1,
      max: 3,
      selectedChoiceValueIds: [],
      canConfirm: false,
    });
  });

  it('preserves all options when none have actionPreconditionFailed', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'blocked-zone', legality: 'illegal', illegalReason: 'pipelineLegalityFailed' },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null, {
          kind: 'zone',
          entityId: 'table:none',
          displaySource: 'zone',
        }),
        expectedRenderChoiceOption('blocked-zone', 'Blocked Zone', 'illegal', 'pipelineLegalityFailed'),
      ],
    });
  });

  it('returns empty options when all have actionPreconditionFailed', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'a', legality: 'illegal', illegalReason: 'actionPreconditionFailed' },
        { value: 'b', legality: 'illegal', illegalReason: 'actionPreconditionFailed' },
      ],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [],
    });
  });

  it('resolves token target labels and metadata using projected tokens', () => {
    const def = compileFixture();
    const baseState = initialState(def, 2310, 2).state;
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'table:none': [token('token-a', 'agent')],
      },
    };

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'token-a', legality: 'legal', illegalReason: null },
      ],
      targetKinds: ['token'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('token-a', 'Agent (Token A)', 'legal', null, {
          kind: 'token',
          entityId: 'token-a',
          displaySource: 'token',
        }),
      ],
    });
  });

  it('formats scalar and array choice values deterministically without coercion collisions', () => {
    const def = compileFixture();
    const state = initialState(def, 233, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'a,b', legality: 'legal', illegalReason: null },
        { value: ['a', 'b'], legality: 'legal', illegalReason: null },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
        choiceStack: [{ decisionKey: asDecisionKey('prev'), name: 'previousChoice', value: ['table:none', 'token-a'] }],
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('a,b', 'A,b', 'legal', null),
        expectedRenderChoiceOption(['a', 'b'], '[A, B]', 'legal', null),
      ],
    });
    expect(model.choiceBreadcrumb).toEqual([
      expectedRenderChoiceStep(
        'prev',
        'previousChoice',
        'Previous Choice',
        ['table:none', 'token-a'],
        'Table None, Token A',
      ),
    ]);
  });

  it('surfaces unknown legality in rendered choice options', () => {
    const def = compileFixture();
    const state = initialState(def, 231, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'undetermined-zone', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );

    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [
        expectedRenderChoiceOption('table:none', 'Table None', 'legal', null, {
          kind: 'zone',
          entityId: 'table:none',
          displaySource: 'zone',
        }),
        expectedRenderChoiceOption('undetermined-zone', 'Undetermined Zone', 'unknown', null),
      ],
    });
  });

  it('maps chooseOne with empty options to discreteOne without numeric inference', () => {
    const def = compileFixture();
    const state = initialState(def, 232, 2).state;
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [],
      targetKinds: [],
    };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({
      kind: 'discreteOne',
      decisionKey: asDecisionKey('target'),
      options: [],
    });
  });

  it('normalizes invalid chooseN bounds deterministically', () => {
    const def = compileFixture();
    const state = initialState(def, 233, 2).state;
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseN',
      min: 3,
      max: 1,
      selected: [],
      canConfirm: false,
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({
      kind: 'discreteMany',
      decisionKey: asDecisionKey('target'),
      options: [expectedRenderChoiceOption('table:none', 'Table None', 'legal', null, {
        kind: 'zone',
        entityId: 'table:none',
        displaySource: 'zone',
      })],
      min: 3,
      max: 3,
      selectedChoiceValueIds: [],
      canConfirm: false,
    });
  });

  it('maps no-pending selected-action context to confirmReady choiceUi', () => {
    const def = compileFixture();
    const state = initialState(def, 234, 2).state;
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending: null,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'confirmReady' });
  });

  it('maps pending choice without selectedAction to invalid choiceUi', () => {
    const def = compileFixture();
    const state = initialState(def, 235, 2).state;
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: null,
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'invalid', reason: 'PENDING_CHOICE_MISSING_ACTION' });
  });

  it('maps pending choice without partialMove to invalid choiceUi', () => {
    const def = compileFixture();
    const state = initialState(def, 238, 2).state;
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: null,
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'invalid', reason: 'PENDING_CHOICE_MISSING_PARTIAL_MOVE' });
  });

  it('maps selectedAction without partialMove to invalid confirm-ready state', () => {
    const def = compileFixture();
    const state = initialState(def, 236, 2).state;
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending: null,
        selectedAction: asActionId('tick'),
        partialMove: null,
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'invalid', reason: 'CONFIRM_READY_MISSING_PARTIAL_MOVE' });
  });

  it('maps partialMove without selectedAction to invalid confirm-ready state', () => {
    const def = compileFixture();
    const state = initialState(def, 239, 2).state;
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending: null,
        selectedAction: null,
        partialMove: { actionId: asActionId('tick'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'invalid', reason: 'CONFIRM_READY_MISSING_ACTION' });
  });

  it('maps selectedAction/partialMove action mismatch to invalid choiceUi', () => {
    const def = compileFixture();
    const state = initialState(def, 237, 2).state;
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending: null,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('other-action'), params: {} },
      }),
    );
    expect(model.choiceUi).toEqual({ kind: 'invalid', reason: 'ACTION_MOVE_MISMATCH' });
  });

  it('maps terminal variants to render terminal payloads', () => {
    const def = compileFixture();
    const state = initialState(def, 24, 2).state;
    const winTerminal: TerminalResult = {
      type: 'win',
      player: asPlayerId(1),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'checkpoint-a',
        winnerSeat: 'us',
        ranking: [{ seat: 'us', margin: 2, rank: 1, tieBreakKey: 'score' }],
      },
    };
    const scoreTerminal: TerminalResult = {
      type: 'score',
      ranking: [
        { player: asPlayerId(1), score: 9 },
        { player: asPlayerId(0), score: 4 },
      ],
    };

    const winModel = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: winTerminal }),
    );
    expect(winModel.terminal).toEqual({
      type: 'win',
      player: asPlayerId(1),
      message: 'Player 1 wins!',
      victory: {
        timing: 'duringCoup',
        checkpointId: 'checkpoint-a',
        winnerFaction: 'us',
        ranking: [{ faction: 'us', margin: 2, rank: 1, tieBreakKey: 'score' }],
      },
    });

    const lossModel = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: { type: 'lossAll' } }),
    );
    expect(lossModel.terminal).toEqual({ type: 'lossAll', message: 'All players lose.' });

    const drawModel = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: { type: 'draw' } }),
    );
    expect(drawModel.terminal).toEqual({ type: 'draw', message: 'The game is a draw.' });

    const scoreModel = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: scoreTerminal }),
    );
    expect(scoreModel.terminal).toEqual({
      type: 'score',
      ranking: [
        { player: asPlayerId(1), score: 9 },
        { player: asPlayerId(0), score: 4 },
      ],
      message: 'Game over - final rankings.',
    });
  });

  it('without actionGroupPolicy, groups all action classes directly with no synthesis or hiding', () => {
    const def = compileFixture();
    const state = initialState(def, 400, 2).state;

    const moves: Move[] = [
      { actionId: asActionId('train'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('patrol'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('advise'), params: {}, actionClass: 'specialActivity' },
      { actionId: asActionId('pass'), params: {} },
    ];

    const legalMoveResult: LegalMoveEnumerationResult = { moves, warnings: [] };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { legalMoveResult }),
    );

    const groupKeys = model.actionGroups.map((group) => group.groupKey);
    // No policy → no synthesis, no hiding
    expect(groupKeys).toContain('operation');
    expect(groupKeys).toContain('specialActivity');
    expect(groupKeys).toContain('Actions');
    expect(groupKeys).not.toContain('operationPlusSpecialActivity');

    const saGroup = model.actionGroups.find((g) => g.groupKey === 'specialActivity');
    expect(saGroup?.actions.map((a) => a.actionId)).toEqual(['advise']);
  });

  it('with actionGroupPolicy, synthesizes groups and hides classes per policy', () => {
    const def = compileFixture();
    const state = initialState(def, 400, 2).state;

    const moves: Move[] = [
      { actionId: asActionId('train'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('patrol'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('advise'), params: {}, actionClass: 'specialActivity' },
      { actionId: asActionId('pass'), params: {} },
    ];

    const coinPolicy = new VisualConfigProvider({
      version: 1,
      actionGroupPolicy: {
        synthesize: [{ fromClass: 'operation', intoGroup: 'operationPlusSpecialActivity' }],
        hide: ['specialActivity'],
      },
    });

    const legalMoveResult: LegalMoveEnumerationResult = { moves, warnings: [] };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { legalMoveResult }),
      { visualConfigProvider: coinPolicy },
    );

    const groupKeys = model.actionGroups.map((group) => group.groupKey);
    expect(groupKeys).not.toContain('specialActivity');
    expect(groupKeys).toContain('operationPlusSpecialActivity');
    expect(groupKeys).toContain('operation');

    const opSaGroup = model.actionGroups.find((g) => g.groupKey === 'operationPlusSpecialActivity');
    const opSaActionIds = opSaGroup?.actions.map((a) => a.actionId) ?? [];
    expect(opSaActionIds).toContain('train');
    expect(opSaActionIds).toContain('patrol');
    expect(opSaActionIds).not.toContain('advise');

    const opGroup = model.actionGroups.find((g) => g.groupKey === 'operation');
    const opActionIds = opGroup?.actions.map((a) => a.actionId) ?? [];
    expect(opActionIds).toContain('train');
    expect(opActionIds).toContain('patrol');

    const opTrainAction = opGroup?.actions.find((a) => a.actionId === 'train');
    expect(opTrainAction?.actionClass).toBe('operation');
    const opsaTrainAction = opSaGroup?.actions.find((a) => a.actionId === 'train');
    expect(opsaTrainAction?.actionClass).toBe('operationPlusSpecialActivity');
  });

  it('actionGroupPolicy with multiple synthesis targets creates all declared groups', () => {
    const def = compileFixture();
    const state = initialState(def, 400, 2).state;

    const moves: Move[] = [
      { actionId: asActionId('attack'), params: {}, actionClass: 'combat' },
      { actionId: asActionId('defend'), params: {}, actionClass: 'combat' },
    ];

    const multiSynthPolicy = new VisualConfigProvider({
      version: 1,
      actionGroupPolicy: {
        synthesize: [
          { fromClass: 'combat', intoGroup: 'allActions' },
          { fromClass: 'combat', intoGroup: 'combatSpecial' },
        ],
      },
    });

    const legalMoveResult: LegalMoveEnumerationResult = { moves, warnings: [] };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { legalMoveResult }),
      { visualConfigProvider: multiSynthPolicy },
    );

    const groupKeys = model.actionGroups.map((g) => g.groupKey);
    expect(groupKeys).toContain('combat');
    expect(groupKeys).toContain('allActions');
    expect(groupKeys).toContain('combatSpecial');

    const allActionsGroup = model.actionGroups.find((g) => g.groupKey === 'allActions');
    expect(allActionsGroup?.actions.map((a) => a.actionId)).toEqual(['attack', 'defend']);
  });

  it('groups direct operationPlusSpecialActivity moves without synthesis', () => {
    const def = compileFixture();
    const state = initialState(def, 400, 2).state;

    const moves: Move[] = [
      { actionId: asActionId('train'), params: {}, actionClass: 'operationPlusSpecialActivity' },
      { actionId: asActionId('patrol'), params: {}, actionClass: 'operationPlusSpecialActivity' },
      { actionId: asActionId('pass'), params: {} },
    ];

    const legalMoveResult: LegalMoveEnumerationResult = { moves, warnings: [] };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { legalMoveResult }),
    );

    const groupKeys = model.actionGroups.map((g) => g.groupKey);
    expect(groupKeys).toContain('operationPlusSpecialActivity');
    expect(groupKeys).toContain('Actions');

    const opSaGroup = model.actionGroups.find((g) => g.groupKey === 'operationPlusSpecialActivity');
    const opSaActionIds = opSaGroup?.actions.map((a) => a.actionId) ?? [];
    expect(opSaActionIds).toEqual(['train', 'patrol']);

    const trainAction = opSaGroup?.actions.find((a) => a.actionId === 'train');
    expect(trainAction?.actionClass).toBe('operationPlusSpecialActivity');
  });

  it('deduplicates mixed direct and synthesized operationPlusSpecialActivity entries by actionId', () => {
    const def = compileFixture();
    const state = initialState(def, 400, 2).state;

    const moves: Move[] = [
      { actionId: asActionId('train'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('patrol'), params: {}, actionClass: 'operation' },
      { actionId: asActionId('train'), params: {}, actionClass: 'operationPlusSpecialActivity' },
      { actionId: asActionId('ambush'), params: {}, actionClass: 'operationPlusSpecialActivity' },
    ];

    const coinPolicy = new VisualConfigProvider({
      version: 1,
      actionGroupPolicy: {
        synthesize: [{ fromClass: 'operation', intoGroup: 'operationPlusSpecialActivity' }],
      },
    });

    const legalMoveResult: LegalMoveEnumerationResult = { moves, warnings: [] };
    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { legalMoveResult }),
      { visualConfigProvider: coinPolicy },
    );

    const opSaGroup = model.actionGroups.find((g) => g.groupKey === 'operationPlusSpecialActivity');
    const opSaActionIds = opSaGroup?.actions.map((a) => a.actionId) ?? [];
    // 'train' appears in both operation (synthesized) and direct opSA — should appear once
    expect(opSaActionIds).toContain('train');
    expect(opSaActionIds).toContain('patrol');
    expect(opSaActionIds).toContain('ambush');
    // No duplicates
    expect(new Set(opSaActionIds).size).toBe(opSaActionIds.length);

    // Direct opSA 'train' placed into group first (iteration order), synthesis skips duplicate
    const trainAction = opSaGroup?.actions.find((a) => a.actionId === 'train');
    expect(trainAction?.actionClass).toBe('operationPlusSpecialActivity');

    // 'ambush' is direct-only, not from synthesis
    const ambushAction = opSaGroup?.actions.find((a) => a.actionId === 'ambush');
    expect(ambushAction?.actionClass).toBe('operationPlusSpecialActivity');

    // operation group still has its own entries
    const opGroup = model.actionGroups.find((g) => g.groupKey === 'operation');
    expect(opGroup?.actions.map((a) => a.actionId)).toEqual(['train', 'patrol']);
  });

  it('derives eligibility from card metadata via cardSeatOrderMetadataKey', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 500, 2).state;
    const { def: metaDef, state: metaState } = withStateMetadata(baseDef, baseState);
    const baseTurnOrder = metaDef.turnOrder;
    if (baseTurnOrder === undefined || baseTurnOrder.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order for eligibility test fixture.');
    }

    const def: GameDef = {
      ...metaDef,
      eventDecks: [{
        id: 'strategy',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [
          { id: 'card-a', title: 'Card A', sideMode: 'single', metadata: { seatOrder: ['ARVN', 'VC', 'US', 'NVA'] } },
          { id: 'card-b', title: 'Card B', sideMode: 'single', metadata: { seatOrder: ['US', 'NVA', 'ARVN', 'VC'] } },
        ],
      }],
      turnOrder: {
        ...baseTurnOrder,
        type: 'cardDriven',
        config: {
          ...baseTurnOrder.config,
          turnFlow: {
            ...baseTurnOrder.config.turnFlow,
            cardSeatOrderMetadataKey: 'seatOrder',
            cardSeatOrderMapping: {
              ARVN: 'arvn',
              VC: 'vc',
              US: 'us',
              NVA: 'nva',
            },
          },
        },
      },
    };

    const model = deriveModel(metaState, def, makeRenderContext(metaState.playerCount));

    expect(model.eventDecks[0]?.playedCard?.eligibility).toEqual([
      { label: 'ARVN', factionId: 'arvn' },
      { label: 'VC', factionId: 'vc' },
      { label: 'US', factionId: 'us' },
      { label: 'NVA', factionId: 'nva' },
    ]);
    expect(model.eventDecks[0]?.lookaheadCard?.eligibility).toEqual([
      { label: 'US', factionId: 'us' },
      { label: 'NVA', factionId: 'nva' },
      { label: 'ARVN', factionId: 'arvn' },
      { label: 'VC', factionId: 'vc' },
    ]);
  });

  it('produces null eligibility when cards have no seatOrder metadata', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 501, 2).state;
    const { def: metaDef, state: metaState } = withStateMetadata(baseDef, baseState);
    const baseTurnOrder = metaDef.turnOrder;
    if (baseTurnOrder === undefined || baseTurnOrder.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order for eligibility test fixture.');
    }

    const def: GameDef = {
      ...metaDef,
      eventDecks: [{
        id: 'strategy',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [
          { id: 'card-a', title: 'Card A', sideMode: 'single' },
          { id: 'card-b', title: 'Card B', sideMode: 'single' },
        ],
      }],
      turnOrder: {
        ...baseTurnOrder,
        type: 'cardDriven',
        config: {
          ...baseTurnOrder.config,
          turnFlow: {
            ...baseTurnOrder.config.turnFlow,
            cardSeatOrderMetadataKey: 'seatOrder',
          },
        },
      },
    };

    const model = deriveModel(metaState, def, makeRenderContext(metaState.playerCount));

    expect(model.eventDecks[0]?.playedCard?.eligibility).toBeNull();
    expect(model.eventDecks[0]?.lookaheadCard?.eligibility).toBeNull();
  });

  it('produces null eligibility for non-cardDriven turn orders', () => {
    const def = compileFixture();
    const baseState = initialState(def, 502, 2).state;
    const defWithEvents: GameDef = {
      ...def,
      eventDecks: [{
        id: 'strategy',
        drawZone: 'draw',
        discardZone: 'discard',
        cards: [
          { id: 'card-a', title: 'Card A', sideMode: 'single', metadata: { seatOrder: ['US', 'NVA'] } },
        ],
      }],
    };

    const model = deriveModel(baseState, defWithEvents, makeRenderContext(baseState.playerCount));

    // No card-driven turn order means no seat order config, so eligibility should be null
    const playedCard = model.eventDecks[0]?.playedCard;
    const lookaheadCard = model.eventDecks[0]?.lookaheadCard;
    // Cards may not be resolved (no cardLifecycle), but if they were, eligibility would be null
    if (playedCard !== null && playedCard !== undefined) {
      expect(playedCard.eligibility).toBeNull();
    }
    if (lookaheadCard !== null && lookaheadCard !== undefined) {
      expect(lookaheadCard.eligibility).toBeNull();
    }
  });

  it('falls back to raw entry value as factionId when cardSeatOrderMapping is absent', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 503, 2).state;
    const { def: metaDef, state: metaState } = withStateMetadata(baseDef, baseState);
    const baseTurnOrder = metaDef.turnOrder;
    if (baseTurnOrder === undefined || baseTurnOrder.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order for eligibility test fixture.');
    }

    const def: GameDef = {
      ...metaDef,
      eventDecks: [{
        id: 'strategy',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [
          { id: 'card-a', title: 'Card A', sideMode: 'single', metadata: { seatOrder: ['us', 'nva'] } },
          { id: 'card-b', title: 'Card B', sideMode: 'single', metadata: { seatOrder: ['nva', 'us'] } },
        ],
      }],
      turnOrder: {
        ...baseTurnOrder,
        type: 'cardDriven',
        config: {
          ...baseTurnOrder.config,
          turnFlow: {
            ...baseTurnOrder.config.turnFlow,
            cardSeatOrderMetadataKey: 'seatOrder',
            // No cardSeatOrderMapping — factionId should equal the raw label
          },
        },
      },
    };

    const model = deriveModel(metaState, def, makeRenderContext(metaState.playerCount));

    expect(model.eventDecks[0]?.playedCard?.eligibility).toEqual([
      { label: 'us', factionId: 'us' },
      { label: 'nva', factionId: 'nva' },
    ]);
  });

  it('returns eligible factions in seat order for cardDriven game', () => {
    const fixtureDef = compileFixture();
    const fixtureState = initialState(fixtureDef, 5, 2).state;
    const { def, state: metaState } = withStateMetadata(fixtureDef, fixtureState);
    const model = deriveModel(metaState, def, makeRenderContext(metaState.playerCount));

    expect(model.runtimeEligible).toEqual([
      { seatId: 'us', displayName: 'Us', factionId: 'us', seatIndex: 0 },
      { seatId: 'nva', displayName: 'Nva', factionId: 'nva', seatIndex: 1 },
    ]);
  });

  it('excludes ineligible factions from runtimeEligible', () => {
    const fixtureDef = compileFixture();
    const fixtureState = initialState(fixtureDef, 5, 2).state;
    const { def, state: metaState } = withStateMetadata(fixtureDef, fixtureState);
    const cardDrivenState = metaState.turnOrderState as Extract<GameState['turnOrderState'], { readonly type: 'cardDriven' }>;
    const stateWithIneligible: GameState = {
      ...metaState,
      turnOrderState: {
        ...cardDrivenState,
        runtime: {
          ...cardDrivenState.runtime,
          eligibility: { us: false, nva: true },
        },
      },
    };
    const model = deriveModel(stateWithIneligible, def, makeRenderContext(stateWithIneligible.playerCount));

    expect(model.runtimeEligible).toEqual([
      { seatId: 'nva', displayName: 'Nva', factionId: 'nva', seatIndex: 1 },
    ]);
  });

  it('returns empty runtimeEligible for roundRobin turn order', () => {
    const fixtureDef = compileFixture();
    const fixtureState = initialState(fixtureDef, 5, 2).state;
    const model = deriveModel(fixtureState, fixtureDef, makeRenderContext(fixtureState.playerCount));

    expect(model.runtimeEligible).toEqual([]);
  });
});

describe('projectRenderModel choiceContext', () => {
  function compileAndInit(): { def: GameDef; state: GameState } {
    const def = compileFixture();
    const { state } = initialState(def, 5, 2);
    return { def, state };
  }

  it('returns null choiceContext when selectedAction is null', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: null,
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'target',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext).toBeNull();
  });

  it('returns null choiceContext when choicePending is null', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: null,
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext).toBeNull();
  });

  it('returns actionDisplayName from visual config when available', () => {
    const { def, state } = compileAndInit();
    const visualConfigProvider = new VisualConfigProvider({
      version: 1,
      actions: { train: { displayName: 'Train Troops' } },
    });
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'target',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx, { visualConfigProvider });
    expect(model.choiceContext).not.toBeNull();
    expect(model.choiceContext!.actionDisplayName).toBe('Train Troops');
  });

  it('falls back to formatIdAsDisplayName when visual config has no action entry', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'target',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext).not.toBeNull();
    expect(model.choiceContext!.actionDisplayName).toBe('Train');
  });

  it('returns decisionPrompt from visual config when available', () => {
    const { def, state } = compileAndInit();
    const visualConfigProvider = new VisualConfigProvider({
      version: 1,
      actions: { train: { choices: { targetSpace: { prompt: 'Select a space to train in' } } } },
    });
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'targetSpace',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx, { visualConfigProvider });
    expect(model.choiceContext!.decisionPrompt).toBe('Select a space to train in');
  });

  it('returns boundsText for chooseN decisions with min/max', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('deploy'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'spaces',
        type: 'chooseN',
        options: [],
        targetKinds: [],
        min: 1,
        max: 6,
        selected: [],
        canConfirm: false,
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.boundsText).toBe('1-6');
  });

  it('returns single-value boundsText when min equals max', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('deploy'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'spaces',
        type: 'chooseN',
        options: [],
        targetKinds: [],
        min: 3,
        max: 3,
        selected: [],
        canConfirm: false,
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.boundsText).toBe('3');
  });

  it('returns null boundsText for chooseOne decisions without min/max', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'target',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.boundsText).toBeNull();
  });

  it('populates iterationLabel and iterationProgress when inside a forEach iteration', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('decision:troopCount[0]'),
        name: 'troopCount',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
      choiceStack: [
        { decisionKey: asDecisionKey('spaces'), name: 'spaces', value: ['table', 'hand'] as unknown as MoveParamValue },
      ],
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.iterationLabel).toBe('Table');
    expect(model.choiceContext!.iterationProgress).toBe('1 of 2');
  });

  it('returns null iteration fields when not inside a forEach', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('simple-decision'),
        name: 'target',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.iterationLabel).toBeNull();
    expect(model.choiceContext!.iterationProgress).toBeNull();
  });

  it('stores decisionParamName from choicePending.name', () => {
    const { def, state } = compileAndInit();
    const ctx = makeRenderContext(state.playerCount, asPlayerId(0), {
      selectedAction: asActionId('train'),
      choicePending: {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('d1'),
        name: 'targetProvince',
        type: 'chooseOne',
        options: [],
        targetKinds: [],
      },
    });
    const model = deriveModel(state, def, ctx);
    expect(model.choiceContext!.decisionParamName).toBe('targetProvince');
  });

  it('breadcrumb steps from non-iteration decisions have null iteration fields', () => {
    const def = compileFixture();
    const state = initialState(def, 42, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('target'),
      name: 'target',
      type: 'chooseOne',
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
        choiceStack: [{ decisionKey: asDecisionKey('pick-action'), name: 'pickAction', value: 'train-us' }],
      }),
    );

    const step = model.choiceBreadcrumb[0]!;
    expect(step.iterationGroupId).toBeNull();
    expect(step.iterationLabel).toBeNull();
  });

  it('breadcrumb steps from forEach iterations have shared iterationGroupId and resolved iterationLabel', () => {
    const def = compileFixture();
    const state = initialState(def, 42, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('decision:placeType::token-a[1]'),
      name: 'placeType',
      type: 'chooseOne',
      options: [{ value: 'regular', legality: 'legal', illegalReason: null }],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
        choiceStack: [
          { decisionKey: asDecisionKey('pick-spaces'), name: 'pickSpaces', value: ['table:none', 'token-a'] },
          { decisionKey: asDecisionKey('decision:placeType::table:none[0]'), name: 'placeType', value: 'irregulars' },
        ],
      }),
    );

    const step = model.choiceBreadcrumb[1]!;
    expect(step.iterationGroupId).toBe('decision:placeType');
    expect(step.iterationLabel).toBe('Table None');
  });

  it('breadcrumb steps from index-based forEach iterations have shared iterationGroupId', () => {
    const def = compileFixture();
    const state = initialState(def, 42, 2).state;

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('placeType[1]'),
      name: 'placeType',
      type: 'chooseOne',
      options: [{ value: 'regular', legality: 'legal', illegalReason: null }],
      targetKinds: [],
    };

    const model = deriveModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        choicePending,
        selectedAction: asActionId('tick'),
        partialMove: { actionId: asActionId('tick'), params: {} },
        choiceStack: [
          { decisionKey: asDecisionKey('pick-spaces'), name: 'pickSpaces', value: ['table:none', 'token-a'] },
          { decisionKey: asDecisionKey('placeType[0]'), name: 'placeType', value: 'irregulars' },
        ],
      }),
    );

    const step = model.choiceBreadcrumb[1]!;
    expect(step.iterationGroupId).toBe('placeType');
    expect(step.iterationLabel).toBe('Table None');
  });
});
