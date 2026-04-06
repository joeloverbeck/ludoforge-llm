import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  enumerateLegalMoves,
  initialState,
  type AgentDecisionTrace,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
  type CompiledProductionSpec,
} from '../helpers/production-spec-helpers.js';

interface PolicyDecisionGolden {
  readonly move: Move;
  readonly agentDecision: Extract<AgentDecisionTrace, { readonly kind: 'policy' }>;
}

describe('considerations production migration', () => {
  it('compiles FITL and Texas production agent docs with considerations only', () => {
    const fitlAgents = compileProductionSpec().compiled.gameDef.agents;
    const texasAgents = compileTexasProductionSpec().compiled.gameDef.agents;

    assert.ok(fitlAgents);
    assert.ok(texasAgents);
    const fitlUsBaseline = fitlAgents.profiles['us-baseline'];
    const fitlVcBaseline = fitlAgents.profiles['vc-baseline'];
    const texasBaseline = texasAgents.profiles.baseline;
    assert.ok(fitlUsBaseline);
    assert.ok(fitlVcBaseline);
    assert.ok(texasBaseline);

    assert.equal('scoreTerms' in fitlAgents.library, false);
    assert.equal('completionScoreTerms' in fitlAgents.library, false);
    assert.equal('scoreTerms' in fitlUsBaseline.use, false);
    assert.equal('completionScoreTerms' in fitlVcBaseline.use, false);
    assert.equal('completionGuidance' in fitlVcBaseline, false);
    assert.ok(fitlAgents.library.considerations.preferPopulousTargets);
    assert.deepEqual(fitlAgents.library.considerations.preferPopulousTargets.scopes, ['completion']);
    // vc-baseline considerations list changes during evolution campaigns — assert non-empty and
    // that every listed consideration exists in the library, rather than hardcoding the exact list.
    assert.ok(fitlVcBaseline.use.considerations.length > 0, 'vc-baseline must have at least one consideration');
    for (const name of fitlVcBaseline.use.considerations) {
      assert.ok(
        name in fitlAgents.library.considerations,
        `vc-baseline consideration "${name}" must exist in the library`,
      );
    }

    assert.equal('scoreTerms' in texasAgents.library, false);
    assert.equal('completionScoreTerms' in texasAgents.library, false);
    assert.equal('scoreTerms' in texasBaseline.use, false);
    assert.equal('completionScoreTerms' in texasBaseline.use, false);
    // Texas profiles are not under active evolution — exact list is stable.
    assert.deepEqual(
      texasBaseline.use.considerations,
      ['preferCheck', 'preferCall', 'avoidFold', 'foldWhenBadPotOdds', 'alwaysRaise', 'preferLargerRaise'],
    );
  });

  it('preserves fixed-seed FITL and Texas policy summary behavior after authored migration', () => {
    const expectedFitl = readFixtureJson<PolicyDecisionGolden>('trace/fitl-policy-summary.golden.json');
    const expectedTexas = readFixtureJson<PolicyDecisionGolden>('trace/texas-policy-summary.golden.json');

    assertBehaviorallyEquivalent(chooseFitlSummaryDecision(), expectedFitl);
    assertBehaviorallyEquivalent(chooseTexasSummaryDecision(), expectedTexas);
  });
});

function assertBehaviorallyEquivalent(actual: PolicyDecisionGolden, expected: PolicyDecisionGolden): void {
  assert.deepEqual(actual.move, expected.move);
  assert.equal(actual.agentDecision.selectedStableMoveKey, expected.agentDecision.selectedStableMoveKey);
  assert.equal(actual.agentDecision.finalScore, expected.agentDecision.finalScore);
  assert.equal(actual.agentDecision.initialCandidateCount, expected.agentDecision.initialCandidateCount);
  assert.deepEqual(actual.agentDecision.pruningSteps, expected.agentDecision.pruningSteps);
  assert.deepEqual(actual.agentDecision.tieBreakChain, expected.agentDecision.tieBreakChain);
  assert.deepEqual(actual.agentDecision.previewUsage, expected.agentDecision.previewUsage);
  assert.equal(actual.agentDecision.resolvedProfileId, expected.agentDecision.resolvedProfileId);
}

function chooseFitlSummaryDecision(): PolicyDecisionGolden {
  return chooseSummaryDecision(compileProductionSpec(), 7n);
}

function chooseTexasSummaryDecision(): PolicyDecisionGolden {
  const compiled = compileTexasProductionSpec();
  const def = assertValidatedGameDef(compiled.compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const seeded = initialState(def, 23, 4).state;
  const state = advanceToDecisionPoint(def, seeded);
  return choosePolicyDecision(def, state, runtime, 23n, 'Texas');
}

function chooseSummaryDecision(compiled: CompiledProductionSpec, seed: bigint): PolicyDecisionGolden {
  const def = assertValidatedGameDef(compiled.compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const state = initialState(def, Number(seed), 4).state;
  return choosePolicyDecision(def, state, runtime, seed, 'FITL');
}

function choosePolicyDecision(
  def: GameDef,
  state: GameState,
  runtime: ReturnType<typeof createGameDefRuntime>,
  seed: bigint,
  label: string,
): PolicyDecisionGolden {
  const moves = enumerateLegalMoves(def, state, undefined, runtime).moves;
  const result = new PolicyAgent({ traceLevel: 'summary' }).chooseMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: moves,
    rng: createRng(seed),
    runtime,
  });

  assert.equal(result.agentDecision?.kind, 'policy');
  if (result.agentDecision?.kind !== 'policy') {
    assert.fail(`expected ${label} policy trace metadata`);
  }

  return {
    move: result.move.move,
    agentDecision: result.agentDecision,
  };
}
