// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTurnId,
  createGameDefRuntime,
  serializeGameState,
  serializeTrace,
} from '../../src/kernel/index.js';
import type { DecisionKey, DecisionStackFrame, GameState, GameTrace } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const FITL_PASSING_CANARY_SEEDS = [1005, 1013] as const;
// The FITL policy profiles are expensive enough that the former 200-turn
// replay corpus exceeded the dedicated determinism shard budget before
// producing subtest output. One full FITL turn still exercises a nontrivial
// microturn trace while keeping this file a bounded replay-identity witness.
const FITL_MAX_TURNS = 1;
const FITL_PLAYER_COUNT = 4;

const TEXAS_DETERMINISM_SEEDS = Array.from({ length: 10 }, (_, index) => 2000 + index);
const TEXAS_POLICY_MAX_TURNS = 200;
const TEXAS_POLICY_PLAYER_COUNT = 6;
const FITL_FALLBACK_INERT_REPRESENTATIVE_SEED = 1005;
const TEXAS_POLICY_REPRESENTATIVE_SEED = 2000;
const TEXAS_VERBOSE_POLICY_MAX_TURNS = 12;
const TEXAS_VERBOSE_POLICY_PLAYER_COUNT = 4;
const FITL_VERBOSE_POLICY_MAX_TURNS = 1;

const serializeFinalState = (state: Parameters<typeof serializeGameState>[0]): string =>
  JSON.stringify(serializeGameState(state));

const hasMicroturnOnlyDiagnostics = (decision: { readonly kind?: string } | undefined): boolean =>
  decision?.kind === 'policy'
  && !('completionStatistics' in decision)
  && !('movePreparations' in decision);

const makeNoLegalMovesStateWithSuspendedFrame = (): GameState => {
  const suspendedState: GameState = {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: {},
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x1n, 0x2n] },
    stateHash: 0x10n,
    _runningHash: 0x10n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
    reveals: undefined,
    globalMarkers: undefined,
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
    decisionStack: [],
    nextFrameId: asDecisionFrameId(0),
    nextTurnId: asTurnId(0),
    activeDeciderSeatId: asSeatId('0'),
  };
  const frame: DecisionStackFrame = {
    frameId: asDecisionFrameId(0),
    parentFrameId: null,
    turnId: asTurnId(1),
    context: {
      kind: 'chooseOne',
      seatId: asSeatId('0'),
      decisionKey: '$choice' as DecisionKey,
      options: [],
    },
    effectFrame: {
      programCounter: 1,
      boundedIterationCursors: {},
      localBindings: {},
      pendingTriggerQueue: [],
      suspendedFrame: {
        state: suspendedState,
        rng: { state: { algorithm: 'pcg-dxsm-128', version: 1, state: [0xabcn, 0xdefn] } },
        actorPlayer: asPlayerId(0),
        bindings: { selected: 'alpha' },
        leaf: {
          kind: 'chooseOne',
          decisionKey: '$choice' as DecisionKey,
          bind: '$choice',
          decisionScope: { iterationPath: 'root', counters: {} },
          bindingOptions: [{ comparable: 'alpha', binding: 'alpha' }],
        },
        resumeStack: [{ kind: 'sequence', effects: [] }],
      },
    },
  };

  return {
    ...suspendedState,
    stateHash: 0x20n,
    _runningHash: 0x20n,
    decisionStack: [frame],
    nextFrameId: asDecisionFrameId(1),
    nextTurnId: asTurnId(2),
  };
};

const makeNoLegalMovesTraceWithSuspendedFrame = (): GameTrace => ({
  gameDefId: 'spec-151-no-legal-moves',
  seed: 151,
  decisions: [],
  probeHoleRecoveries: [],
  recoveredFromProbeHole: 0,
  compoundTurns: [],
  finalState: makeNoLegalMovesStateWithSuspendedFrame(),
  result: null,
  turnsCount: 0,
  stopReason: 'noLegalMoves',
  traceProtocolVersion: 'spec-140',
});

