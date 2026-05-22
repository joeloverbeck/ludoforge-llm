// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  applyDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type Decision,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { publishMicroturn } from '../../src/kernel/microturn/publish.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const fixtureDir = join(process.cwd(), 'test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end');

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

// Frozen consideration set for this canary test.
//
// Earlier revisions of this test spread `profile.use.considerations` and
// `profile.plan.considerations` from the production `arvn-baseline` profile and
// appended `preferPatronageMode`. That coupled the test's pass/fail to the
// evolving production consideration list — any improve-loop campaign that
// added or removed a consideration on `arvn-baseline` shifted the agent's
// trajectory on this fixed FITL seed and broke the canary without indicating
// a real regression. The invariant under test is "policy-guided completion
// produces a differentiating preview decision when `preferPatronageMode` is
// present", which depends only on a margin-signal consideration and the test
// subject. The frozen list pins exactly that minimum.
const POLICY_GUIDED_CANARY_CONSIDERATIONS: readonly string[] = [
  'preferProjectedSelfMargin',
  'preferPatronageMode',
];

function withPolicyGuidedPreferPatronageMode(def: GameDef): GameDef {
  const agents = def.agents;
  assert.ok(agents?.compiled, 'expected FITL production agents');
  const profile = agents.profiles['arvn-baseline'];
  assert.ok(profile, 'expected arvn-baseline profile');

  const updatedAgents: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      considerations: {
        ...agents.compiled.considerations,
        preferPatronageMode: {
          scopes: ['microturn'],
          costClass: 'state',
          when: opExpr('eq', refExpr({ kind: 'microturnIntrinsic', intrinsic: 'kind' }), literal('chooseOne')),
          weight: literal(10),
          value: opExpr(
            'boolToNumber',
            opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('patronage')),
          ),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          readFootprint: {
            writes: { tokens: [], zones: [], variables: [], scores: [] },
            reads: { tokens: [], zones: [], variables: [], scores: [] },
            mayTouchTokens: [],
            mayTouchZones: [],
            mayTouchVariables: [],
            mayTouchScores: [],
          },
        },
      },
    },
    profiles: {
      ...agents.profiles,
      'arvn-baseline': {
        ...profile,
        preview: {
          ...profile.preview,
          completion: 'policyGuided',
          fallbackCompletionPolicy: 'fail',
        },
        use: {
          ...profile.use,
          considerations: POLICY_GUIDED_CANARY_CONSIDERATIONS,
        },
        plan: {
          ...profile.plan,
          considerations: POLICY_GUIDED_CANARY_CONSIDERATIONS,
        },
      },
    },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

const readDecisionSequence = (): readonly Decision[] =>
  JSON.parse(readFileSync(join(fixtureDir, 'decision-sequence.json'), 'utf8')) as readonly Decision[];

describe('policy-guided FITL canary golden', () => {
  it('keeps preferPatronageMode choosing Patronage on the fixed FITL Govern microturn', () => {
    const def = withPolicyGuidedPreferPatronageMode(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    const fixtureDecisions = readDecisionSequence();
    const agent = new PolicyAgent({ profileId: 'arvn-baseline', traceLevel: 'verbose' });
    let state: GameState = initialState(def, 1001, 4, undefined, runtime).state;

    for (const fixtureDecision of fixtureDecisions.slice(0, 6)) {
      state = applyDecision(def, state, fixtureDecision, undefined, runtime).state;
    }

    const microturn = publishMicroturn(def, state, runtime);
    assert.equal(microturn.kind, 'chooseOne');
    assert.equal(String(microturn.seatId), 'arvn');

    const decision = agent.chooseDecision({ def, state, microturn, rng: createRng(1001n), runtime });
    assert.equal(decision.decision.kind, 'chooseOne');
    assert.equal(decision.decision.value, 'patronage');
    assert.ok(decision.agentDecision?.candidates, 'expected summary trace to include policy-guided candidates');

    const contributionByValue = new Map(
      decision.agentDecision.candidates.map((candidate) => [
        candidate.stableMoveKey.endsWith('"patronage"') ? 'patronage' : 'aid',
        candidate.scoreContributions.find((entry) => entry.termId === 'preferPatronageMode')?.contribution,
      ]),
    );
    assert.equal(contributionByValue.get('aid'), 0);
    assert.equal(contributionByValue.get('patronage'), 10);
  });
});
