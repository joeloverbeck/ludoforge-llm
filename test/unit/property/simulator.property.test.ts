import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertValidatedGameDef, asActionId, asPhaseId, type Agent, type ValidatedGameDef } from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';

const firstLegalAgent: Agent = {
  chooseMove(input) {
    const move = input.legalMoves[0];
    if (move === undefined) {
      throw new Error('firstLegalAgent requires at least one legal move');
    }
    return { move, rng: input.rng };
  },
};

const createDef = (options?: {
  readonly withAction?: boolean;
  readonly terminalAtScore?: number;
  readonly twoPhaseLoop?: boolean;
}): ValidatedGameDef => {
  const withAction = options?.withAction ?? true;
  const twoPhaseLoop = options?.twoPhaseLoop ?? false;
  const terminalAtScore = options?.terminalAtScore;

  const phases = twoPhaseLoop ? [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }] : [{ id: asPhaseId('main') }];
  const actions = !withAction
    ? []
    : twoPhaseLoop
      ? [
          {
            id: asActionId('step1'),
actor: 'active' as const,
executor: 'actor' as const,
phase: [asPhaseId('p1')],
            params: [],
            pre: null,
            cost: [],
            effects: [{ addVar: { scope: 'global' as const, var: 'score', delta: 1 } }],
            limits: [{ scope: 'turn' as const, max: 1 }],
          },
          {
            id: asActionId('step2'),
actor: 'active' as const,
executor: 'actor' as const,
phase: [asPhaseId('p2')],
            params: [],
            pre: null,
            cost: [],
            effects: [],
            limits: [{ scope: 'turn' as const, max: 1 }],
          },
        ]
      : [
          {
            id: asActionId('step'),
actor: 'active' as const,
executor: 'actor' as const,
phase: [asPhaseId('main')],
            params: [],
            pre: null,
            cost: [],
            effects: [{ addVar: { scope: 'global' as const, var: 'score', delta: 1 } }],
            limits: [],
          },
        ];

  return assertValidatedGameDef({
    metadata: { id: 'sim-property-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases },
    actions,
    triggers: [],
    terminal: {
      conditions:
        terminalAtScore === undefined
          ? []
          : [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: terminalAtScore }, result: { type: 'draw' } }],
    },
  } as const);
};

describe('simulator property-style invariants', () => {
  it('for deterministic generated cases, runGame terminates and preserves trace invariants', () => {
    const seeds = [1, 2, 7, 13, 29] as const;
    const maxTurnsCases = [0, 1, 2, 4, 8] as const;
    const defs = [
      createDef(),
      createDef({ terminalAtScore: 3 }),
      createDef({ withAction: false }),
      createDef({ twoPhaseLoop: true }),
    ];

    for (const def of defs) {
      for (const seed of seeds) {
        for (const maxTurns of maxTurnsCases) {
          const trace = runGame(def, seed, [firstLegalAgent, firstLegalAgent], maxTurns);
          assert.ok(trace.moves.length <= maxTurns);
          assert.equal(trace.turnsCount, trace.finalState.turnCount);

          for (const moveLog of trace.moves) {
            assert.ok(moveLog.legalMoveCount >= 1);
          }
        }
      }
    }
  });
});
