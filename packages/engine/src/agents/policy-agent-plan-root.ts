import type { Decision } from '../kernel/microturn/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
} from '../kernel/types.js';
import { proposeAndCommitAdvisoryTurnPlan } from './plan-proposal.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import {
  emptyPreviewUsage,
  evaluatePolicyMove,
  type PolicyEvaluationMetadata,
} from './policy-eval.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import type { PreviewWideningState } from './preview-budget-allocator.js';

export const choosePlanSelectedRootDecision = (
  input: AgentMicroturnDecisionInput,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
  profileId: string | undefined,
  traceLevel: PolicyDecisionTraceLevel,
  planProposal: ReturnType<typeof proposeAndCommitAdvisoryTurnPlan>,
): AgentMicroturnDecisionResult | undefined => {
  if (planProposal?.result.status !== 'selected') {
    return undefined;
  }
  const selectedPlan = planProposal.result.selected;
  if (selectedPlan === undefined) {
    throw new Error('PolicyAgent: selected plan proposal did not include selected plan metadata.');
  }
  const rootStableMoveKey = selectedPlan.rootStableMoveKey;
  const selectedDecision = selectedPlan.rootDecision ?? actionDecisions.find(
    (decision) => decision.move !== undefined
      && toMoveIdentityKey(input.def, decision.move) === rootStableMoveKey,
  );
  if (selectedDecision === undefined) {
    throw new Error('PolicyAgent: plan-selected root not present in the published action frontier.');
  }
  const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, profileId);
  const metadata: PolicyEvaluationMetadata = {
    seatId: resolvedProfile?.seatId ?? String(input.microturn.seatId),
    requestedProfileId: profileId ?? null,
    profileId: resolvedProfile?.profileId ?? null,
    profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
    canonicalOrder: actionDecisions.map((decision) => (
      decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(input.def, decision.move)
    )),
    candidates: [],
    pruningSteps: [],
    tieBreakChain: [],
    previewUsage: emptyPreviewUsage('disabled'),
    selectedStableMoveKey: rootStableMoveKey,
    finalScore: selectedPlan.score,
    plan: planProposal.trace,
    usedFallback: false,
    failure: null,
  };
  return {
    decision: selectedDecision,
    rng: input.rng,
    ...(traceLevel === 'none' ? {} : { agentDecision: buildPolicyAgentDecisionTrace(metadata, traceLevel) }),
  };
};

export const evaluateActionSelectionFallback = (
  input: AgentMicroturnDecisionInput,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
  profileId: string | undefined,
  fallbackOnError: boolean | undefined,
  traceLevel: PolicyDecisionTraceLevel,
  previewWideningState: PreviewWideningState,
): ReturnType<typeof evaluatePolicyMove> => evaluatePolicyMove({
  def: input.def,
  state: input.state,
  playerId: input.state.activePlayer,
  legalMoves: actionDecisions.map((decision) => decision.move).filter((move): move is NonNullable<typeof move> => move !== undefined),
  trustedMoveIndex: new Map(),
  rng: input.rng,
  ...(profileId === undefined ? {} : { profileIdOverride: profileId }),
  ...(fallbackOnError === undefined ? {} : { fallbackOnError }),
  ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  ...(traceLevel === 'none' ? { diagnosticsMode: 'disabled' as const } : {}),
  traceLevel,
  previewWideningState,
  previewDecisionContext: {
    turnId: Number(input.microturn.turnId),
    seatId: String(input.microturn.seatId),
  },
});
