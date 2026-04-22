import { applyPublishedDecision } from '../kernel/microturn/apply.js';
import type { ChooseNStepContext, ChooseOneContext, Decision } from '../kernel/microturn/types.js';
import { perfDynEnd, perfStart } from '../kernel/perf-profiler.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  Agent,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
  ChoicePendingChooseNRequest,
  ChoicePendingChooseOneRequest,
  ChoicePendingRequest,
} from '../kernel/types.js';
import { buildCompletionChooseCallback, selectBestCompletionChooseOneValue } from './completion-guidance-choice.js';
import { pickRandom } from './agent-move-selection.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import {
  evaluatePolicyMove,
  type PolicyEvaluationMetadata,
} from './policy-eval.js';
import { evaluateState } from './evaluate-state.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';

export interface PolicyAgentConfig {
  readonly profileId?: string;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly fallbackOnError?: boolean;
  readonly disableGuidedChooser?: boolean;
}

interface FrontierCandidate {
  readonly decision: Decision;
  readonly stableMoveKey: string;
  readonly score: number;
  readonly progressBias: number;
}

const traceCandidatesForFrontier = (
  traceLevel: PolicyDecisionTraceLevel,
  frontier: readonly FrontierCandidate[],
): PolicyEvaluationMetadata['candidates'] => traceLevel === 'verbose'
  ? frontier.map((candidate) => ({
      actionId: candidate.decision.kind === 'actionSelection' ? String(candidate.decision.actionId) : candidate.decision.kind,
      stableMoveKey: candidate.stableMoveKey,
      score: candidate.score,
      prunedBy: [],
      scoreContributions: [],
      previewRefIds: [],
      unknownPreviewRefs: [],
    }))
  : [];

const chooseNStepProgressBias = (
  input: AgentMicroturnDecisionInput,
  decision: Decision,
): number => {
  if (input.microturn.kind !== 'chooseNStep' || decision.kind !== 'chooseNStep') {
    return 0;
  }

  if (decision.command === 'confirm') {
    return 2;
  }
  if (decision.command === 'add') {
    return 1;
  }
  return -1;
};

const chooseStructuralFrontierDecision = (
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  profileIdOverride: string | undefined,
  traceLevel: PolicyDecisionTraceLevel,
): AgentMicroturnDecisionResult | null => {
  if (input.microturn.kind !== 'chooseNStep') {
    return null;
  }

  const frontier = input.microturn.legalActions.map<FrontierCandidate>((decision) => ({
    decision,
    stableMoveKey: frontierDecisionKey(input.def, decision),
    score: chooseNStepProgressBias(input, decision),
    progressBias: chooseNStepProgressBias(input, decision),
  }));
  const bestProgressBias = Math.max(...frontier.map((candidate) => candidate.progressBias));
  const bestCandidates = frontier.filter((candidate) => candidate.progressBias === bestProgressBias);
  const { item: selected, rng } = pickRandom(bestCandidates, input.rng);
  const metadata: PolicyEvaluationMetadata = {
    seatId: resolvedProfile?.seatId ?? null,
    requestedProfileId: profileIdOverride ?? null,
    profileId: resolvedProfile?.profileId ?? null,
    profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
    canonicalOrder: frontier.map((candidate) => candidate.stableMoveKey),
    candidates: traceCandidatesForFrontier(traceLevel, frontier),
    pruningSteps: [],
    tieBreakChain: [],
    previewUsage: emptyPreviewUsage(),
    selectedStableMoveKey: selected.stableMoveKey,
    finalScore: selected.score,
    usedFallback: false,
    failure: null,
  };

  return {
    decision: selected.decision,
    rng,
    agentDecision: buildPolicyAgentDecisionTrace(metadata, traceLevel),
  };
};

type GuidedChoiceMatch =
  | { readonly matchedDecision: Decision; readonly score: number }
  | null;

const emptyPreviewUsage = (): PolicyEvaluationMetadata['previewUsage'] => ({
  mode: 'disabled',
  evaluatedCandidateCount: 0,
  refIds: [],
  unknownRefs: [],
  outcomeBreakdown: {
    ready: 0,
    stochastic: 0,
    unknownRandom: 0,
    unknownHidden: 0,
    unknownUnresolved: 0,
    unknownFailed: 0,
  },
});

