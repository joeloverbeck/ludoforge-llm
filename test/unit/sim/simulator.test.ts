import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  computeFullHash,
  createZobristTable,
  initialState,
  type Agent,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
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
}): GameDef => {
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
            phase: asPhaseId('p1'),
            params: [],
            pre: null,
            cost: [],
            effects: [{ addVar: { scope: 'global' as const, var: 'score', delta: 1 } }],
            limits: [{ scope: 'turn' as const, max: 1 }],
          },
          {
            id: asActionId('step2'),
            actor: 'active' as const,
            phase: asPhaseId('p2'),
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
            phase: asPhaseId('main'),
            params: [],
            pre: null,
            cost: [],
            effects: [{ addVar: { scope: 'global' as const, var: 'score', delta: 1 } }],
            limits: [],
          },
        ];

  return {
    metadata: { id: 'sim-run-game-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases, activePlayerOrder: 'roundRobin' },
    actions,
    triggers: [],
    endConditions:
      terminalAtScore === undefined
        ? []
        : [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: terminalAtScore }, result: { type: 'draw' } }],
  } as unknown as GameDef;
};

describe('runGame', () => {
  it('single-turn terminal game yields one move log and terminal stop reason', () => {
    const def = createDef({ terminalAtScore: 1 });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 10);

    assert.equal(trace.moves.length, 1);
    assert.notEqual(trace.result, null);
    assert.equal(trace.stopReason, 'terminal');
  });

  it('maxTurns=0 returns immediately with no moves and maxTurns stop reason', () => {
    const def = createDef({ terminalAtScore: 1 });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 0);

    assert.equal(trace.moves.length, 0);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'maxTurns');
  });

  it('truncates at maxTurns with null result and maxTurns stop reason', () => {
    const def = createDef();
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1);

    assert.equal(trace.moves.length, 1);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'maxTurns');
  });

  it('ends on no legal moves without synthetic logs', () => {
    const def = createDef({ withAction: false });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 5);

    assert.equal(trace.moves.length, 0);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'noLegalMoves');
  });

  it('throws descriptive errors for invalid seed, invalid maxTurns, and mismatched agent count', () => {
    const def = createDef();

    assert.throws(() => runGame(def, Number.NaN, [firstLegalAgent, firstLegalAgent], 1), /seed must be a safe integer/);
    assert.throws(() => runGame(def, 3, [firstLegalAgent, firstLegalAgent], -1), /maxTurns must be a non-negative safe integer/);
    assert.throws(() => runGame(def, 3, [firstLegalAgent], 1), /agents length must equal resolved player count/);
  });

  it('sets turnsCount from finalState.turnCount, not move log length', () => {
    const def = createDef({ twoPhaseLoop: true });
    const trace = runGame(def, 5, [firstLegalAgent, firstLegalAgent], 2);

    assert.equal(trace.moves.length, 2);
    assert.equal(trace.turnsCount, trace.finalState.turnCount);
    assert.notEqual(trace.turnsCount, trace.moves.length);
  });

  it('logs post-state hashes that match independent full-hash recomputation', () => {
    const def = createDef();
    const seed = 21;
    const trace = runGame(def, seed, [firstLegalAgent, firstLegalAgent], 3);

    const table = createZobristTable(def);
    let replayState = initialState(def, seed, 2);
    for (const moveLog of trace.moves) {
      replayState = applyMove(def, replayState, moveLog.move).state;
      assert.equal(moveLog.stateHash, replayState.stateHash);
      assert.equal(moveLog.stateHash, computeFullHash(table, replayState));
    }
  });

  it('does not bypass kernel legality checks when an agent selects an illegal move', () => {
    const illegalMoveAgent: Agent = {
      chooseMove(input) {
        const move: Move = { actionId: asActionId('unknown-action'), params: {} };
        return { move, rng: input.rng };
      },
    };

    const def = createDef();
    assert.throws(() => runGame(def, 9, [illegalMoveAgent, illegalMoveAgent], 1), /Illegal move/);
  });

  it('keeps selected event side/branch params in move logs for trace visibility', () => {
    const def: GameDef = {
      metadata: { id: 'sim-event-selection-trace', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
      actions: [
        {
          id: asActionId('event'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [
            { name: 'side', domain: { query: 'enums', values: ['unshaded', 'shaded'] } },
            { name: 'branch', domain: { query: 'enums', values: ['a', 'b'] } },
          ],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const sideBranchAgent: Agent = {
      chooseMove(input) {
        const selected = input.legalMoves.find(
          (move) => move.params.side === 'shaded' && move.params.branch === 'b',
        );
        if (selected === undefined) {
          throw new Error('expected shaded/b event move to be legal');
        }
        return { move: selected, rng: input.rng };
      },
    };

    const trace = runGame(def, 31, [sideBranchAgent, sideBranchAgent], 1);
    assert.deepEqual(trace.moves[0]?.move.params, { side: 'shaded', branch: 'b' });
  });
});
