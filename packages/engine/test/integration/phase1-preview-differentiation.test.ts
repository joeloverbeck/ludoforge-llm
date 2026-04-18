// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
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

const PHASE1_WITNESS_MAX_SEED = 20;
const PHASE1_WITNESS_MAX_PLY = 30;


function createFitlDef(phase1CompletionsPerAction?: number): GameDef {
  const { compiled } = compileProductionSpec();
  const baseline = structuredClone(assertValidatedGameDef(compiled.gameDef));
  const agents = baseline.agents;
  assert.notEqual(agents, undefined, 'expected FITL production GameDef to expose agent catalog');

  const arvnProfileId = agents!.bindingsBySeat['arvn'];
  assert.notEqual(arvnProfileId, undefined, 'expected ARVN seat to have a bound policy profile');
  const arvnProfile = agents!.profiles[arvnProfileId!];
  assert.notEqual(arvnProfile, undefined, `expected bound ARVN profile "${String(arvnProfileId)}" to exist`);

  if (phase1CompletionsPerAction === undefined) {
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
            phase1CompletionsPerAction,
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
    /[Mm]argin/.test(entry.termId),
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
    /[Mm]argin/.test(entry.termId),
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

function findComparableArvnPhase1Witness(
  bestOfNDef: GameDef,
  firstOfOneDef: GameDef,
): Phase1Witness {
  for (let seed = 1; seed <= PHASE1_WITNESS_MAX_SEED; seed += 1) {
    for (let ply = 0; ply <= PHASE1_WITNESS_MAX_PLY; ply += 1) {
      const trace = traceArvnDecisionAtPly(bestOfNDef, seed, ply);
      const activeSeatId = bestOfNDef.seats?.[Number(trace.state.activePlayer)]?.id;
      if (activeSeatId !== 'arvn') {
        continue;
      }

      const candidates = requireVerboseCandidates(trace.result);
      const { templateCandidates, projectedMarginsByAction } = templateCandidatesWithProjectedMargins(bestOfNDef, candidates);
      const uniqueProjectedMargins = new Set(projectedMarginsByAction.values());
      if (templateCandidates.length < 2 || projectedMarginsByAction.size < 2 || uniqueProjectedMargins.size < 2) {
        continue;
      }

      const firstOfOneProjectedMargins = projectedMarginsAtDecision(firstOfOneDef, seed, ply);
      const sameActionIds = [...projectedMarginsByAction.keys()].sort();
      if (
        sameActionIds.length !== firstOfOneProjectedMargins.size
        || sameActionIds.some((actionId, index) => actionId !== [...firstOfOneProjectedMargins.keys()].sort()[index])
      ) {
        continue;
      }

      const isNeverWorse = [...projectedMarginsByAction.entries()].every(([actionId, margin]) => {
        const firstOfOneMargin = firstOfOneProjectedMargins.get(actionId);
        return firstOfOneMargin !== undefined && margin >= firstOfOneMargin;
      });
      if (!isNeverWorse) {
        continue;
      }

      return {
        seed,
        ply,
        state: trace.state,
        legalMoves: trace.legalMoves,
        result: trace.result,
        templateCandidates,
        projectedMarginsByAction,
      };
    }
  }

  assert.fail(
    `Expected a bounded comparable ARVN witness within seeds 1-${PHASE1_WITNESS_MAX_SEED} and plies 0-${PHASE1_WITNESS_MAX_PLY}`,
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

function projectedMarginsAtDecision(
  def: GameDef,
  seed: number,
  ply: number,
): ReadonlyMap<string, number> {
  const trace = traceArvnDecisionAtPly(def, seed, ply);
  const candidates = requireVerboseCandidates(trace.result);
  return templateCandidatesWithProjectedMargins(def, candidates).projectedMarginsByAction;
}

describe('FITL ARVN phase-1 preview differentiation', () => {
  it('finds a bounded production witness where best-of-3 phase-1 projected margin differentiates template operations', () => {
    const def = createFitlDef(3);
    const witness = findArvnPhase1Witness(def);
    const decision = requirePolicyDecision(witness.result);
    const uniqueProjectedMargins = [...new Set(witness.projectedMarginsByAction.values())].sort((left, right) => left - right);

    assert.equal(decision.previewUsage.evaluatedCandidateCount > 0, true);
    assert.equal(witness.templateCandidates.every((candidate) => candidate.previewOutcome === 'ready'), true);
    assert.equal(witness.projectedMarginsByAction.size >= 2, true);
    assert.equal(uniqueProjectedMargins.length >= 2, true);
    assert.equal(decision.phase1ActionRanking !== undefined, true);
  });

  it('keeps best-of-3 projected margins at least as strong as first-of-1 for the same witness decision', () => {
    const bestOf3Def = createFitlDef(3);
    const firstOf1Def = createFitlDef(1);
    const witness = findComparableArvnPhase1Witness(bestOf3Def, firstOf1Def);

    const firstOf1ProjectedMargins = projectedMarginsAtDecision(firstOf1Def, witness.seed, witness.ply);
    const bestOf3ProjectedMargins = projectedMarginsAtDecision(bestOf3Def, witness.seed, witness.ply);

    assert.deepEqual(
      [...bestOf3ProjectedMargins.keys()].sort(),
      [...firstOf1ProjectedMargins.keys()].sort(),
    );
    for (const [actionId, bestOf3Margin] of bestOf3ProjectedMargins.entries()) {
      const firstOf1Margin = firstOf1ProjectedMargins.get(actionId);
      assert.notEqual(firstOf1Margin, undefined, `expected first-of-1 projected margin for action "${actionId}"`);
      assert.equal(
        bestOf3Margin >= firstOf1Margin!,
        true,
        `expected best-of-3 projected margin for "${actionId}" to be >= first-of-1`,
      );
    }
  });

  it('replays the discovered witness seed and ply deterministically', () => {
    const def = createFitlDef(3);
    const witness = findArvnPhase1Witness(def);

    const firstReplay = traceArvnDecisionAtPly(def, witness.seed, witness.ply);
    const secondReplay = traceArvnDecisionAtPly(def, witness.seed, witness.ply);

    assert.deepEqual(canonicalPhase1Snapshot(firstReplay.result), canonicalPhase1Snapshot(secondReplay.result));
  });

});
