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

function makeRenderContext(playerCount: number): RenderContext {
  return {
    playerID: asPlayerId(0),
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

    expect(model.tokens.map((renderToken) => renderToken.id)).toEqual(['t-table', 't-hand-0', 't-hand-1']);

    expect(model.tokens.find((renderToken) => renderToken.id === 't-table')?.ownerID).toBeNull();
    expect(model.tokens.find((renderToken) => renderToken.id === 't-hand-0')?.ownerID).toEqual(asPlayerId(0));
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
});
