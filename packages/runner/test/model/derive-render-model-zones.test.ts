import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '@ludoforge/engine';

import { deriveRenderModel } from '../../src/model/derive-render-model.js';
import type { RenderContext } from '../../src/store/store-types.js';

interface CompileFixtureOptions {
  readonly zones: readonly {
    readonly id: string;
    readonly owner: 'none' | 'player';
    readonly visibility: 'public' | 'owner' | 'hidden';
    readonly ordering: 'stack' | 'queue' | 'set';
    readonly adjacentTo?: readonly string[];
  }[];
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

function compileFixture(options: CompileFixtureOptions): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-derive-render-model-test',
      players: {
        min: options.minPlayers,
        max: options.maxPlayers,
      },
    },
    globalVars: [
      {
        name: 'tick',
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    ],
    zones: options.zones,
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
        effects: [{ addVar: { scope: 'global', var: 'tick', delta: 1 } }],
        limits: [],
      },
      {
        id: 'choose-zone',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [
          {
            name: 'targetZone',
            domain: { query: 'zones' },
          },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: 'choose-token',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [
          {
            name: 'targetToken',
            domain: { query: 'tokensInMapSpaces' },
          },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 999 },
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
    selectedAction: asActionId('tick'),
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

describe('deriveRenderModel zones/tokens/adjacencies/mapSpaces', () => {
  it('maps materialized zones and filters owner zones by state.playerCount', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 3,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: ['hand:0'],
        },
        {
          id: 'hand',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
          adjacentTo: ['table:none'],
        },
      ],
    });
    const baseState = initialState(def, 123, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'table:none': [token('t-table', 'unit', { hp: 2 })],
        'hand:0': [token('t-hand-0', 'card', { name: 'A' })],
        'hand:1': [token('t-hand-1', 'card', { name: 'B' })],
        'hand:2': [token('t-hand-2', 'card', { name: 'C' })],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.zones.map((zone) => zone.id)).toEqual(['table:none', 'hand:0', 'hand:1']);

    const tableZone = model.zones.find((zone) => zone.id === 'table:none');
    expect(tableZone).toMatchObject({
      ownerID: null,
      ordering: 'set',
      visibility: 'public',
      tokenIDs: ['t-table'],
    });

    const handZeroZone = model.zones.find((zone) => zone.id === 'hand:0');
    expect(handZeroZone?.ownerID).toEqual(asPlayerId(0));

    const handOneZone = model.zones.find((zone) => zone.id === 'hand:1');
    expect(handOneZone?.ownerID).toEqual(asPlayerId(1));

    expect(model.zones.find((zone) => zone.id === 'hand:2')).toBeUndefined();

    expect(model.tokens.map((renderToken) => renderToken.id)).toEqual(['t-table', 't-hand-0']);

    expect(model.tokens.find((renderToken) => renderToken.id === 't-table')?.ownerID).toBeNull();
    expect(model.tokens.find((renderToken) => renderToken.id === 't-hand-0')?.ownerID).toEqual(asPlayerId(0));
    expect(handOneZone?.hiddenTokenCount).toBe(1);
  });

  it('normalizes adjacencies bidirectionally and deduplicates pairs', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 3,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: ['hand:0'],
        },
        {
          id: 'hand',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
        },
      ],
    });

    const state = initialState(def, 9, 2);
    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.adjacencies).toEqual([
      { from: 'table:none', to: 'hand:0' },
      { from: 'hand:0', to: 'table:none' },
    ]);
  });

  it('copies map spaces with derived display names', () => {
    const defBase = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
      ],
    });

    const def: GameDef = {
      ...defBase,
      mapSpaces: [
        {
          id: 'city-alpha',
          spaceType: 'urban',
          population: 2,
          econ: 1,
          terrainTags: ['river'],
          country: 'us',
          coastal: false,
          adjacentTo: ['city-beta'],
        },
      ],
    };

    const state = initialState(def, 8, 2);
    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount));

    expect(model.mapSpaces).toEqual([
      {
        id: 'city-alpha',
        displayName: 'City Alpha',
        spaceType: 'urban',
        population: 2,
        econ: 1,
        terrainTags: ['river'],
        country: 'us',
        coastal: false,
        adjacentTo: ['city-beta'],
      },
    ]);
  });

  it('handles empty zones state without throwing', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
      ],
    });

    const baseState = initialState(def, 2, 2);
    const state: GameState = {
      ...baseState,
      zones: {},
    };
    const emptyDef: GameDef = {
      ...def,
      zones: [],
    };

    const model = deriveRenderModel(state, emptyDef, makeRenderContext(state.playerCount));

    expect(model.zones).toEqual([]);
    expect(model.tokens).toEqual([]);
    expect(model.adjacencies).toEqual([]);
  });

  it('keeps public zone tokens visible and face-up with no hidden count', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
      ],
    });
    const baseState = initialState(def, 11, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'table:none': [token('public-1'), token('public-2')],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(1)));
    const tableZone = model.zones.find((zone) => zone.id === 'table:none');
    expect(tableZone?.tokenIDs).toEqual(['public-1', 'public-2']);
    expect(tableZone?.hiddenTokenCount).toBe(0);
    expect(model.tokens.map((renderToken) => [renderToken.id, renderToken.faceUp])).toEqual([
      ['public-1', true],
      ['public-2', true],
    ]);
  });

  it('applies owner visibility to owner zones for owner and non-owner viewers', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'hand',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
        },
      ],
    });
    const baseState = initialState(def, 12, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'hand:0': [token('h0-a'), token('h0-b')],
        'hand:1': [token('h1-a')],
      },
    };

    const ownerModel = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(0)));
    const ownerHand = ownerModel.zones.find((zone) => zone.id === 'hand:0');
    const ownerOpponentHand = ownerModel.zones.find((zone) => zone.id === 'hand:1');
    expect(ownerHand?.tokenIDs).toEqual(['h0-a', 'h0-b']);
    expect(ownerHand?.hiddenTokenCount).toBe(0);
    expect(ownerOpponentHand?.tokenIDs).toEqual([]);
    expect(ownerOpponentHand?.hiddenTokenCount).toBe(1);
    expect(ownerModel.tokens.map((renderToken) => renderToken.id)).toEqual(['h0-a', 'h0-b']);

    const nonOwnerModel = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(1)));
    const nonOwnerHand = nonOwnerModel.zones.find((zone) => zone.id === 'hand:0');
    const nonOwnerOwnHand = nonOwnerModel.zones.find((zone) => zone.id === 'hand:1');
    expect(nonOwnerHand?.tokenIDs).toEqual([]);
    expect(nonOwnerHand?.hiddenTokenCount).toBe(2);
    expect(nonOwnerOwnHand?.tokenIDs).toEqual(['h1-a']);
    expect(nonOwnerOwnHand?.hiddenTokenCount).toBe(0);
    expect(nonOwnerModel.tokens.map((renderToken) => renderToken.id)).toEqual(['h1-a']);
  });

  it('keeps hidden zone token IDs hidden by default', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
        },
      ],
    });
    const baseState = initialState(def, 13, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'deck:none': [token('d1'), token('d2'), token('d3')],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(1)));
    const deckZone = model.zones.find((zone) => zone.id === 'deck:none');
    expect(deckZone?.tokenIDs).toEqual([]);
    expect(deckZone?.hiddenTokenCount).toBe(3);
    expect(model.tokens).toEqual([]);
  });

  it('applies reveal grants by observer and filter while maintaining hiddenTokenCount', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
        },
      ],
    });
    const baseState = initialState(def, 14, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'deck:none': [
          token('c1', 'card', { suit: 'hearts' }),
          token('c2', 'card', { suit: 'clubs' }),
          token('c3', 'card', { suit: 'hearts' }),
        ],
      },
      reveals: {
        'deck:none': [
          { observers: 'all', filter: [{ prop: 'suit', op: 'eq', value: 'hearts' }] },
        ],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(0)));
    const deckZone = model.zones.find((zone) => zone.id === 'deck:none');
    expect(deckZone?.tokenIDs).toEqual(['c1', 'c3']);
    expect(deckZone?.hiddenTokenCount).toBe(1);
    expect(model.tokens.map((renderToken) => [renderToken.id, renderToken.faceUp])).toEqual([
      ['c1', true],
      ['c3', true],
    ]);
  });

  it('applies owner-zone reveal grants for specific non-owner observers only', () => {
    const def = compileFixture({
      minPlayers: 3,
      maxPlayers: 3,
      zones: [
        {
          id: 'hand',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
        },
      ],
    });
    const baseState = initialState(def, 15, 3);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'hand:0': [token('h0-a', 'card', { suit: 'hearts' }), token('h0-b', 'card', { suit: 'clubs' })],
      },
      reveals: {
        'hand:0': [
          { observers: [asPlayerId(1)], filter: [{ prop: 'suit', op: 'eq', value: 'hearts' }] },
        ],
      },
    };

    const observerModel = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(1)));
    const observerZone = observerModel.zones.find((zone) => zone.id === 'hand:0');
    expect(observerZone?.tokenIDs).toEqual(['h0-a']);
    expect(observerZone?.hiddenTokenCount).toBe(1);
    expect(observerModel.tokens.map((renderToken) => renderToken.id)).toEqual(['h0-a']);

    const otherModel = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(2)));
    const otherZone = otherModel.zones.find((zone) => zone.id === 'hand:0');
    expect(otherZone?.tokenIDs).toEqual([]);
    expect(otherZone?.hiddenTokenCount).toBe(2);
    expect(otherModel.tokens).toEqual([]);
  });

  it('fails closed for reveal filters with non-literal ValueExpr values', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
        },
      ],
    });
    const baseState = initialState(def, 16, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'deck:none': [token('c1', 'card', { rank: 1 })],
      },
      reveals: {
        'deck:none': [
          {
            observers: 'all',
            filter: [{ prop: 'rank', op: 'eq', value: { ref: 'gvar', var: 'tick' } }],
          },
        ],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(0)));
    const deckZone = model.zones.find((zone) => zone.id === 'deck:none');
    expect(deckZone?.tokenIDs).toEqual([]);
    expect(deckZone?.hiddenTokenCount).toBe(1);
    expect(model.tokens).toEqual([]);
  });

  it('ignores reveal grants for non-materialized zones', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
      ],
    });
    const baseState = initialState(def, 17, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'table:none': [token('t1')],
      },
      reveals: {
        'unknown-zone': [{ observers: 'all' }],
      },
    };

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(0)));
    const tableZone = model.zones.find((zone) => zone.id === 'table:none');
    expect(tableZone?.tokenIDs).toEqual(['t1']);
    expect(tableZone?.hiddenTokenCount).toBe(0);
    expect(model.tokens.map((renderToken) => renderToken.id)).toEqual(['t1']);
  });

  it('returns empty tokenIDs and zero hiddenTokenCount for empty zones across visibilities', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
        },
        {
          id: 'hand',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
        },
      ],
    });
    const state = initialState(def, 18, 2);

    const model = deriveRenderModel(state, def, makeRenderContext(state.playerCount, asPlayerId(1)));
    expect(model.zones.map((zone) => [zone.id, zone.tokenIDs, zone.hiddenTokenCount])).toEqual([
      ['table:none', [], 0],
      ['deck:none', [], 0],
      ['hand:0', [], 0],
      ['hand:1', [], 0],
    ]);
    expect(model.tokens).toEqual([]);
  });

  it('marks zones and tokens selectable when referenced by pending choice options', () => {
    const def = compileFixture({
      minPlayers: 2,
      maxPlayers: 2,
      zones: [
        {
          id: 'table',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
        },
      ],
    });
    const baseState = initialState(def, 19, 2);
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'table:none': [token('t1'), token('t2')],
      },
    };

    const zoneModel = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        selectedAction: asActionId('choose-zone'),
        choicePending: {
          kind: 'pending',
          complete: false,
          decisionId: 'targetZone',
          name: 'pick-target',
          type: 'chooseOne',
          options: ['table:none', 't2'],
        },
      }),
    );

    expect(zoneModel.zones.find((zone) => zone.id === 'table:none')?.isSelectable).toBe(true);
    expect(zoneModel.tokens.map((renderToken) => [renderToken.id, renderToken.isSelectable])).toEqual([
      ['t1', false],
      ['t2', false],
    ]);
    expect(zoneModel.zones.find((zone) => zone.id === 'table:none')?.isHighlighted).toBe(false);

    const tokenModel = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        selectedAction: asActionId('choose-token'),
        choicePending: {
          kind: 'pending',
          complete: false,
          decisionId: 'targetToken',
          name: 'pick-target',
          type: 'chooseOne',
          options: ['table:none', ['t2', asPlayerId(1)]],
        },
      }),
    );
    expect(tokenModel.zones.find((zone) => zone.id === 'table:none')?.isSelectable).toBe(false);
    expect(tokenModel.tokens.map((renderToken) => [renderToken.id, renderToken.isSelectable])).toEqual([
      ['t1', false],
      ['t2', true],
    ]);

    const composedDecisionIdModel = deriveRenderModel(
      state,
      def,
      makeRenderContext(state.playerCount, asPlayerId(0), {
        selectedAction: asActionId('choose-zone'),
        choicePending: {
          kind: 'pending',
          complete: false,
          decisionId: 'decision:internal::targetZone',
          name: 'pick-target',
          type: 'chooseOne',
          options: ['table:none'],
        },
      }),
    );
    expect(composedDecisionIdModel.zones.find((zone) => zone.id === 'table:none')?.isSelectable).toBe(true);
  });
});
