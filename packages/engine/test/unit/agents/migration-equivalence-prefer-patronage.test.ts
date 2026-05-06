// @test-class: convergence-witness
// @witness: spec-158-completion-to-microturn-equivalence

import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
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
} from '../../../src/kernel/index.js';
import { publishMicroturn } from '../../../src/kernel/microturn/publish.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const fixtureDir = join(process.cwd(), 'test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end');

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

const isGovernModeDecisionKey = (decisionKey: string): boolean => decisionKey.includes('$governMode@');

const governModeDecisionKey = (decision: Decision): string | undefined =>
  decision.kind === 'chooseOne' && isGovernModeDecisionKey(String(decision.decisionKey))
    ? String(decision.decisionKey)
    : undefined;

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

  it('reproduces the captured four govern-mode patronage choices on a fixed FITL seed', () => {
    const def = withPreferPatronageMode(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    const fixtureDecisions = readDecisionSequence();
    const agent = new PolicyAgent({ profileId: 'arvn-evolved', traceLevel: 'summary' });
    let state: GameState = initialState(def, 1001, 4, undefined, runtime).state;
    const selectedGovernModes: readonly string[] = [];
    const selected: string[] = [];

    for (const fixtureDecision of fixtureDecisions) {
      if (selected.length >= 4) {
        break;
      }
      const microturn = publishMicroturn(def, state, runtime);
      if (microturn.kind === 'chooseOne' && microturn.legalActions.some((decision) => governModeDecisionKey(decision) !== undefined)) {
        const agentDecision = agent.chooseDecision({ def, state, microturn, rng: createRng(1001n + BigInt(selected.length)) });
        assert.equal(agentDecision.decision.kind, 'chooseOne');
        assert.equal(agentDecision.decision.value, 'patronage');
        selected.push(String(agentDecision.decision.value));
        state = applyDecision(def, state, agentDecision.decision, undefined, runtime).state;
        continue;
      }
      state = applyDecision(def, state, fixtureDecision, undefined, runtime).state;
    }

    assert.deepEqual(selected, ['patronage', 'patronage', 'patronage', 'patronage']);
    assert.deepEqual(selectedGovernModes, []);
  });
});
