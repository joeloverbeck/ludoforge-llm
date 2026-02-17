import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, type GameDef, type Move } from '@ludoforge/engine';

interface TestDefOptions {
  readonly gameId: string;
  readonly actionId: string;
  readonly zoneId: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
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

export const CHOOSE_N_TEST_DEF = (() => {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-worker-test-choose-n',
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
        id: 'pick-many',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
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
    throw new Error(`Expected chooseN GameDef fixture to compile: ${JSON.stringify(compiled.diagnostics)}`);
  }

  return compiled.gameDef;
})();

export const LEGAL_TICK_MOVE: Move = {
  actionId: asActionId('tick'),
  params: {},
};

export const ILLEGAL_MOVE: Move = {
  actionId: asActionId('missing-action'),
  params: {},
};
