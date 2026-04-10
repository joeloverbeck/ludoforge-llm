import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyMove,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
  type ClassifiedMove,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type PolicyDecision = Extract<ReturnType<PolicyAgent['chooseMove']>['agentDecision'], { kind: 'policy' }>;
type VerbosePolicyCandidate = NonNullable<NonNullable<PolicyDecision['candidates']>[number]>;

interface ArvnDecisionTrace {
  readonly seed: number;
  readonly ply: number;
  readonly state: GameState;
  readonly legalMoves: readonly ClassifiedMove[];
  readonly result: ReturnType<PolicyAgent['chooseMove']>;
}

interface Phase1Witness extends ArvnDecisionTrace {
  readonly templateCandidates: readonly VerbosePolicyCandidate[];
  readonly projectedMarginsByAction: ReadonlyMap<string, number>;
}

const PHASE1_WITNESS_MAX_SEED = 12;
const PHASE1_WITNESS_MAX_PLY = 18;
const PERF_ITERATIONS = 12;

function createFitlDef(enableArvnPhase1: boolean): GameDef {
  const { compiled } = compileProductionSpec();
  const baseline = structuredClone(assertValidatedGameDef(compiled.gameDef));
  const agents = baseline.agents;
  assert.notEqual(agents, undefined, 'expected FITL production GameDef to expose agent catalog');

  const arvnProfileId = agents!.bindingsBySeat['arvn'];
  assert.notEqual(arvnProfileId, undefined, 'expected ARVN seat to have a bound policy profile');
  const arvnProfile = agents!.profiles[arvnProfileId!];
  assert.notEqual(arvnProfile, undefined, `expected bound ARVN profile "${String(arvnProfileId)}" to exist`);

  if (!enableArvnPhase1) {
    return baseline;
  }

  return {
    ...baseline,
    agents: {
      ...agents!,
      profiles: {
        ...agents!.profiles,
        [arvnProfileId!]: {
          ...arvnProfile!,
          preview: {
            ...arvnProfile!.preview,
            phase1: true,
            phase1CompletionsPerAction: 1,
          },
        },
      },
    },
  };
}

function requirePolicyDecision(result: ReturnType<PolicyAgent['chooseMove']>): PolicyDecision {
  assert.equal(result.agentDecision?.kind, 'policy');
  if (result.agentDecision?.kind !== 'policy') {
    assert.fail('expected policy decision trace');
  }
  return result.agentDecision;
}

function requireVerboseCandidates(result: ReturnType<PolicyAgent['chooseMove']>): readonly VerbosePolicyCandidate[] {
  const decision = requirePolicyDecision(result);
  if (decision.candidates === undefined) {
    assert.fail('expected verbose policy candidates');
  }
  return decision.candidates;
}

function projectedSelfMarginContribution(candidate: VerbosePolicyCandidate): number {
  const scoreContributions = candidate.scoreContributions;
  if (scoreContributions === undefined) {
    assert.fail(`expected score contributions for ${candidate.stableMoveKey}`);
  }
  const contribution = scoreContributions.find((entry) =>
    entry.termId === 'preferProjectedSelfMargin' || entry.termId === 'preferNormalizedMargin',
  );
  assert.notEqual(
    contribution,
    undefined,
    `expected projected margin contribution for ${candidate.stableMoveKey}`,
  );
  return contribution!.contribution;
}

function maybeProjectedSelfMarginContribution(candidate: VerbosePolicyCandidate): number | null {
  const scoreContributions = candidate.scoreContributions;
  if (scoreContributions === undefined) {
    return null;
  }
  const contribution = scoreContributions.find((entry) =>
    entry.termId === 'preferProjectedSelfMargin' || entry.termId === 'preferNormalizedMargin',
  );
  return contribution?.contribution ?? null;
}

function templateActionIds(def: GameDef): ReadonlySet<string> {
  return new Set((def.actionPipelines ?? []).map((pipeline) => String(pipeline.actionId)));
}

function templateCandidatesWithProjectedMargins(
  def: GameDef,
  candidates: readonly VerbosePolicyCandidate[],
): {
  readonly templateCandidates: readonly VerbosePolicyCandidate[];
  readonly projectedMarginsByAction: ReadonlyMap<string, number>;
} {
  const actionIds = templateActionIds(def);
  const templateCandidates = candidates.filter((candidate) => actionIds.has(candidate.actionId));
  const projectedMarginsByAction = new Map<string, number>();

  for (const candidate of templateCandidates) {
    if (projectedMarginsByAction.has(candidate.actionId)) {
      continue;
    }
    projectedMarginsByAction.set(candidate.actionId, projectedSelfMarginContribution(candidate));
  }

  return { templateCandidates, projectedMarginsByAction };
}

function traceArvnDecisionAtPly(
  def: GameDef,
  seed: number,
  targetPly: number,
): ArvnDecisionTrace {
  const runtime = createGameDefRuntime(def);
  const agents = Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'verbose' }));
  let state = initialState(def, seed, 4).state;

  for (let ply = 0; ply <= targetPly; ply += 1) {
    const legalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const result = agents[Number(state.activePlayer)]!.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves,
      rng: createRng(BigInt(seed * 1000 + ply)),
      runtime,
    });

    if (ply === targetPly) {
      return { seed, ply, state, legalMoves, result };
    }

    state = applyMove(def, state, result.move, undefined, runtime).state;
  }

  assert.fail(`Expected to reach seed ${seed} ply ${targetPly}`);
}

