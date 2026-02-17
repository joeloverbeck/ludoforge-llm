import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '@ludoforge/engine';

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

function makeRenderContext(playerCount: number, playerID = asPlayerId(0)): RenderContext {
  return {
    playerID,
    legalMoveResult: { moves: [], warnings: [] },
    choicePending: null,
    selectedAction: asActionId('tick'),
    choiceStack: [],
    playerSeats: new Map(
      Array.from({ length: playerCount }, (_unused, player) => [asPlayerId(player), 'human' as const]),
    ),
    terminal: null,
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
});
