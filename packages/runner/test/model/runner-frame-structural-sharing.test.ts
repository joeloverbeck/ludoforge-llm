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

import { deriveRunnerFrame } from '../../src/model/derive-runner-frame.js';
import { createHumanSeatController } from '../../src/seat/seat-controller.js';
import type { RenderContext } from '../../src/store/store-types.js';

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-frame-structural-sharing-test',
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
    selectedActionId: asActionId('tick'),
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

describe('deriveRunnerFrame structural sharing', () => {
  it('reuses unchanged semantic frame and projection-source references across unrelated context changes', () => {
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

    const first = deriveRunnerFrame(state, def, makeContext(), null);
    const second = deriveRunnerFrame(
      state,
      def,
      makeContext({
        legalMoveResult: {
          moves: [],
          warnings: [{ code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED', message: 'unrelated change', context: {} }],
        },
      }),
      first,
    );

    expect(second.frame.zones).toBe(first.frame.zones);
    expect(second.frame.tokens).toBe(first.frame.tokens);
    expect(second.frame.zones[0]).toBe(first.frame.zones[0]);
    expect(second.frame.tokens[0]).toBe(first.frame.tokens[0]);
    expect(second.frame.tokens[1]).toBe(first.frame.tokens[1]);
    expect(second.source.globalVars).toBe(first.source.globalVars);
    expect(second.source.playerVars).toBe(first.source.playerVars);
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

    const first = deriveRunnerFrame(stateA, def, makeContext(), null);
    const second = deriveRunnerFrame(stateB, def, makeContext(), first);

    const firstTokenOne = first.frame.tokens.find((entry) => entry.id === 'token:1');
    const firstTokenTwo = first.frame.tokens.find((entry) => entry.id === 'token:2');
    const secondTokenOne = second.frame.tokens.find((entry) => entry.id === 'token:1');
    const secondTokenTwo = second.frame.tokens.find((entry) => entry.id === 'token:2');

    expect(firstTokenOne).toBeDefined();
    expect(firstTokenTwo).toBeDefined();
    expect(secondTokenOne).toBeDefined();
    expect(secondTokenTwo).toBeDefined();

    expect(secondTokenOne).not.toBe(firstTokenOne);
    expect(secondTokenTwo).toBe(firstTokenTwo);
  });
});