describe('Spec 140 replay identity', () => {
  const fitlCompiled = compileProductionSpec();
  assertNoErrors(fitlCompiled.parsed);
  assertNoErrors(fitlCompiled.compiled);
  if (fitlCompiled.compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const fitlDef = assertValidatedGameDef(fitlCompiled.compiled.gameDef);
  const fitlRuntime = createGameDefRuntime(fitlDef);

  const texasCompiled = compileTexasProductionSpec();
  assertNoErrors(texasCompiled.parsed);
  assertNoErrors(texasCompiled.compiled);
  if (texasCompiled.compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef');
  }
  const texasDef = assertValidatedGameDef(texasCompiled.compiled.gameDef);
  const texasRuntime = createGameDefRuntime(texasDef);

  const runFitlPolicy = (seed: number) =>
    runGame(
      fitlDef,
      seed,
      FITL_POLICY_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      ),
      FITL_MAX_TURNS,
      FITL_PLAYER_COUNT,
      { skipDeltas: true },
      fitlRuntime,
    );

  const runFitlPolicyRepresentative = (seed: number) =>
    runGame(
      fitlDef,
      seed,
      FITL_POLICY_PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }),
      ),
      FITL_VERBOSE_POLICY_MAX_TURNS,
      FITL_PLAYER_COUNT,
      { skipDeltas: true },
      fitlRuntime,
    );

  const runTexasPolicy = (seed: number) =>
    runGame(
      texasDef,
      seed,
      Array.from({ length: TEXAS_POLICY_PLAYER_COUNT }, () => new PolicyAgent({ traceLevel: 'summary' })),
      TEXAS_POLICY_MAX_TURNS,
      TEXAS_POLICY_PLAYER_COUNT,
      { skipDeltas: true },
      texasRuntime,
    );

  const runTexasPolicyRepresentative = (seed: number) =>
    runGame(
      texasDef,
      seed,
      Array.from({ length: TEXAS_VERBOSE_POLICY_PLAYER_COUNT }, () => new PolicyAgent({ traceLevel: 'verbose' })),
      TEXAS_VERBOSE_POLICY_MAX_TURNS,
      TEXAS_VERBOSE_POLICY_PLAYER_COUNT,
      { skipDeltas: true },
      texasRuntime,
    );

  it('keeps the FITL passing canary corpus byte-identical under the current contract', () => {
    for (const seed of FITL_PASSING_CANARY_SEEDS) {
      const left = runFitlPolicy(seed);
      const right = runFitlPolicy(seed);
      assert.equal(left.traceProtocolVersion, 'spec-140');
      assert.deepEqual(left.decisions, right.decisions);
      assert.deepEqual(left.compoundTurns, right.compoundTurns);
      assert.equal(
        serializeFinalState(left.finalState),
        serializeFinalState(right.finalState),
        `FITL seed ${seed}: canonical serialized final state diverged`,
      );
    }
  });

  it('keeps the Texas determinism corpus byte-identical under the current contract', () => {
    for (const seed of TEXAS_DETERMINISM_SEEDS) {
      const left = runTexasPolicy(seed);
      const right = runTexasPolicy(seed);
      assert.equal(left.traceProtocolVersion, 'spec-140');
      assert.deepEqual(left.decisions, right.decisions);
      assert.deepEqual(left.compoundTurns, right.compoundTurns);
      assert.equal(
        serializeFinalState(left.finalState),
        serializeFinalState(right.finalState),
        `Texas seed ${seed}: canonical serialized final state diverged`,
      );
    }
  });

  it('keeps the representative FITL policy trace deterministic without legacy preparation diagnostics', () => {
    const trace = runFitlPolicyRepresentative(FITL_FALLBACK_INERT_REPRESENTATIVE_SEED);
    const rerun = runFitlPolicyRepresentative(FITL_FALLBACK_INERT_REPRESENTATIVE_SEED);

    assert.deepEqual(serializeTrace(trace), serializeTrace(rerun));
    assert.equal(
      serializeFinalState(trace.finalState),
      serializeFinalState(rerun.finalState),
      `FITL seed ${FITL_FALLBACK_INERT_REPRESENTATIVE_SEED}: representative verbose rerun diverged`,
    );
    assert.equal(trace.decisions.some((entry) => hasMicroturnOnlyDiagnostics(entry.agentDecision)), true);
  });

  it('keeps a representative Texas policy run deterministic without legacy preparation diagnostics', () => {
    const trace = runTexasPolicyRepresentative(TEXAS_POLICY_REPRESENTATIVE_SEED);
    const rerun = runTexasPolicyRepresentative(TEXAS_POLICY_REPRESENTATIVE_SEED);

    assert.equal(trace.decisions.length > 0, true, 'expected Texas representative run to emit moves');
    assert.equal(
      serializeFinalState(trace.finalState),
      serializeFinalState(rerun.finalState),
      'expected Texas representative run to remain byte-identical on rerun',
    );
    assert.equal(trace.decisions.some((entry) => hasMicroturnOnlyDiagnostics(entry.agentDecision)), true);
  });

  it('serializes a noLegalMoves stopped trace with a suspended final-state frame', () => {
    const trace = makeNoLegalMovesTraceWithSuspendedFrame();

    assert.equal(trace.stopReason, 'noLegalMoves');
    assert.equal((trace.finalState.decisionStack?.length ?? 0) > 0, true);
    const serialized = serializeTrace(trace);
    const stringified = JSON.stringify(serialized);
    assert.equal(stringified.length > 0, true);
  });
});
