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

function withPolicyGuidedPreferPatronageMode(def: GameDef): GameDef {
  const agents = def.agents;
  assert.ok(agents?.compiled, 'expected FITL production agents');
  const profile = agents.profiles['arvn-evolved'];
  assert.ok(profile, 'expected arvn-evolved profile');

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
      'arvn-evolved': {
        ...profile,
        preview: {
          ...profile.preview,
          completion: 'policyGuided',
          fallbackCompletionPolicy: 'fail',
        },
        use: {
          ...profile.use,
          considerations: [...profile.use.considerations, 'preferPatronageMode'],
        },
        plan: {
          ...profile.plan,
          considerations: [...profile.plan.considerations, 'preferPatronageMode'],
        },
      },
    },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

const readDecisionSequence = (): readonly Decision[] =>
  JSON.parse(readFileSync(join(fixtureDir, 'decision-sequence.json'), 'utf8')) as readonly Decision[];

describe('policy-guided FITL canary golden', () => {
  it('keeps the preferPatronageMode preview canary differentiating on a fixed FITL seed', () => {
    const def = withPolicyGuidedPreferPatronageMode(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    const fixtureDecisions = readDecisionSequence();
    const agent = new PolicyAgent({ profileId: 'arvn-evolved', traceLevel: 'summary' });
    let state: GameState = initialState(def, 1001, 4, undefined, runtime).state;

    for (const fixtureDecision of fixtureDecisions) {
      const microturn = publishMicroturn(def, state, runtime);
      const decision = microturn.kind === 'actionSelection'
        ? agent.chooseDecision({ def, state, microturn, rng: createRng(1001n), runtime })
        : undefined;

      if (decision?.agentDecision?.previewUsage.utility === 'differentiating') {
        const { previewUsage } = decision.agentDecision;
        assert.equal(previewUsage.completionPolicyFallbackCount, 0);
        assert.ok(previewUsage.outcomeBreakdown, 'expected summary trace to include preview outcome breakdown');
        assert.equal(previewUsage.outcomeBreakdown.unknownNoPreviewDecision, 0);
        return;
      }

      state = applyDecision(def, state, fixtureDecision, undefined, runtime).state;
    }

    assert.fail('Expected a differentiating policy-guided preview decision in the fixed FITL canary');
  });
});
