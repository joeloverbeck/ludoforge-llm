// @test-class: convergence-witness
// @profile-variant: spec-166-candidate-params-fitl-witness

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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
  type GameTrace,
  type PolicyAgentDecisionTrace,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { publishMicroturn } from '../../../src/kernel/microturn/publish.js';
import { runGame } from '../../../src/sim/index.js';
import { emitPolicyProfileQualityRecord } from '../../helpers/policy-profile-quality-report-helpers.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const WITNESS_PROFILE_ID = 'spec-166-candidate-params-fitl-witness';
const BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const SEED_1000_REPLAY_LIMIT = 80;
const PLAYER_COUNT = 4;

type TraceDecision = GameTrace['decisions'][number];
type TraceCandidate = NonNullable<NonNullable<TraceDecision['agentDecision']>['candidates']>[number];

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function eventCandidateSide(candidate: TraceCandidate): 'shaded' | 'unshaded' | null {
  if (candidate.actionId !== 'event') {
    return null;
  }
  if (candidate.stableMoveKey.includes('"side":"shaded"')) {
    return 'shaded';
  }
  if (candidate.stableMoveKey.includes('"side":"unshaded"')) {
    return 'unshaded';
  }
  return null;
}

function withAvoidShadedEventProfile(def: GameDef): ValidatedGameDef {
  const agents = def.agents;
  assert.ok(agents, 'expected FITL production agents');
  const arvn = agents.profiles['arvn-baseline'];
  assert.ok(arvn, 'expected arvn-baseline profile');

  const updatedAgents: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      considerations: {
        ...agents.compiled.considerations,
        avoidShadedEvent: {
          scopes: ['move'],
          costClass: 'candidate',
          weight: literal(-800),
          value: opExpr(
            'boolToNumber',
            opExpr(
              'eq',
              refExpr({ kind: 'candidateParam', id: 'side', onMissing: 'unavailable' }),
              literal('shaded'),
            ),
          ),
          candidateParamFallback: { onUnavailable: 'noContribution' },
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
    library: {
      ...agents.library,
      considerations: {
        ...agents.library.considerations,
        avoidShadedEvent: {
          scopes: ['move'],
          costClass: 'candidate',
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
      [WITNESS_PROFILE_ID]: {
        ...arvn,
        fingerprint: WITNESS_PROFILE_ID,
        use: {
          ...arvn.use,
          considerations: [...arvn.use.considerations, 'avoidShadedEvent'],
        },
        plan: {
          ...arvn.plan,
          considerations: [...arvn.plan.considerations, 'avoidShadedEvent'],
        },
      },
    },
    bindingsBySeat: {
      ...agents.bindingsBySeat,
      arvn: WITNESS_PROFILE_ID,
    },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

function findFirstArvnEventDecision(trace: GameTrace): number {
  const index = trace.decisions.findIndex((decision) =>
    decision.agentDecision?.resolvedProfileId === 'arvn-baseline'
    && (decision.agentDecision.candidates ?? []).some((candidate) => candidate.actionId === 'event'));
  assert.notEqual(index, -1, 'expected seed 1000 baseline to reach an ARVN event frontier');
  return index;
}

function replayPrefix(def: ValidatedGameDef, seed: number, decisions: readonly Decision[]): GameState {
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, seed, PLAYER_COUNT, undefined, runtime).state;
  for (const decision of decisions) {
    state = applyDecision(def, state, decision, undefined, runtime).state;
  }
  return state;
}

function captureSeed1000EventFrontier(def: ValidatedGameDef): PolicyAgentDecisionTrace {
  const baselineRuntime = createGameDefRuntime(def);
  const baselineAgents = BASELINE_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));
  const baselineTrace = runGame(def, 1000, baselineAgents, SEED_1000_REPLAY_LIMIT, PLAYER_COUNT, { skipDeltas: true }, baselineRuntime);
  const frontierIndex = findFirstArvnEventDecision(baselineTrace);
  const prefix = baselineTrace.decisions.slice(0, frontierIndex).map((decision) => decision.decision);

  const witnessDef = withAvoidShadedEventProfile(def);
  const witnessRuntime = createGameDefRuntime(witnessDef);
  const state = replayPrefix(witnessDef, 1000, prefix);
  const microturn = publishMicroturn(witnessDef, state, witnessRuntime);
  assert.equal(microturn.kind, 'actionSelection');
  assert.equal(String(microturn.seatId), 'arvn');

  const agent = new PolicyAgent({ profileId: WITNESS_PROFILE_ID, traceLevel: 'verbose' });
  const decision = agent.chooseDecision({ def: witnessDef, state, microturn, rng: createRng(1000n), runtime: witnessRuntime });
  assert.ok(decision.agentDecision, 'expected verbose policy trace');
  return decision.agentDecision;
}

describe('Spec 166 FITL candidate-param witness', () => {
  const baseDef = assertValidatedGameDef(getFitlProductionFixture().gameDef);
  const witnessDef = withAvoidShadedEventProfile(baseDef);

  it('compiles FITL event candidate params for the always-present event fields only', () => {
    assert.deepEqual(witnessDef.agents?.candidateParamDefs.eventCardId, { type: 'id' });
    assert.deepEqual(witnessDef.agents?.candidateParamDefs.eventDeckId, { type: 'id' });
    assert.deepEqual(witnessDef.agents?.candidateParamDefs.side, { type: 'id' });
    assert.equal(witnessDef.agents?.candidateParamDefs.branch, undefined);
  });

  it('scores seed 1000 ARVN shaded event candidates through candidate.params.side', { timeout: 60_000 }, () => {
    const decision = captureSeed1000EventFrontier(baseDef);
    const candidates = decision.candidates ?? [];
    const shaded = candidates.filter((candidate) => eventCandidateSide(candidate) === 'shaded');
    const unshaded = candidates.filter((candidate) => eventCandidateSide(candidate) === 'unshaded');
    assert.ok(shaded.length > 0, 'expected at least one shaded event candidate');
    assert.ok(unshaded.length > 0, 'expected at least one unshaded event candidate');

    for (const candidate of shaded) {
      assert.deepEqual(candidate.unknownCandidateParamRefs, []);
      assert.equal(
        candidate.scoreContributions.find((entry) => entry.termId === 'avoidShadedEvent')?.contribution,
        -800,
      );
    }

    for (const candidate of unshaded) {
      assert.deepEqual(candidate.unknownCandidateParamRefs, []);
      const contribution = candidate.scoreContributions.find((entry) => entry.termId === 'avoidShadedEvent')?.contribution;
      assert.equal(Math.abs(contribution ?? NaN), 0);
    }

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: WITNESS_PROFILE_ID,
      seed: 1000,
      passed: true,
      stopReason: 'frontier-witness',
      decisions: SEED_1000_REPLAY_LIMIT,
    });
  });
});
