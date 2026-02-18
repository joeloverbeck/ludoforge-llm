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
} from '@ludoforge/engine/runtime';

import { deriveRenderModel } from '../../src/model/derive-render-model.js';
import type { RenderContext } from '../../src/store/store-types.js';

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-derive-render-model-structural-sharing-test',
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

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    playerID: asPlayerId(0),
    legalMoveResult: { moves: [], warnings: [] },
    choicePending: null,
    selectedAction: asActionId('tick'),
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map([
      [asPlayerId(0), 'human' as const],
      [asPlayerId(1), 'human' as const],
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

describe('deriveRenderModel structural sharing', () => {
  it('reuses unchanged zone and token references across unrelated context changes', () => {
    const def = compileFixture();
    const base = initialState(def, 123, 2);
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

    const first = deriveRenderModel(state, def, makeContext(), null);
    const second = deriveRenderModel(
      state,
      def,
      makeContext({
        legalMoveResult: {
          moves: [],
          warnings: [{ code: 'EMPTY_QUERY_RESULT', message: 'unrelated change', context: {} }],
        },
      }),
      first,
    );

    expect(second.zones).toBe(first.zones);
    expect(second.tokens).toBe(first.tokens);
    expect(second.zones[0]).toBe(first.zones[0]);
    expect(second.tokens[0]).toBe(first.tokens[0]);
    expect(second.tokens[1]).toBe(first.tokens[1]);
  });

  it('replaces only changed token entities and preserves unchanged ones', () => {
    const def = compileFixture();
    const base = initialState(def, 123, 2);
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

    const first = deriveRenderModel(stateA, def, makeContext(), null);
    const second = deriveRenderModel(stateB, def, makeContext(), first);

    const firstTokenOne = first.tokens.find((entry) => entry.id === 'token:1');
    const firstTokenTwo = first.tokens.find((entry) => entry.id === 'token:2');
    const secondTokenOne = second.tokens.find((entry) => entry.id === 'token:1');
    const secondTokenTwo = second.tokens.find((entry) => entry.id === 'token:2');

    expect(firstTokenOne).toBeDefined();
    expect(firstTokenTwo).toBeDefined();
    expect(secondTokenOne).toBeDefined();
    expect(secondTokenTwo).toBeDefined();

    expect(secondTokenOne).not.toBe(firstTokenOne);
    expect(secondTokenTwo).toBe(firstTokenTwo);
  });
});
