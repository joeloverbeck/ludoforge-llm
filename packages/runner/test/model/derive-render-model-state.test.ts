import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type LegalMoveEnumerationResult,
  type Move,
  type TerminalResult,
  type Token,
} from '@ludoforge/engine/runtime';

import { deriveRenderModel } from '../../src/model/derive-render-model.js';
import type { RenderContext } from '../../src/store/store-types.js';

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-derive-render-model-state-test',
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

function token(id: string, type = 'piece', props: Token['props'] = {}): Token {
  return {
    id: asTokenId(id),
    type,
    props,
  };
}

function withStateMetadata(baseDef: GameDef, baseState: GameState): { readonly def: GameDef; readonly state: GameState } {
  const def: GameDef = {
    ...baseDef,
    markerLattices: [
      { id: 'terror', states: ['none', 'low', 'high'], defaultState: 'none' },
    ],
    globalMarkerLattices: [
      { id: 'support', states: ['low', 'high'], defaultState: 'low' },
    ],
    tracks: [
      { id: 'round', scope: 'global', min: 0, max: 20, initial: 0 },
      { id: 'support', scope: 'faction', faction: 'us', min: 0, max: 100, initial: 0 },
      { id: 'momentum', scope: 'faction', faction: 'arvn', min: 3, max: 9, initial: 3 },
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
          cardLifecycle: {
            played: 'played:none',
            lookahead: 'draw:none',
            leader: 'discard:none',
          },
          eligibility: {
            factions: ['us', 'nva'],
            overrideWindows: [],
          },
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
        factionOrder: ['us', 'nva'],
        eligibility: {
          us: true,
          nva: true,
        },
        currentCard: {
          firstEligible: 'us',
          secondEligible: 'nva',
          actedFactions: [],
          passedFactions: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...baseState.zones,
      'table:none': [],
      'draw:none': [token('card-b', 'event-card'), token('card-c', 'event-card')],
      'discard:none': [token('card-z', 'event-card')],
      'played:none': [token('card-a', 'event-card')],
    },
  };

  return { def, state };
}

describe('deriveRenderModel state metadata', () => {
  it('derives global/player vars and space/global markers with lattice states', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 5, 2);
    const { def, state } = withStateMetadata(baseDef, baseState);

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

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

    expect(model.zones.find((zone) => zone.id === 'table:none')?.markers).toEqual([
      { id: 'status', state: 'fortified', possibleStates: [] },
      { id: 'terror', state: 'high', possibleStates: ['none', 'low', 'high'] },
    ]);
    expect(model.globalMarkers).toEqual([
      { id: 'support', state: 'high', possibleStates: ['low', 'high'] },
    ]);
  });

  it('handles missing optional metadata without crashing', () => {
    const def = compileFixture();
    const state = initialState(def, 6, 2);

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.globalMarkers).toEqual([]);
    expect(model.activeEffects).toEqual([]);
    expect(model.eventDecks).toEqual([]);
    expect(model.interruptStack).toEqual([]);
    expect(model.isInInterrupt).toBe(false);
  });

  it('derives tracks for global and faction scopes with safe fallback', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 7, 2);
    const { def, state } = withStateMetadata(baseDef, baseState);

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.tracks).toEqual([
      {
        id: 'round',
        displayName: 'Round',
        scope: 'global',
        faction: null,
        min: 0,
        max: 20,
        currentValue: 3,
      },
      {
        id: 'support',
        displayName: 'Support',
        scope: 'faction',
        faction: 'us',
        min: 0,
        max: 100,
        currentValue: 7,
      },
      {
        id: 'momentum',
        displayName: 'Momentum',
        scope: 'faction',
        faction: 'arvn',
        min: 3,
        max: 9,
        currentValue: 3,
      },
    ]);
  });

  it('derives active effects, interrupt stack, and event deck metadata', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 8, 2);
    const { def, state } = withStateMetadata(baseDef, baseState);

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.activeEffects).toEqual([
      {
        id: 'effect-card-a',
        sourceCardId: 'card-a',
        side: 'unshaded',
        duration: 'turn',
        displayName: 'Card A',
      },
      {
        id: 'effect-missing-card',
        sourceCardId: 'missing-card',
        side: 'shaded',
        duration: 'round',
        displayName: 'Missing Card',
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
        currentCardId: 'card-a',
        currentCardTitle: 'Card A',
        deckSize: 2,
        discardSize: 1,
      },
    ]);
  });

  it('derives players and card-driven turn order', () => {
    const baseDef = compileFixture();
    const baseState = initialState(baseDef, 21, 2);
    const { def, state } = withStateMetadata(baseDef, {
      ...baseState,
      activePlayer: asPlayerId(1),
      perPlayerVars: {
        ...baseState.perPlayerVars,
        '1': { ...baseState.perPlayerVars['1'], eliminated: true },
      },
    });

    const model = deriveRenderModel(
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

  it('derives fixed-order turn order from currentIndex', () => {
    const def = compileFixture();
    const baseState = initialState(def, 22, 2);
    const state: GameState = {
      ...baseState,
      turnOrderState: {
        type: 'fixedOrder',
        currentIndex: 1,
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.turnOrderType).toBe('fixedOrder');
    expect(model.turnOrder).toEqual([asPlayerId(1), asPlayerId(0)]);
  });

  it('groups actions, derives choice fields, and maps move warnings', () => {
    const def = compileFixture();
    const state = initialState(def, 23, 2);

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
      decisionId: 'pick-target',
      name: 'pickTarget',
      type: 'chooseN',
      min: 1,
      max: 2,
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'token-a', legality: 'legal', illegalReason: null },
      ],
      targetKinds: [],
    };

    const model = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        legalMoveResult,
        choicePending,
        selectedAction: asActionId('train-us'),
        partialMove: { actionId: asActionId('train-us'), params: {} },
        choiceStack: [{ decisionId: 'pick-action', name: 'pickAction', value: 'train-us' }],
      }),
    );

    expect(model.actionGroups).toEqual([
      {
        groupName: 'Ops',
        actions: [{ actionId: 'train-us', displayName: 'Train Us', isAvailable: true }],
      },
      {
        groupName: 'Actions',
        actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }],
      },
    ]);
    expect(model.choiceUi).toEqual({
      kind: 'discreteMany',
      options: [
        { value: 'table:none', displayName: 'Table None', legality: 'legal', illegalReason: null },
        { value: 'token-a', displayName: 'Token A', legality: 'legal', illegalReason: null },
      ],
      min: 1,
      max: 2,
    });
    expect(model.choiceBreadcrumb).toEqual([
      {
        decisionId: 'pick-action',
        name: 'pickAction',
        displayName: 'Pick Action',
        chosenValue: 'train-us',
        chosenDisplayName: 'Train Us',
      },
    ]);
    expect(model.moveEnumerationWarnings).toEqual([
      { code: 'EMPTY_QUERY_RESULT', message: 'query produced no rows' },
    ]);
  });

  it('projects choice option legality and illegal reason from choicePending metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 230, 2);

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'blocked-zone', legality: 'illegal', illegalReason: 'pipelineLegalityFailed' },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveRenderModel(
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
      options: [
        { value: 'table:none', displayName: 'Table None', legality: 'legal', illegalReason: null },
        {
          value: 'blocked-zone',
          displayName: 'Blocked Zone',
          legality: 'illegal',
          illegalReason: 'pipelineLegalityFailed',
        },
      ],
    });
  });

  it('surfaces unknown legality in rendered choice options', () => {
    const def = compileFixture();
    const state = initialState(def, 231, 2);

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseOne',
      options: [
        { value: 'table:none', legality: 'legal', illegalReason: null },
        { value: 'undetermined-zone', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: ['zone'],
    };

    const model = deriveRenderModel(
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
      options: [
        { value: 'table:none', displayName: 'Table None', legality: 'legal', illegalReason: null },
        {
          value: 'undetermined-zone',
          displayName: 'Undetermined Zone',
          legality: 'unknown',
          illegalReason: null,
        },
      ],
    });
  });

  it('maps chooseOne with empty options to discreteOne without numeric inference', () => {
    const def = compileFixture();
    const state = initialState(def, 232, 2);
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseOne',
      min: 1,
      max: 5,
      options: [],
      targetKinds: [],
    };
    const model = deriveRenderModel(
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
      options: [],
    });
  });

  it('normalizes invalid chooseN bounds deterministically', () => {
    const def = compileFixture();
    const state = initialState(def, 233, 2);
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseN',
      min: 3,
      max: 1,
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveRenderModel(
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
      options: [{ value: 'table:none', displayName: 'Table None', legality: 'legal', illegalReason: null }],
      min: 3,
      max: 3,
    });
  });

  it('maps no-pending selected-action context to confirmReady choiceUi', () => {
    const def = compileFixture();
    const state = initialState(def, 234, 2);
    const model = deriveRenderModel(
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
    const state = initialState(def, 235, 2);
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseOne',
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveRenderModel(
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
    const state = initialState(def, 238, 2);
    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'target',
      name: 'target',
      type: 'chooseOne',
      options: [{ value: 'table:none', legality: 'legal', illegalReason: null }],
      targetKinds: ['zone'],
    };
    const model = deriveRenderModel(
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
    const state = initialState(def, 236, 2);
    const model = deriveRenderModel(
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
    const state = initialState(def, 239, 2);
    const model = deriveRenderModel(
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
    const state = initialState(def, 237, 2);
    const model = deriveRenderModel(
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
    const state = initialState(def, 24, 2);
    const winTerminal: TerminalResult = {
      type: 'win',
      player: asPlayerId(1),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'checkpoint-a',
        winnerFaction: 'us',
        ranking: [{ faction: 'us', margin: 2, rank: 1, tieBreakKey: 'score' }],
      },
    };
    const scoreTerminal: TerminalResult = {
      type: 'score',
      ranking: [
        { player: asPlayerId(1), score: 9 },
        { player: asPlayerId(0), score: 4 },
      ],
    };

    const winModel = deriveRenderModel(
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

    const lossModel = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: { type: 'lossAll' } }),
    );
    expect(lossModel.terminal).toEqual({ type: 'lossAll', message: 'All players lose.' });

    const drawModel = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), { terminal: { type: 'draw' } }),
    );
    expect(drawModel.terminal).toEqual({ type: 'draw', message: 'The game is a draw.' });

    const scoreModel = deriveRenderModel(
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
});
