// @test-class: convergence-witness
// @profile-variant: spec-166-candidate-params-fitl-witness

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  asActionId,
  asDecisionFrameId,
  assertValidatedGameDef,
  createRng,
  asSeatId,
  asTurnId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type AgentMicroturnDecisionInput,
  type CompiledAgentPolicyRef,
  type Decision,
  type GameDef,
  type GameState,
  type PolicyAgentDecisionTrace,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { emitPolicyProfileQualityRecord } from '../../helpers/policy-profile-quality-report-helpers.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const WITNESS_PROFILE_ID = 'spec-166-candidate-params-fitl-witness';
const WITNESS_SEED = 166006;
const PLAYER_COUNT = 4;

type TraceCandidate = NonNullable<PolicyAgentDecisionTrace['candidates']>[number];

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

const eventDecision = (side: 'shaded' | 'unshaded'): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('event'),
  move: {
    actionId: asActionId('event'),
    params: {
      eventCardId: 'card-78',
      eventDeckId: '1968',
      side,
    },
  },
});

function captureEventFrontier(def: ValidatedGameDef): PolicyAgentDecisionTrace {
  const witnessDef = withAvoidShadedEventProfile(def);
  const legalActions = [eventDecision('shaded'), eventDecision('unshaded')];
  const state: GameState = {
    ...initialState(witnessDef, WITNESS_SEED, PLAYER_COUNT).state,
    activePlayer: 1 as never,
  };
  const input: AgentMicroturnDecisionInput = {
    def: witnessDef,
    state,
    rng: createRng(BigInt(WITNESS_SEED)),
    microturn: {
      kind: 'actionSelection',
      seatId: asSeatId('arvn'),
      decisionContext: {
        kind: 'actionSelection',
        seatId: asSeatId('arvn'),
        eligibleActions: [asActionId('event')],
      },
      legalActions,
      projectedState: { state },
      turnId: asTurnId(WITNESS_SEED),
      frameId: asDecisionFrameId(1),
      compoundTurnTrace: [],
    },
  };

  const agent = new PolicyAgent({ profileId: WITNESS_PROFILE_ID, traceLevel: 'verbose' });
  const decision = agent.chooseDecision(input);
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

  it('scores an ARVN event frontier through candidate.params.side', () => {
    const decision = captureEventFrontier(baseDef);
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
      seed: WITNESS_SEED,
      passed: true,
      stopReason: 'distilled-event-frontier-witness',
      decisions: 2,
    });
  });
});
