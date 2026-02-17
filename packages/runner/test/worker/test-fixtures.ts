import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, type GameDef, type Move } from '@ludoforge/engine';

interface TestDefOptions {
  readonly gameId: string;
  readonly actionId: string;
  readonly zoneId: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

interface ProgressiveTestDefOptions {
  readonly gameId: string;
  readonly actionId: string;
  readonly effects: readonly ({ readonly chooseOne: unknown } | { readonly chooseN: unknown })[];
}

const makeTestDef = (options: TestDefOptions): GameDef => {
  const doc = {
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: options.gameId,
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
        max: 100,
      },
    ],
    zones: [
      {
        id: options.zoneId,
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
        id: options.actionId,
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
  };

  const compiled = compileGameSpecToGameDef(doc);
  if (compiled.gameDef === null) {
    throw new Error(`Expected test GameDef to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.gameDef;
};

export const TEST_DEF = makeTestDef({
  gameId: 'runner-worker-test',
  actionId: 'tick',
  zoneId: 'table:none',
  minPlayers: 2,
  maxPlayers: 2,
});

export const ALT_TEST_DEF = makeTestDef({
  gameId: 'runner-worker-test-alt',
  actionId: 'tick-alt',
  zoneId: 'table:alt',
  minPlayers: 3,
  maxPlayers: 3,
});

export const RANGE_TEST_DEF = makeTestDef({
  gameId: 'runner-worker-test-range',
  actionId: 'tick-range',
  zoneId: 'table:range',
  minPlayers: 2,
  maxPlayers: 4,
});

const makeProgressiveTestDef = (options: ProgressiveTestDefOptions): GameDef => {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: options.gameId,
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
        max: 100,
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
        id: options.actionId,
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: options.effects,
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
    throw new Error(`Expected progressive GameDef fixture to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }

  return compiled.gameDef;
};

export const CHOOSE_N_TEST_DEF = makeProgressiveTestDef({
  gameId: 'runner-worker-test-choose-n',
  actionId: 'pick-many',
  effects: [
    {
      chooseN: {
        bind: '$targets',
        options: {
          query: 'enums',
          values: ['a', 'b', 'c'],
        },
        min: 1,
        max: 2,
      },
    },
  ],
});

export const CHOOSE_ONE_TEST_DEF = makeProgressiveTestDef({
  gameId: 'runner-worker-test-choose-one',
  actionId: 'pick-one',
  effects: [
    {
      chooseOne: {
        bind: '$target',
        options: {
          query: 'enums',
          values: ['a', 'b', 'c'],
        },
      },
    },
  ],
});

export const CHOOSE_MIXED_TEST_DEF = makeProgressiveTestDef({
  gameId: 'runner-worker-test-choose-mixed',
  actionId: 'pick-mixed',
  effects: [
    {
      chooseOne: {
        bind: '$single',
        options: {
          query: 'enums',
          values: ['x', 'y'],
        },
      },
    },
    {
      chooseN: {
        bind: '$many',
        options: {
          query: 'enums',
          values: ['m1', 'm2', 'm3'],
        },
        min: 1,
        max: 2,
      },
    },
  ],
});

export const LEGAL_TICK_MOVE: Move = {
  actionId: asActionId('tick'),
  params: {},
};

export const ILLEGAL_MOVE: Move = {
  actionId: asActionId('missing-action'),
  params: {},
};