const frontierDecisionKey = (def: AgentMicroturnDecisionInput['def'], decision: Decision): string => {
  switch (decision.kind) {
    case 'actionSelection':
      return decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(def, decision.move);
    case 'chooseOne':
      return `${decision.kind}:${decision.decisionKey}:${JSON.stringify(decision.value)}`;
    case 'chooseNStep':
      return `${decision.kind}:${decision.decisionKey}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;
    case 'stochasticResolve':
      return `${decision.kind}:${decision.decisionKey}:${JSON.stringify(decision.value)}`;
    case 'outcomeGrantResolve':
      return `${decision.kind}:${decision.grantId}`;
    case 'turnRetirement':
      return `${decision.kind}:${decision.retiringTurnId}`;
  }
  throw new Error(`Unsupported decision kind ${(decision as { kind?: unknown }).kind as string}`);
};

export class PolicyAgent implements Agent {
  private readonly profileId: string | undefined;
  private readonly traceLevel: PolicyDecisionTraceLevel;
  private readonly fallbackOnError: boolean | undefined;
  private readonly disableGuidedChooser: boolean;

  constructor(config: PolicyAgentConfig = {}) {
    this.profileId = config.profileId;
    this.traceLevel = config.traceLevel ?? 'summary';
    this.fallbackOnError = config.fallbackOnError;
    this.disableGuidedChooser = config.disableGuidedChooser ?? false;
  }

  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    if (input.microturn.legalActions.length === 0) {
      throw new Error('PolicyAgent.chooseDecision called with empty legalActions');
    }

    const t0Eval = perfStart(input.profiler);
    const result = input.microturn.kind === 'actionSelection'
      ? this.chooseActionSelectionDecision(input)
      : this.chooseFrontierDecision(input);
    perfDynEnd(input.profiler, 'agent:evaluatePolicyExpression', t0Eval);
    return result;
  }

  private chooseActionSelectionDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult {
    const actionDecisions = input.microturn.legalActions.filter(
      (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
        decision.kind === 'actionSelection' && decision.move !== undefined,
    );
    if (actionDecisions.length === 0) {
      return this.chooseFrontierDecision(input);
    }

    const evaluation = evaluatePolicyMove({
      def: input.def,
      state: input.state,
      playerId: input.state.activePlayer,
      legalMoves: actionDecisions.map((decision) => decision.move).filter((move): move is NonNullable<typeof move> => move !== undefined),
      trustedMoveIndex: new Map(),
      rng: input.rng,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    });
    const selectedMoveKey = toMoveIdentityKey(input.def, evaluation.move);
    const selectedDecision = actionDecisions.find(
      (decision) => decision.move !== undefined && toMoveIdentityKey(input.def, decision.move) === selectedMoveKey,
    );
    if (selectedDecision === undefined) {
      throw new Error('PolicyAgent selected a move that was not present in the published action frontier.');
    }

    return {
      decision: selectedDecision,
      rng: evaluation.rng,
      agentDecision: buildPolicyAgentDecisionTrace(evaluation.metadata, this.traceLevel),
    };
  }

  private chooseFrontierDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult {
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, this.profileId);
    const guidedChoice = this.disableGuidedChooser
      ? null
      : this.matchGuidedCompletionDecision(input, resolvedProfile);
    if (guidedChoice !== null) {
      const metadata: PolicyEvaluationMetadata = {
        seatId: resolvedProfile?.seatId ?? null,
        requestedProfileId: this.profileId ?? null,
        profileId: resolvedProfile?.profileId ?? null,
        profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
        canonicalOrder: input.microturn.legalActions.map((decision) => frontierDecisionKey(input.def, decision)),
        candidates: this.traceLevel === 'verbose'
          ? input.microturn.legalActions.map((decision) => ({
              actionId: decision.kind === 'actionSelection' ? String(decision.actionId) : decision.kind,
              stableMoveKey: frontierDecisionKey(input.def, decision),
              score: decision === guidedChoice.matchedDecision ? guidedChoice.score : 0,
              prunedBy: [],
              scoreContributions: [],
              previewRefIds: [],
              unknownPreviewRefs: [],
            }))
          : [],
        pruningSteps: [],
        tieBreakChain: [],
        previewUsage: emptyPreviewUsage(),
        selectedStableMoveKey: frontierDecisionKey(input.def, guidedChoice.matchedDecision),
        finalScore: guidedChoice.score,
        usedFallback: false,
        failure: null,
      };

      return {
        decision: guidedChoice.matchedDecision,
        rng: input.rng,
        agentDecision: buildPolicyAgentDecisionTrace(metadata, this.traceLevel),
      };
    }

    const structuralChoice = chooseStructuralFrontierDecision(input, resolvedProfile, this.profileId, this.traceLevel);
    if (structuralChoice !== null) {
      return structuralChoice;
    }

    const frontier = input.microturn.legalActions.map<FrontierCandidate>((decision) => {
      const nextState = applyPublishedDecision(
        input.def,
        input.state,
        input.microturn,
        decision,
        undefined,
        input.runtime,
      ).state;
      return {
        decision,
        stableMoveKey: frontierDecisionKey(input.def, decision),
        score: evaluateState(input.def, nextState, input.state.activePlayer, input.runtime),
        progressBias: chooseNStepProgressBias(input, decision),
      };
    });
    const bestScore = Math.max(...frontier.map((candidate) => candidate.score));
    const bestByScore = frontier.filter((candidate) => candidate.score === bestScore);
    const bestProgressBias = Math.max(...bestByScore.map((candidate) => candidate.progressBias));
    const bestCandidates = bestByScore.filter((candidate) => candidate.progressBias === bestProgressBias);
    const { item: selected, rng } = pickRandom(bestCandidates, input.rng);
    const metadata: PolicyEvaluationMetadata = {
      seatId: resolvedProfile?.seatId ?? null,
      requestedProfileId: this.profileId ?? null,
      profileId: resolvedProfile?.profileId ?? null,
      profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
      canonicalOrder: frontier.map((candidate) => candidate.stableMoveKey),
      candidates: traceCandidatesForFrontier(this.traceLevel, frontier),
      pruningSteps: [],
      tieBreakChain: [],
      previewUsage: emptyPreviewUsage(),
      selectedStableMoveKey: selected.stableMoveKey,
      finalScore: selected.score,
      usedFallback: false,
      failure: null,
    };

    return {
      decision: selected.decision,
      rng,
      agentDecision: buildPolicyAgentDecisionTrace(metadata, this.traceLevel),
    };
  }

  private matchGuidedCompletionDecision(
    input: AgentMicroturnDecisionInput,
    resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  ): GuidedChoiceMatch {
    if (resolvedProfile === null) {
      return null;
    }
    if (input.microturn.kind !== 'chooseOne' && input.microturn.kind !== 'chooseNStep') {
      return null;
    }

    const choose = buildCompletionChooseCallback({
      state: input.state,
      def: input.def,
      catalog: resolvedProfile.catalog,
      playerId: input.state.activePlayer,
      seatId: resolvedProfile.seatId,
      profile: resolvedProfile.profile,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    });
    if (choose === undefined) {
      return null;
    }

    if (input.microturn.kind === 'chooseOne') {
      return this.matchGuidedChooseOneDecision(input as AgentMicroturnDecisionInput & {
        readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseOne' };
      }, choose, resolvedProfile);
    }
    return this.matchGuidedChooseNStepDecision(input as AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseNStep' };
    }, choose);
  }

  private matchGuidedChooseOneDecision(
    input: AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseOne' };
    },
    choose: (request: ChoicePendingRequest) => ReturnType<NonNullable<ReturnType<typeof buildCompletionChooseCallback>>>,
    resolvedProfile: NonNullable<ReturnType<typeof resolveEffectivePolicyProfile>>,
  ): GuidedChoiceMatch {
    const context = input.microturn.decisionContext as ChooseOneContext;
    const request: ChoicePendingChooseOneRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: context.decisionKey,
      name: String(context.decisionKey),
      options: context.options,
      targetKinds: [],
      type: 'chooseOne',
    };
    const preferredSelection = selectBestCompletionChooseOneValue({
      state: input.state,
      def: input.def,
      catalog: resolvedProfile.catalog,
      playerId: input.state.activePlayer,
      seatId: resolvedProfile.seatId,
      profile: resolvedProfile.profile,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    }, request, { requirePositiveScore: false });
    const preferredValue = preferredSelection?.value ?? choose(request);
    if (preferredValue === undefined || Array.isArray(preferredValue)) {
      return null;
    }
    const matchedDecision = input.microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
        decision.kind === 'chooseOne'
        && decision.decisionKey === context.decisionKey
        && JSON.stringify(decision.value) === JSON.stringify(preferredValue),
    );
    return matchedDecision === undefined
      ? null
      : { matchedDecision, score: preferredSelection?.score ?? 1 };
  }

  private matchGuidedChooseNStepDecision(
    input: AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseNStep' };
    },
    choose: (request: ChoicePendingRequest) => ReturnType<NonNullable<ReturnType<typeof buildCompletionChooseCallback>>>,
  ): GuidedChoiceMatch {
    const context = input.microturn.decisionContext as ChooseNStepContext;
    const request: ChoicePendingChooseNRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: context.decisionKey,
      name: String(context.decisionKey),
      options: context.options,
      targetKinds: [],
      type: 'chooseN',
      min: context.cardinality.min,
      max: context.cardinality.max,
      selected: context.selectedSoFar,
      canConfirm: context.stepCommands.includes('confirm'),
    };
    const preferredSelection = choose(request);
    if (preferredSelection === undefined) {
      return null;
    }
    const preferredValues = Array.isArray(preferredSelection)
      ? preferredSelection
      : [preferredSelection];
    const currentValues = context.selectedSoFar;
    const nextAdd = preferredValues.find((value) => !currentValues.some((selected: string | number | boolean) => selected === value));
    if (nextAdd !== undefined) {
      const matchedAdd = input.microturn.legalActions.find(
        (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
          decision.kind === 'chooseNStep'
          && decision.decisionKey === context.decisionKey
          && decision.command === 'add'
          && decision.value === nextAdd,
      );
      if (matchedAdd !== undefined) {
        return { matchedDecision: matchedAdd, score: 1 };
      }
    }

    const reachedPreferredSet = preferredValues.length === currentValues.length
      && preferredValues.every((value) => currentValues.some((selected: string | number | boolean) => selected === value));
    if (reachedPreferredSet) {
      const matchedConfirm = input.microturn.legalActions.find(
        (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
          decision.kind === 'chooseNStep'
          && decision.decisionKey === context.decisionKey
          && decision.command === 'confirm',
      );
      if (matchedConfirm !== undefined) {
        return { matchedDecision: matchedConfirm, score: 1 };
      }
    }

    return null;
  }
}
