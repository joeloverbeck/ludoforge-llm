// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { runGame } from '../../src/sim/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPreviewConfig,
  type CompiledAgentPolicyRef,
  type Decision,
  type GameDef,
  type PolicyAgentDecisionTrace,
} from '../../src/kernel/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

interface ChooseNStepFitlCanaryFixture {
  readonly seed: number;
  readonly maxTurns: number;
  readonly playerCount: number;
  readonly decisionIndex: number;
  readonly profileId: string;
  readonly decision: Decision;
  readonly selectedStableMoveKey: string | null;
  readonly previewUsage: PolicyAgentDecisionTrace['previewUsage'];
  readonly options: readonly {
    readonly stableMoveKey: string;
    readonly projectedMarginValue: number;
  }[];
}

const PROFILE_ID = 'policy-preview-inner-choosenstep-fitl-canary';
const BASE_PROFILE_ID = 'arvn-evolved';
const CONSIDERATION_ID = 'preferOptionProjectedMargin';
const PREVIEW_REF_ID = 'preview.option.delta.victory.currentMargin.self';
const PROJECTED_MARGIN_WEIGHT = 300;
const fixtureUrl = new URL('../../../test/fixtures/trace/spec-161-choosenstep-fitl-canary-golden.json', import.meta.url);

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function withChooseNStepCanaryProfile(def: GameDef) {
  const agents = def.agents;
  assert.ok(agents, 'expected FITL production agents');
  const baseProfile = agents.profiles[BASE_PROFILE_ID];
  assert.ok(baseProfile, `expected base FITL profile ${BASE_PROFILE_ID}`);

  const diagnosticPreview: CompiledAgentPreviewConfig = {
    ...baseProfile.preview,
    mode: 'exactWorld',
    completion: 'policyGuided',
    fallbackCompletionPolicy: 'greedy',
    inner: {
      chooseOne: true,
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  };
  const baseUseConsiderations = baseProfile.use.considerations.includes(CONSIDERATION_ID)
    ? baseProfile.use.considerations
    : [...baseProfile.use.considerations, CONSIDERATION_ID];
  const basePlanConsiderations = baseProfile.plan.considerations.includes(CONSIDERATION_ID)
    ? baseProfile.plan.considerations
    : [...baseProfile.plan.considerations, CONSIDERATION_ID];

  const updatedAgents: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      considerations: {
        ...agents.compiled.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['microturn'],
          costClass: 'preview',
          weight: literal(PROJECTED_MARGIN_WEIGHT),
          value: refExpr({ kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' }),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    library: {
      ...agents.library,
      considerations: {
        ...agents.library.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['microturn'],
          costClass: 'preview',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    profiles: {
      ...agents.profiles,
      [PROFILE_ID]: {
        ...baseProfile,
        fingerprint: PROFILE_ID,
        preview: diagnosticPreview,
        use: {
          ...baseProfile.use,
          considerations: baseUseConsiderations,
        },
        plan: {
          ...baseProfile.plan,
          considerations: basePlanConsiderations,
        },
      },
    },
    bindingsBySeat: {
      ...agents.bindingsBySeat,
      us: PROFILE_ID,
      arvn: PROFILE_ID,
      nva: PROFILE_ID,
      vc: PROFILE_ID,
    },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

function projectedMarginValue(trace: NonNullable<PolicyAgentDecisionTrace['candidates']>[number]): number | null {
  const contribution = trace.scoreContributions.find((entry) => entry.termId === CONSIDERATION_ID)?.contribution;
  return contribution === undefined ? null : contribution / PROJECTED_MARGIN_WEIGHT;
}

function normalizeCanaryTrace(input: ChooseNStepFitlCanaryFixture): ChooseNStepFitlCanaryFixture {
  return JSON.parse(`${JSON.stringify(input, null, 2)}\n`) as ChooseNStepFitlCanaryFixture;
}

function captureChooseNStepFitlCanary(): ChooseNStepFitlCanaryFixture {
  const expected = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as ChooseNStepFitlCanaryFixture;
  const def = withChooseNStepCanaryProfile(getFitlProductionFixture().gameDef);
  const runtime = createGameDefRuntime(def);
  const agents = Array.from(
    { length: expected.playerCount },
    () => new PolicyAgent({ profileId: PROFILE_ID, traceLevel: 'verbose' }),
  );
  const trace = runGame(def, expected.seed, agents, expected.maxTurns, expected.playerCount, { skipDeltas: true }, runtime);
  const decision = trace.decisions[expected.decisionIndex];
  assert.ok(decision, `Expected FITL decision ${expected.decisionIndex}`);
  assert.equal(decision.decision.kind, 'chooseNStep');
  const agentDecision = decision.agentDecision;
  assert.ok(agentDecision, 'Expected verbose policy trace');
  assert.ok(agentDecision.candidates, 'Expected verbose candidate trace');
  assert.equal(agentDecision.previewUsage.utility, 'differentiating');
  assert.equal(agentDecision.previewUsage.coverage.readyRootOptionCount > 0, true);
  assert.equal(agentDecision.previewUsage.coverage.allRootsUnavailable, false);
  assert.equal(agentDecision.previewUsage.outcomeBreakdown?.unknownDepthCap, 0);

  const options = agentDecision.candidates
    .filter((candidate) => candidate.previewRefIds.includes(PREVIEW_REF_ID))
    .map((candidate) => ({
      stableMoveKey: candidate.stableMoveKey,
      projectedMarginValue: projectedMarginValue(candidate),
    }));
  assert.equal(options.every((option) => typeof option.projectedMarginValue === 'number'), true);

  return normalizeCanaryTrace({
    seed: expected.seed,
    maxTurns: expected.maxTurns,
    playerCount: expected.playerCount,
    decisionIndex: expected.decisionIndex,
    profileId: PROFILE_ID,
    decision: decision.decision,
    selectedStableMoveKey: agentDecision.selectedStableMoveKey,
    previewUsage: agentDecision.previewUsage,
    options: options as ChooseNStepFitlCanaryFixture['options'],
  });
}

describe('FITL chooseNStep inner preview policy canary golden', () => {
  it('matches the frozen per-option projected-margin fixture', () => {
    const expectedBytes = readFileSync(fixtureUrl, 'utf8');
    const actualBytes = `${JSON.stringify(captureChooseNStepFitlCanary(), null, 2)}\n`;

    assert.equal(
      actualBytes,
      expectedBytes,
      [
        'FITL chooseNStep inner preview canary drifted.',
        'Re-bless golden trace: packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts',
      ].join(' '),
    );
  });
});
