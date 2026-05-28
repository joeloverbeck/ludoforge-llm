// @test-class: convergence-witness
// @witness: spec-158-completion-to-microturn-equivalence

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createRng,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type GameDef,
} from '../../../src/kernel/index.js';
import { driveToGovernChooseOneMicroturn } from '../../helpers/govern-mode-microturn.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

const completionScopeBaseline = {
  id: 'preferPatronageMode',
  scopes: ['completion'],
  weight: 10,
  value: { if: [{ eq: [{ ref: 'option.value' }, 'patronage'] }, 1, 0] },
} as const;

const microturnScopeRewrite = {
  id: 'preferPatronageMode',
  scopes: ['microturn'],
  weight: 10,
  value: { if: [{ eq: [{ ref: 'microturn.option.value' }, 'patronage'] }, 1, 0] },
} as const;

function withPreferPatronageMode(def: GameDef): GameDef {
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

describe('preferPatronageMode migration equivalence', () => {
  it('documents the retired completion-scope baseline and the microturn rewrite', () => {
    assert.deepEqual(completionScopeBaseline, {
      id: 'preferPatronageMode',
      scopes: ['completion'],
      weight: 10,
      value: { if: [{ eq: [{ ref: 'option.value' }, 'patronage'] }, 1, 0] },
    });
    assert.deepEqual(microturnScopeRewrite, {
      id: 'preferPatronageMode',
      scopes: ['microturn'],
      weight: 10,
      value: { if: [{ eq: [{ ref: 'microturn.option.value' }, 'patronage'] }, 1, 0] },
    });
  });

  it('chooses Patronage at a deterministically-reached FITL Govern microturn', () => {
    // Distilled from the retired seed-1001 trajectory scan: Spec 201's ARVN
    // doctrine no longer routes through Govern on seed 1001, so the witness now
    // drives to a Govern $governMode chooseOne microturn directly and proves the
    // migrated microturn-scope preferPatronageMode consideration still selects
    // Patronage there — the equivalence property the witness guards.
    const def = withPreferPatronageMode(getFitlProductionFixture().gameDef);
    const { state, microturn, runtime } = driveToGovernChooseOneMicroturn(def);
    const agent = new PolicyAgent({ profileId: 'arvn-baseline', traceLevel: 'summary' });

    const agentDecision = agent.chooseDecision({ def, state, microturn, rng: createRng(1001n), runtime });
    assert.equal(agentDecision.decision.kind, 'chooseOne');
    assert.equal(agentDecision.decision.value, 'patronage');
  });
});
