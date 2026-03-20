import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createHumanSeatController } from '../../src/seat/seat-controller.js';
import type { RenderContext } from '../../src/store/store-types.js';
import { deriveProjectedRenderModel } from './helpers/derive-projected-render-model.js';

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-project-render-model-structural-sharing-test',
      players: {
        min: 2,
        max: 2,
      },
    },
    globalVars: [
      {
        name: 'tick',
        type: 'int',
        init: 0,
        min: 0,
        max: 1000,
      },
    ],
    zones: [
      {
        id: 'table',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
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

function compileShowdownFixture(): GameDef {
  const base = compileFixture();
  return {
    ...base,
    perPlayerVars: [
      ...base.perPlayerVars,
      {
        name: 'showdownScore',
        type: 'int',
        init: 0,
        min: 0,
        max: 10_000_000,
      },
    ],
    zones: [
      ...base.zones,
      {
        id: asZoneId('community:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
      },
      {
        id: asZoneId('hand:0'),
        owner: 'player',
        ownerPlayerIndex: 0,
        visibility: 'owner',
        ordering: 'set',
      },
      {
        id: asZoneId('hand:1'),
        owner: 'player',
        ownerPlayerIndex: 1,
        visibility: 'owner',
        ordering: 'set',
      },
    ],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }, { id: asPhaseId('showdown') }],
    },
  };
}

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    playerID: asPlayerId(0),
    legalMoveResult: { moves: [], warnings: [] },
    choicePending: null,
    selectedAction: asActionId('tick'),
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map([
      [asPlayerId(0), createHumanSeatController()],
      [asPlayerId(1), createHumanSeatController()],
    ]),
    terminal: null,
    ...overrides,
  };
}

function token(id: string, props: Token['props'] = {}): Token {
  return {
    id: asTokenId(id),
    type: 'piece',
    props,
  };
}

describe('projectRenderModel structural sharing', () => {
  it('reuses unchanged zone and token references across unrelated context changes', () => {
    const def = compileFixture();
    const base = initialState(def, 123, 2).state;
    const state: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'table:none': [
          token('token:1', { strength: 2 }),
          token('token:2', { strength: 1 }),
        ],
      },
    };

    const first = deriveProjectedRenderModel(state, def, makeContext());
    const second = deriveProjectedRenderModel(
      state,
      def,
      makeContext({
        legalMoveResult: {
          moves: [],
          warnings: [{ code: 'EMPTY_QUERY_RESULT', message: 'unrelated change', context: {} }],
        },
      }),
      { previous: first },
    );

    expect(second.model.zones).toBe(first.model.zones);
    expect(second.model.tokens).toBe(first.model.tokens);
    expect(second.model.surfaces).toBe(first.model.surfaces);
    expect(second.model.zones[0]).toBe(first.model.zones[0]);
    expect(second.model.tokens[0]).toBe(first.model.tokens[0]);
    expect(second.model.tokens[1]).toBe(first.model.tokens[1]);
  });

  it('replaces only changed token entities and preserves unchanged ones', () => {
    const def = compileFixture();
    const base = initialState(def, 123, 2).state;
    const stateA: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'table:none': [
          token('token:1', { strength: 2 }),
          token('token:2', { strength: 1 }),
        ],
      },
    };
    const stateB: GameState = {
      ...stateA,
      zones: {
        ...stateA.zones,
        'table:none': [
          token('token:1', { strength: 3 }),
          token('token:2', { strength: 1 }),
        ],
      },
    };

    const first = deriveProjectedRenderModel(stateA, def, makeContext());
    const second = deriveProjectedRenderModel(stateB, def, makeContext(), { previous: first });

    const firstTokenOne = first.model.tokens.find((entry) => entry.id === 'token:1');
    const firstTokenTwo = first.model.tokens.find((entry) => entry.id === 'token:2');
    const secondTokenOne = second.model.tokens.find((entry) => entry.id === 'token:1');
    const secondTokenTwo = second.model.tokens.find((entry) => entry.id === 'token:2');

    expect(firstTokenOne).toBeDefined();
    expect(firstTokenTwo).toBeDefined();
    expect(secondTokenOne).toBeDefined();
    expect(secondTokenTwo).toBeDefined();

    expect(secondTokenOne).not.toBe(firstTokenOne);
    expect(secondTokenTwo).toBe(firstTokenTwo);
  });

  it('reuses the showdown surface reference when the projected showdown output is unchanged', () => {
    const def = compileShowdownFixture();
    const base = initialState(def, 123, 2).state;
    const state: GameState = {
      ...base,
      currentPhase: asPhaseId('showdown'),
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0'], showdownScore: 8500000 },
        '1': { ...base.perPlayerVars['1'], showdownScore: 3200000 },
      },
      zones: {
        ...base.zones,
        'community:none': [
          token('tok:c1', { rank: 'A', suit: 'hearts' }),
          token('tok:c2', { rank: 'K', suit: 'spades' }),
        ],
        'hand:0': [
          token('tok:h0a', { rank: 'J', suit: 'clubs' }),
          token('tok:h0b', { rank: 'J', suit: 'diamonds' }),
        ],
        'hand:1': [
          token('tok:h1a', { rank: '9', suit: 'clubs' }),
          token('tok:h1b', { rank: '8', suit: 'diamonds' }),
        ],
      },
    };
    const visualConfigProvider = new VisualConfigProvider({
      version: 1,
      runnerSurfaces: {
        showdown: {
          when: { phase: 'showdown' },
          ranking: {
            source: {
              kind: 'perPlayerVar',
              name: 'showdownScore',
            },
            hideZeroScores: false,
          },
          communityCards: {
            zones: ['community:none'],
          },
          playerCards: {
            zones: ['hand:0', 'hand:1'],
          },
        },
      },
    });

    const first = deriveProjectedRenderModel(state, def, makeContext(), {
      visualConfigProvider,
    });
    const second = deriveProjectedRenderModel(
      state,
      def,
      makeContext({
        legalMoveResult: {
          moves: [],
          warnings: [{ code: 'EMPTY_QUERY_RESULT', message: 'unrelated change', context: {} }],
        },
      }),
      {
        previous: first,
        visualConfigProvider,
      },
    );

    expect(first.model.surfaces.showdown).not.toBeNull();
    expect(second.model.surfaces).toBe(first.model.surfaces);
    expect(second.model.surfaces.showdown).toBe(first.model.surfaces.showdown);
  });
});
