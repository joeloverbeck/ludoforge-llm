import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  computeFullHash,
  createGameDefRuntime,
  enumerateLegalMoves,
  createZobristTable,
  initialState,
  terminalResult,
  type Agent,
  type ClassifiedMove,
  type GameDef,
  type Move,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { extractDecisionPointSnapshot } from '../../../src/sim/snapshot.js';
import { trustedMove } from '../../helpers/classified-move-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const firstLegalAgent: Agent = {
  chooseMove(input) {
    const move = input.legalMoves[0]?.move;
    if (move === undefined) {
      throw new Error('firstLegalAgent requires at least one legal move');
    }
    return { move: trustedMove(move, input.state.stateHash), rng: input.rng };
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
            effects: [eff({ addVar: { scope: 'global' as const, var: 'score', delta: 1 } })],
            limits: [{ id: 'step1::turn::0', scope: 'turn' as const, max: 1 }],
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
            limits: [{ id: 'step2::turn::0', scope: 'turn' as const, max: 1 }],
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
            effects: [eff({ addVar: { scope: 'global' as const, var: 'score', delta: 1 } })],
            limits: [],
          },
        ];

  return assertValidatedGameDef({
    metadata: { id: 'sim-run-game-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
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
          : [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: terminalAtScore }, result: { type: 'draw' } }],
    },
  } as const);
};

const createSnapshotDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'sim-snapshot-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    seats: [{ id: 'A' }, { id: 'B' }],
    globalVars: [
      { name: 'score', type: 'int', init: 7, min: 0, max: 99 },
      { name: 'swing', type: 'int', init: 3, min: -99, max: 99 },
    ],
    perPlayerVars: [{ name: 'influence', type: 'int', init: 4, min: 0, max: 99 }],
    zoneVars: [{ name: 'pressure', type: 'int', init: 2, min: 0, max: 99 }],
    zones: [
      { id: asZoneId('board-a:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('board-b:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('reserve:none'), zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'piece', seat: 'A', props: { faction: 'string' } }],
    setup: [
      eff({ createToken: { type: 'piece', zone: asZoneId('board-a:none'), props: { faction: 'A' } } }),
      eff({ createToken: { type: 'piece', zone: asZoneId('board-a:none'), props: { faction: 'A' } } }),
      eff({ createToken: { type: 'piece', zone: asZoneId('board-a:none'), props: { faction: 'B' } } }),
      eff({ createToken: { type: 'piece', zone: asZoneId('board-b:none'), props: { faction: 'A' } } }),
      eff({ createToken: { type: 'piece', zone: asZoneId('board-b:none'), props: { faction: 'B' } } }),
      eff({ createToken: { type: 'piece', zone: asZoneId('reserve:none'), props: { faction: 'A' } } }),
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('step'),
actor: 'active',
executor: 'actor' as const,
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global' as const, var: 'score', delta: 1 } })],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        {
          seat: 'A',
          value: {
            _t: 6 as const,
            op: '+',
            left: { _t: 2 as const, ref: 'gvar', var: 'score' },
            right: { _t: 2 as const, ref: 'gvar', var: 'swing' },
          },
        },
        {
          seat: 'B',
          value: {
            _t: 6 as const,
            op: '-',
            left: { _t: 2 as const, ref: 'gvar', var: 'score' },
            right: 2,
          },
        },
      ],
    },
    victoryStandings: {
      seatGroupConfig: {
        coinSeats: ['A'],
        insurgentSeats: ['B'],
        soloSeat: 'B',
        seatProp: 'faction',
      },
      markerConfigs: {
        support: {
          activeState: 'active',
          passiveState: 'passive',
        },
      },
      markerName: 'support',
      defaultMarkerState: 'neutral',
      entries: [
        {
          seat: 'A',
          threshold: 0,
          formula: { type: 'controlledPopulationPlusGlobalVar', controlFn: 'coin', varName: 'score' },
        },
        {
          seat: 'B',
          threshold: 0,
          formula: { type: 'controlledPopulationPlusGlobalVar', controlFn: 'coin', varName: 'score' },
        },
      ],
      tieBreakOrder: ['A', 'B'],
    },
  } as const);

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

  it('rejects invalid unvalidated GameDef payloads at simulator boundary', () => {
    const invalidDef = {
      ...createDef(),
      actions: [
        {
          ...createDef().actions[0],
          phase: asPhaseId('missing-phase'),
        },
      ],
    } as unknown as GameDef;

    assert.throws(
      () => runGame(invalidDef as unknown as ValidatedGameDef, 3, [firstLegalAgent, firstLegalAgent], 1),
      /Invalid GameDef: validation failed/,
    );
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
    let replayState = initialState(def, seed, 2).state;
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
        return { move: trustedMove(move, input.state.stateHash), rng: input.rng };
      },
    };

    const def = createDef();
    assert.throws(() => runGame(def, 9, [illegalMoveAgent, illegalMoveAgent], 1), /Illegal move/);
  });

  it('does not swallow unrelated agent failures', () => {
    const explodingAgent: Agent = {
      chooseMove() {
        throw new Error('unexpected agent failure');
      },
    };

    const def = createDef();
    assert.throws(() => runGame(def, 9, [explodingAgent, explodingAgent], 1), /unexpected agent failure/);
  });

  it('passes classified enumerated moves into the agent boundary', () => {
    const def = createDef();
    let observedLegalMoves: readonly ClassifiedMove[] | null = null;

    const inspectingAgent: Agent = {
      chooseMove(input) {
        observedLegalMoves = input.legalMoves;
        assert.ok(input.legalMoves.length > 0);
        assert.ok('move' in input.legalMoves[0]!);
        assert.ok('viability' in input.legalMoves[0]!);
        assert.deepEqual(input.legalMoves, enumerateLegalMoves(input.def, input.state, undefined, input.runtime).moves);
        return { move: input.legalMoves[0]!.trustedMove ?? trustedMove(input.legalMoves[0]!.move, input.state.stateHash), rng: input.rng };
      },
    };

    const trace = runGame(def, 13, [inspectingAgent, inspectingAgent], 1);

    let classifiedMoves: readonly ClassifiedMove[];
    if (observedLegalMoves === null) {
      throw new Error('expected simulator to provide classified legal moves to agent');
    }
    classifiedMoves = observedLegalMoves;
    assert.equal(trace.moves[0]?.legalMoveCount, classifiedMoves.length);
  });

  it('captures a standard snapshot from the same pre-decision state the agent receives', () => {
    const def = createSnapshotDef();
    const runtime = createGameDefRuntime(def);
    const observedSnapshots: unknown[] = [];

    const snapshotAgent: Agent = {
      chooseMove(input) {
        observedSnapshots.push(extractDecisionPointSnapshot(def, input.state, runtime, 'standard'));
        const move = input.legalMoves[0]?.move;
        if (move === undefined) {
          throw new Error('snapshotAgent requires at least one legal move');
        }
        return { move: trustedMove(move, input.state.stateHash), rng: input.rng };
      },
    };

    const trace = runGame(def, 17, [snapshotAgent, snapshotAgent], 1, 2, { snapshotDepth: 'standard' }, runtime);
    const snapshot = trace.moves[0]?.snapshot;

    assert.deepEqual(snapshot, observedSnapshots[0]);
    assert.equal(snapshot?.turnCount, 0);
    assert.equal(snapshot?.phaseId, asPhaseId('main'));
    assert.equal(snapshot?.activePlayer, asPlayerId(0));
    assert.deepEqual(snapshot?.seatStandings, [
      { seat: 'A', margin: 10, perPlayerVars: { influence: 4 }, tokenCountOnBoard: 3 },
      { seat: 'B', margin: 5, perPlayerVars: { influence: 4 }, tokenCountOnBoard: 2 },
    ]);
    assert.ok(snapshot !== undefined && 'globalVars' in snapshot);
    assert.deepEqual(snapshot.globalVars, { score: 7, swing: 3 });
  });

  it('omits snapshots when snapshotDepth is omitted or none', () => {
    const def = createSnapshotDef();

    const omittedTrace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1);
    const noneTrace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1, 2, { snapshotDepth: 'none' });

    assert.equal(omittedTrace.moves[0]?.snapshot, undefined);
    assert.equal(noneTrace.moves[0]?.snapshot, undefined);
  });

  it('attaches verbose zone summaries when requested', () => {
    const def = createSnapshotDef();
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1, 2, { snapshotDepth: 'verbose' });
    const snapshot = trace.moves[0]?.snapshot;

    assert.ok(snapshot !== undefined && 'zoneSummaries' in snapshot);
    assert.deepEqual(snapshot.zoneSummaries, [
      {
        zoneId: asZoneId('board-a:none'),
        zoneVars: { pressure: 2 },
        tokenCountBySeat: { A: 2, B: 1 },
      },
      {
        zoneId: asZoneId('board-b:none'),
        zoneVars: { pressure: 2 },
        tokenCountBySeat: { A: 1, B: 1 },
      },
    ]);
  });

  it('matches a validated replay when simulator uses trusted execution', () => {
    const def = createDef({ terminalAtScore: 3 });
    const seed = 29;
    const runtime = createGameDefRuntime(def);
    const trace = runGame(def, seed, [firstLegalAgent, firstLegalAgent], 10);

    let replayState = initialState(def, seed, 2).state;
    for (const moveLog of trace.moves) {
      const enumerated = enumerateLegalMoves(def, replayState);
      assert.equal(moveLog.legalMoveCount, enumerated.moves.length);

      const applied = applyMove(def, replayState, moveLog.move, undefined, runtime);
      assert.deepEqual(applied.triggerFirings, moveLog.triggerFirings);
      assert.deepEqual(applied.warnings, moveLog.warnings);
      replayState = applied.state;

      assert.equal(moveLog.stateHash, replayState.stateHash);
    }

    assert.deepEqual(trace.finalState, replayState);
    assert.deepEqual(trace.result, terminalResult(def, replayState));
  });

  it('keeps selected event side/branch params in move logs for trace visibility', () => {
    const def = assertValidatedGameDef({
      metadata: { id: 'sim-event-selection-trace', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: {} }],
      setup: [
        eff({
          createToken: {
            type: 'card',
            zone: asZoneId('played:none'),
            props: { cardId: 'card-1' },
          },
        }),
      ],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor' as const,
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
      eventDecks: [
        {
          id: 'deck-1',
          drawZone: asZoneId('deck:none'),
          discardZone: asZoneId('played:none'),
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'dual',
              unshaded: { effects: [], branches: [{ id: 'a' }, { id: 'b' }] },
              shaded: { effects: [], branches: [{ id: 'a' }, { id: 'b' }] },
            },
          ],
        },
      ],
    } as const);

    const sideBranchAgent: Agent = {
      chooseMove(input) {
        const selected = input.legalMoves.find(
          ({ move }) => move.params.side === 'shaded' && move.params.branch === 'b',
        );
        if (selected === undefined) {
          throw new Error('expected shaded/b event move to be legal');
        }
        return { move: selected.trustedMove ?? trustedMove(selected.move, input.state.stateHash), rng: input.rng };
      },
    };

    const trace = runGame(def, 31, [sideBranchAgent, sideBranchAgent], 1);
    assert.deepEqual(trace.moves[0]?.move.params, {
      eventCardId: 'card-1',
      eventDeckId: 'deck-1',
      side: 'shaded',
      branch: 'b',
    });
  });
});