function findArvnPhase1Witness(def: GameDef): Phase1Witness {
  for (let seed = 1; seed <= PHASE1_WITNESS_MAX_SEED; seed += 1) {
    const runtime = createGameDefRuntime(def);
    const agents = Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'verbose' }));
    let state = initialState(def, seed, 4).state;

    for (let ply = 0; ply <= PHASE1_WITNESS_MAX_PLY; ply += 1) {
      const legalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
      const result = agents[Number(state.activePlayer)]!.chooseMove({
        def,
        state,
        playerId: state.activePlayer,
        legalMoves,
        rng: createRng(BigInt(seed * 1000 + ply)),
        runtime,
      });

      const activeSeatId = def.seats?.[Number(state.activePlayer)]?.id;
      if (activeSeatId === 'arvn') {
        const candidates = requireVerboseCandidates(result);
        const { templateCandidates, projectedMarginsByAction } = templateCandidatesWithProjectedMargins(def, candidates);
        const uniqueProjectedMargins = new Set(projectedMarginsByAction.values());
        if (templateCandidates.length >= 2 && projectedMarginsByAction.size >= 2 && uniqueProjectedMargins.size >= 2) {
          return {
            seed,
            ply,
            state,
            legalMoves,
            result,
            templateCandidates,
            projectedMarginsByAction,
          };
        }
      }

      state = applyMove(def, state, result.move, undefined, runtime).state;
    }
  }

  assert.fail(
    `Expected a bounded ARVN witness within seeds 1-${PHASE1_WITNESS_MAX_SEED} and plies 0-${PHASE1_WITNESS_MAX_PLY}`,
  );
}

function canonicalPhase1Snapshot(result: ReturnType<PolicyAgent['chooseMove']>) {
  const decision = requirePolicyDecision(result);
  const candidates = requireVerboseCandidates(result).map((candidate) => ({
    actionId: candidate.actionId,
    stableMoveKey: candidate.stableMoveKey,
    score: candidate.score,
    previewOutcome: candidate.previewOutcome,
    projectedSelfMargin: maybeProjectedSelfMarginContribution(candidate),
  }));

  return {
    phase1ActionRanking: decision.phase1ActionRanking,
    candidates,
  };
}

function measureAverageDecisionTimeMs(
  def: GameDef,
  state: GameState,
  legalMoves: readonly ClassifiedMove[],
): number {
  const runtime = createGameDefRuntime(def);
  const agent = new PolicyAgent({ traceLevel: 'verbose' });

  const t0 = performance.now();
  for (let iteration = 0; iteration < PERF_ITERATIONS; iteration += 1) {
    agent.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves,
      rng: createRng(BigInt(900000 + iteration)),
      runtime,
    });
  }
  return (performance.now() - t0) / PERF_ITERATIONS;
}

describe('FITL ARVN phase-1 preview differentiation', () => {
  it('finds a bounded production witness where phase-1 projected margin differentiates template operations', () => {
    const def = createFitlDef(true);
    const witness = findArvnPhase1Witness(def);
    const decision = requirePolicyDecision(witness.result);
    const uniqueProjectedMargins = [...new Set(witness.projectedMarginsByAction.values())].sort((left, right) => left - right);

    assert.equal(decision.previewUsage.evaluatedCandidateCount > 0, true);
    assert.equal(witness.templateCandidates.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.equal(witness.projectedMarginsByAction.size >= 2, true);
    assert.equal(uniqueProjectedMargins.length >= 2, true);
    assert.equal(decision.phase1ActionRanking !== undefined, true);
  });

  it('replays the discovered witness seed and ply deterministically', () => {
    const def = createFitlDef(true);
    const witness = findArvnPhase1Witness(def);

    const firstReplay = traceArvnDecisionAtPly(def, witness.seed, witness.ply);
    const secondReplay = traceArvnDecisionAtPly(def, witness.seed, witness.ply);

    assert.deepEqual(canonicalPhase1Snapshot(firstReplay.result), canonicalPhase1Snapshot(secondReplay.result));
  });

  it.skip('records informational phase-1 overhead for the discovered witness decision', () => {
    const enabledDef = createFitlDef(true);
    const disabledDef = createFitlDef(false);
    const witness = findArvnPhase1Witness(enabledDef);

    const baselineMs = measureAverageDecisionTimeMs(disabledDef, witness.state, witness.legalMoves);
    const phase1Ms = measureAverageDecisionTimeMs(enabledDef, witness.state, witness.legalMoves);
    const overheadRatio = baselineMs === 0 ? Number.POSITIVE_INFINITY : (phase1Ms - baselineMs) / baselineMs;

    assert.equal(Number.isFinite(baselineMs), true);
    assert.equal(Number.isFinite(phase1Ms), true);
    assert.equal(Number.isFinite(overheadRatio), true);
  });
});
