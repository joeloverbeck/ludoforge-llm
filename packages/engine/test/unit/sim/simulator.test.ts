// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyDecision,
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  computeFullHash,
  createGameDefRuntime,
  enumerateLegalMoves,
  forkGameDefRuntimeForRun,
  createZobristTable,
  initialState,
  publishMicroturn,
  terminalResult,
  type Agent,
  type GameDef,
  type Move,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { extractMicroturnSnapshot } from '../../../src/sim/snapshot.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { firstLegalAgent } from '../../helpers/test-agents.js';

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
            limits: [{ id: 'step::turn::0', scope: 'turn' as const, max: 1 }],
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
        limits: [{ id: 'step::turn::0', scope: 'turn' as const, max: 1 }],
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

    assert.equal(trace.decisions.length, 1);
    assert.notEqual(trace.result, null);
    assert.equal(trace.stopReason, 'terminal');
  });

  it('maxTurns=0 returns immediately with no moves and maxTurns stop reason', () => {
    const def = createDef({ terminalAtScore: 1 });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 0);

    assert.equal(trace.decisions.length, 0);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'maxTurns');
  });

  it('truncates at maxTurns with null result and maxTurns stop reason', () => {
    const def = createDef();
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1);

    assert.equal(trace.decisions.length, 1);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'maxTurns');
  });

  it('ends on no legal moves without synthetic logs', () => {
    const def = createDef({ withAction: false });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 5);

    assert.equal(trace.decisions.length, 0);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'noLegalMoves');
  });

  it('can retain only final-state metadata when full trace logs are not needed', () => {
    const def = createDef({ terminalAtScore: 1 });
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 10, undefined, {
      traceRetention: 'finalStateOnly',
    });

    assert.equal(trace.decisions.length, 0);
    assert.equal(trace.compoundTurns.length, 0);
    assert.notEqual(trace.result, null);
    assert.equal(trace.stopReason, 'terminal');
    assert.equal(trace.finalState.globalVars.score, 1);
  });

  it('classifies GameDefRuntime members as sharedStructural or runLocal across forks', () => {
    const def = createDef({ terminalAtScore: 1 });
    const sharedRuntime = createGameDefRuntime(def);
    sharedRuntime.zobristTable.keyCache.set('score=1', 1n);
    sharedRuntime.publicationProbeCache.set('probe', true);
    const forkedRuntime = forkGameDefRuntimeForRun(sharedRuntime);

    const sharedStructuralRows = [
      ['adjacencyGraph', forkedRuntime.adjacencyGraph, sharedRuntime.adjacencyGraph],
      ['runtimeTableIndex', forkedRuntime.runtimeTableIndex, sharedRuntime.runtimeTableIndex],
      ['alwaysCompleteActionIds', forkedRuntime.alwaysCompleteActionIds, sharedRuntime.alwaysCompleteActionIds],
      ['firstDecisionDomains', forkedRuntime.firstDecisionDomains, sharedRuntime.firstDecisionDomains],
      ['ruleCardCache', forkedRuntime.ruleCardCache, sharedRuntime.ruleCardCache],
      ['compiledLifecycleEffects', forkedRuntime.compiledLifecycleEffects, sharedRuntime.compiledLifecycleEffects],
      ['zobristTable.seed', forkedRuntime.zobristTable.seed, sharedRuntime.zobristTable.seed],
      ['zobristTable.fingerprint', forkedRuntime.zobristTable.fingerprint, sharedRuntime.zobristTable.fingerprint],
      ['zobristTable.seedHex', forkedRuntime.zobristTable.seedHex, sharedRuntime.zobristTable.seedHex],
      ['zobristTable.sortedKeys', forkedRuntime.zobristTable.sortedKeys, sharedRuntime.zobristTable.sortedKeys],
    ] as const;

    for (const [label, actual, expected] of sharedStructuralRows) {
      assert.equal(actual, expected, `${label} should remain sharedStructural across forks`);
    }

    assert.notEqual(
      forkedRuntime.zobristTable.keyCache,
      sharedRuntime.zobristTable.keyCache,
      'zobristTable.keyCache should fork per run',
    );
    assert.equal(forkedRuntime.zobristTable.keyCache.size, 0);
    assert.equal(sharedRuntime.zobristTable.keyCache.size, 1);
    assert.notEqual(
      forkedRuntime.publicationProbeCache,
      sharedRuntime.publicationProbeCache,
      'publicationProbeCache should fork per run',
    );
    assert.equal(forkedRuntime.publicationProbeCache.size, 0);
    assert.equal(sharedRuntime.publicationProbeCache.size, 1);
  });

  it('treats shared runtime zobrist caches as per-run state', () => {
    const def = createDef({ terminalAtScore: 1 });
    const sharedRuntime = createGameDefRuntime(def);
    const first = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 10, undefined, undefined, sharedRuntime);
    const second = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 10, undefined, undefined, sharedRuntime);

    assert.equal(sharedRuntime.zobristTable.keyCache.size, 0);
    assert.equal(sharedRuntime.publicationProbeCache.size, 0);
    assert.equal(first.finalState.stateHash, second.finalState.stateHash);
    assert.equal(first.stopReason, second.stopReason);
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

  it('records turnsCount from finalState.turnCount', () => {
    const def = createDef({ twoPhaseLoop: true });
    const trace = runGame(def, 5, [firstLegalAgent, firstLegalAgent], 2);

    assert.equal(trace.decisions.length, 4);
    assert.equal(trace.turnsCount, trace.finalState.turnCount);
    assert.equal(trace.turnsCount, 2);
  });

  it('logs post-state hashes that match independent full-hash recomputation', () => {
    const def = createDef();
    const seed = 21;
    const trace = runGame(def, seed, [firstLegalAgent, firstLegalAgent], 3);

    const table = createZobristTable(def);
    let replayState = initialState(def, seed, 2).state;
    for (const moveLog of trace.decisions) {
      replayState = applyDecision(def, replayState, moveLog.decision).state;
      assert.equal(moveLog.stateHash, replayState.stateHash);
      assert.equal(moveLog.stateHash, computeFullHash(table, replayState));
    }
  });

  it('does not bypass kernel legality checks when an agent selects an illegal move', () => {
    const illegalMoveAgent = {
      chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
        const move: Move = { actionId: asActionId('unknown-action'), params: {} };
        return { decision: { kind: 'actionSelection', actionId: move.actionId, move }, rng: input.rng };
      },
    } as Agent;

    const def = createDef();
    assert.throws(
      () => runGame(def, 9, [illegalMoveAgent, illegalMoveAgent], 1),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && error.code === 'LEGAL_CHOICES_UNKNOWN_ACTION',
    );
  });

  it('does not swallow unrelated agent failures', () => {
    const explodingAgent: Agent = {
      chooseDecision() {
        throw new Error('unexpected agent failure');
      },
    };

    const def = createDef();
    assert.throws(() => runGame(def, 9, [explodingAgent, explodingAgent], 1), /unexpected agent failure/);
  });

  it('passes classified enumerated moves into the agent boundary', () => {
    const def = createDef();
    let observedLegalActionCount: number | null = null;

    const inspectingAgent = {
      chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
        observedLegalActionCount = input.microturn.legalActions.length;
        assert.ok(input.microturn.legalActions.length > 0);
        assert.deepEqual(input.microturn.legalActions.length, publishMicroturn(input.def, input.state, input.runtime).legalActions.length);
        return { decision: input.microturn.legalActions[0]!, rng: input.rng };
      },
    } as Agent;

    const trace = runGame(def, 13, [inspectingAgent, inspectingAgent], 1);

    if (observedLegalActionCount === null) {
      throw new Error('expected simulator to provide published legal actions to agent');
    }
    assert.equal(trace.decisions[0]?.legalActionCount, observedLegalActionCount);
  });

  it('captures a standard snapshot from the same pre-decision state the agent receives', () => {
    const def = createSnapshotDef();
    const runtime = createGameDefRuntime(def);
    const observedSnapshots: unknown[] = [];

    const snapshotAgent = {
      chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
        observedSnapshots.push(
          extractMicroturnSnapshot(def, input.state, publishMicroturn(def, input.state, runtime), runtime, 'standard'),
        );
        const decision = input.microturn.legalActions[0];
        if (decision === undefined) {
          throw new Error('snapshotAgent requires at least one legal action');
        }
        return { decision, rng: input.rng };
      },
    } as Agent;

    const trace = runGame(def, 17, [snapshotAgent, snapshotAgent], 1, 2, { snapshotDepth: 'standard' }, runtime);
    const snapshot = trace.decisions[0]?.snapshot;

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

    assert.equal(omittedTrace.decisions[0]?.snapshot, undefined);
    assert.equal(noneTrace.decisions[0]?.snapshot, undefined);
  });

  it('attaches verbose zone summaries when requested', () => {
    const def = createSnapshotDef();
    const trace = runGame(def, 17, [firstLegalAgent, firstLegalAgent], 1, 2, { snapshotDepth: 'verbose' });
    const snapshot = trace.decisions[0]?.snapshot;

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
    for (const moveLog of trace.decisions) {
      const enumerated = enumerateLegalMoves(def, replayState);
      assert.equal(moveLog.legalActionCount, enumerated.moves.length);

      const applied = applyDecision(def, replayState, moveLog.decision, undefined, runtime);
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
          limits: [{ id: 'event::turn::0', scope: 'turn' as const, max: 1 }],
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

    const sideBranchAgent = {
      chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
        const selected = input.microturn.legalActions.find(
          (decision) => decision.kind === 'actionSelection' && decision.move?.params.side === 'shaded' && decision.move?.params.branch === 'b',
        );
        if (selected === undefined) {
          throw new Error('expected shaded/b event move to be legal');
        }
        return { decision: selected, rng: input.rng };
      },
    } as Agent;

    const trace = runGame(def, 31, [sideBranchAgent, sideBranchAgent], 1);
    assert.equal(trace.decisions[0]?.decision.kind, 'actionSelection');
    assert.deepEqual(trace.decisions[0]?.decision.move?.params, {
      eventCardId: 'card-1',
      eventDeckId: 'deck-1',
      side: 'shaded',
      branch: 'b',
    });
  });
});
