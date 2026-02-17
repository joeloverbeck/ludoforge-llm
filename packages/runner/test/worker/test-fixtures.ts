import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, type GameDef, type Move } from '@ludoforge/engine';

const makeTestDef = (): GameDef => {
  const doc = {
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-worker-test',
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
        id: 'table:none',
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

export const TEST_DEF = makeTestDef();

export const LEGAL_TICK_MOVE: Move = {
  actionId: asActionId('tick'),
  params: {},
};

export const ILLEGAL_MOVE: Move = {
  actionId: asActionId('missing-action'),
  params: {},
};
