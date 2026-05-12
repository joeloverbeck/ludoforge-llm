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
  CandidateParamUnavailabilityReason,
  LookupUnavailabilityReason,
} from '../kernel/types.js';
import {
  buildMicroturnChooseCallback,
  microturnConsiderationIdsForProfile,
  selectBestMicroturnChooseOneValue,
} from './microturn-option-evaluator.js';
import { pickRandom } from './agent-move-selection.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import {
  emptyPreviewUsage,
  evaluatePolicyMove,
  type PolicyPreviewSignalUnavailableAdvisory,
  type PolicyEvaluationMetadata,
} from './policy-eval.js';
import type { CompletionScoreContribution } from './microturn-option-eval.js';
import { scoreMicroturnOptionWithContributions } from './microturn-option-eval.js';
import type { PolicyLookupFallbackFired, PolicyPreviewFallbackFired } from './policy-evaluation-core.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import type { PreviewOptionProjectedState } from './policy-runtime.js';
import type { PreviewWideningState } from './preview-budget-allocator.js';
import {
  createPolicyAgentChooseNStepInnerPreview,
  createPolicyAgentChooseOneInnerPreview,
  type PolicyAgentInnerPreview,
} from './policy-agent-inner-preview.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';
import type { PolicyPreviewUnavailabilityReason } from './policy-preview.js';

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
  readonly previewRefIds?: readonly string[];
  readonly unknownPreviewRefs?: ReadonlyMap<string, PolicyPreviewUnavailabilityReason>;
  readonly unknownLookupRefs?: ReadonlyMap<string, LookupUnavailabilityReason>;
  readonly unknownCandidateParamRefs?: ReadonlyMap<string, CandidateParamUnavailabilityReason>;
  readonly previewFallbackFired?: PolicyPreviewFallbackFired;
  readonly lookupFallbackFired?: PolicyLookupFallbackFired;
  readonly previewOutcome?: NonNullable<PolicyEvaluationMetadata['candidates'][number]['previewOutcome']>;
  readonly previewDrive?: NonNullable<PolicyEvaluationMetadata['candidates'][number]['previewDrive']>;
}

interface FrontierScoring {
  readonly scoreContributionsByOption: ReadonlyMap<string, readonly CompletionScoreContribution[]>;
  readonly unknownPreviewRefsByOption: ReadonlyMap<string, ReadonlyMap<string, PolicyPreviewUnavailabilityReason>>;
  readonly unknownLookupRefsByOption: ReadonlyMap<string, ReadonlyMap<string, LookupUnavailabilityReason>>;
  readonly previewFallbackFiredByOption: ReadonlyMap<string, PolicyPreviewFallbackFired>;
  readonly lookupFallbackFiredByOption: ReadonlyMap<string, PolicyLookupFallbackFired>;
}

const POLICY_TRACE_INTERVAL = 25;
let policyChooseCallCount = 0;

const shouldLogPolicyOomTrace = (): boolean => process.env.ENGINE_OOM_TRACE === '1';

const heapUsedMb = (): number => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

const shouldEmitPolicyTrace = (legalActionCount: number): boolean => {
  if (!shouldLogPolicyOomTrace()) {
    return false;
  }
  return legalActionCount >= 8 || policyChooseCallCount % POLICY_TRACE_INTERVAL === 0;
};

const logPolicyOomTrace = (
  label: string,
  input: AgentMicroturnDecisionInput,
  extras = '',
): void => {
  if (!shouldEmitPolicyTrace(input.microturn.legalActions.length)) {
    return;
  }
  console.error(
    `[oom-trace] policy:${label} turn=${input.state.turnCount} kind=${input.microturn.kind} legal=${input.microturn.legalActions.length} heapMb=${heapUsedMb()}${extras}`,
  );
};

const traceCandidatesForFrontier = (
  traceLevel: PolicyDecisionTraceLevel,
  frontier: readonly FrontierCandidate[],
  selectedStableMoveKey: string,
  previewUsage: PolicyEvaluationMetadata['previewUsage'],
  scoreContributionsByOption?: ReadonlyMap<string, readonly CompletionScoreContribution[]>,
): PolicyEvaluationMetadata['candidates'] => traceLevel === 'verbose'
  ? frontier.map((candidate) => ({
      actionId: candidate.decision.kind === 'actionSelection' ? String(candidate.decision.actionId) : candidate.decision.kind,
      stableMoveKey: candidate.stableMoveKey,
      score: candidate.score,
      prunedBy: [],
      scoreContributions: [...(scoreContributionsByOption?.get(candidate.stableMoveKey) ?? [])],
      previewRefIds: [...(candidate.previewRefIds ?? [])],
      unknownPreviewRefs: traceUnknownPreviewRefs(candidate.unknownPreviewRefs),
      unknownLookupRefs: traceUnknownLookupRefs(candidate.unknownLookupRefs),
      unknownCandidateParamRefs: traceUnknownCandidateParamRefs(candidate.unknownCandidateParamRefs),
      ...(candidate.previewFallbackFired === undefined ? {} : { previewFallbackFired: candidate.previewFallbackFired }),
      ...(candidate.lookupFallbackFired === undefined ? {} : { lookupFallbackFired: candidate.lookupFallbackFired }),
      selectionReason: selectionReasonForFrontierCandidate(candidate, selectedStableMoveKey, previewUsage),
      ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
      ...(candidate.previewDrive === undefined ? {} : { previewDrive: candidate.previewDrive }),
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

const traceUnknownPreviewRefs = (
  unknownPreviewRefs: ReadonlyMap<string, PolicyPreviewUnavailabilityReason> | undefined,
): PolicyEvaluationMetadata['candidates'][number]['unknownPreviewRefs'] => [...(unknownPreviewRefs?.entries() ?? [])]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([refId, reason]) => ({ refId, reason }));

const traceUnknownLookupRefs = (
  unknownLookupRefs: ReadonlyMap<string, LookupUnavailabilityReason> | undefined,
): PolicyEvaluationMetadata['candidates'][number]['unknownLookupRefs'] => [...(unknownLookupRefs?.entries() ?? [])]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([refId, reason]) => ({ refId, reason }));

const traceUnknownCandidateParamRefs = (
  unknownCandidateParamRefs: ReadonlyMap<string, CandidateParamUnavailabilityReason> | undefined,
): PolicyEvaluationMetadata['candidates'][number]['unknownCandidateParamRefs'] => [...(unknownCandidateParamRefs?.entries() ?? [])]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([refId, reason]) => ({ refId, reason }));

const selectionReasonForFrontierCandidate = (
  candidate: FrontierCandidate,
  selectedStableMoveKey: string,
  previewUsage: PolicyEvaluationMetadata['previewUsage'],
): PolicyEvaluationMetadata['candidates'][number]['selectionReason'] => {
  if (candidate.stableMoveKey !== selectedStableMoveKey) {
    return 'gated';
  }
  if (
    candidate.previewFallbackFired?.kind === 'constant'
    || candidate.lookupFallbackFired?.kind === 'constant'
  ) {
    return 'fallbackExplicit';
  }
  if (
    previewUsage.coverage.selectedByTieBreakerBecausePreviewUnavailable
    && previewUsage.coverage.requestedRefCount > 0
  ) {
    return 'tiebreakAfterPreviewNoSignal';
  }
  return candidate.score !== candidate.progressBias ? 'scored' : 'tiebreak';
};

const unavailabilityBreakdownFor = (
  frontier: readonly FrontierCandidate[],
  previewUsage?: PolicyEvaluationMetadata['previewUsage'],
): Readonly<Record<PolicyPreviewUnavailabilityReason, number>> => {
  const breakdown: Record<PolicyPreviewUnavailabilityReason, number> & { afterDeepPass?: number } = {
    random: 0,
    hidden: 0,
    unresolved: 0,
    failed: 0,
    depthCap: 0,
    noPreviewDecision: 0,
    gated: 0,
  };
  for (const candidate of frontier) {
    for (const reason of candidate.unknownPreviewRefs?.values() ?? []) {
      breakdown[reason] += 1;
    }
  }
  if (previewUsage?.coverage.deep !== undefined) {
    breakdown.afterDeepPass = previewUsage.coverage.deep.unavailableRootOptionCount;
  }
  return breakdown;
};

const decisionTraceInfo = (
  input: AgentMicroturnDecisionInput,
): { readonly decisionKind: 'chooseOne' | 'chooseNStep'; readonly decisionKey: string } | undefined => {
  if (input.microturn.kind === 'chooseOne' || input.microturn.kind === 'chooseNStep') {
    return {
      decisionKind: input.microturn.kind,
      decisionKey: String((input.microturn.decisionContext as ChooseOneContext | ChooseNStepContext).decisionKey),
    };
  }
  return undefined;
};

const buildSignalUnavailableAdvisory = (
  input: AgentMicroturnDecisionInput,
  metadata: Pick<
    PolicyEvaluationMetadata,
    'profileId' | 'seatId' | 'selectedStableMoveKey' | 'previewUsage'
  >,
  frontier: readonly FrontierCandidate[],
): PolicyPreviewSignalUnavailableAdvisory | undefined => {
  const decisionInfo = decisionTraceInfo(input);
  if (
    decisionInfo === undefined
    || metadata.profileId === null
    || metadata.seatId === null
    || metadata.selectedStableMoveKey === null
    || metadata.previewUsage.coverage.allRootsUnavailable !== true
    || metadata.previewUsage.coverage.requestedRefCount === 0
  ) {
    return undefined;
  }
  return {
    code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE',
    profileId: metadata.profileId,
    seatId: metadata.seatId,
    decisionKind: decisionInfo.decisionKind,
    decisionKey: decisionInfo.decisionKey,
    requestedRefs: [...metadata.previewUsage.refIds],
    evaluatedRootOptionCount: metadata.previewUsage.coverage.evaluatedRootOptionCount,
    unavailableRootOptionCount: metadata.previewUsage.coverage.unavailableRootOptionCount,
    unavailabilityBreakdown: unavailabilityBreakdownFor(frontier, metadata.previewUsage),
    selectedStableMoveKey: metadata.selectedStableMoveKey,
    selectionReason: 'tiebreakAfterPreviewNoSignal',
  };
};

const unknownPreviewRefsFromStatuses = (
  statuses: ReadonlyMap<string, PreviewOptionRefStatus> | undefined,
): ReadonlyMap<string, PolicyPreviewUnavailabilityReason> | undefined => {
  if (statuses === undefined) {
    return undefined;
  }
  const unknown = new Map<string, PolicyPreviewUnavailabilityReason>();
  for (const [refId, status] of statuses) {
    if (status.kind === 'unavailable') {
      unknown.set(refId, status.reason);
    }
  }
  return unknown;
};

const scoreFrontierForTrace = (
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  previewOptionResolvedRefsByOptionKey?: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>,
  previewOptionProjectedStateByOptionKey?: ReadonlyMap<string, PreviewOptionProjectedState>,
): FrontierScoring | undefined => {
  if (resolvedProfile === null || (input.microturn.kind !== 'chooseOne' && input.microturn.kind !== 'chooseNStep')) {
    return undefined;
  }
  const considerationIds = microturnConsiderationIdsForProfile(resolvedProfile.catalog, resolvedProfile.profile);
  if (considerationIds.length === 0) {
    return undefined;
  }
  const scoreContributionsByOption = new Map<string, readonly CompletionScoreContribution[]>();
  const unknownPreviewRefsByOption = new Map<string, ReadonlyMap<string, PolicyPreviewUnavailabilityReason>>();
  const unknownLookupRefsByOption = new Map<string, ReadonlyMap<string, LookupUnavailabilityReason>>();
  const previewFallbackFiredByOption = new Map<string, PolicyPreviewFallbackFired>();
  const lookupFallbackFiredByOption = new Map<string, PolicyLookupFallbackFired>();
  const record = (stableMoveKey: string, scored: ReturnType<typeof scoreMicroturnOptionWithContributions>): void => {
    scoreContributionsByOption.set(stableMoveKey, scored.scoreContributions);
    unknownPreviewRefsByOption.set(stableMoveKey, scored.unknownPreviewRefs);
    unknownLookupRefsByOption.set(stableMoveKey, scored.unknownLookupRefs);
    if (scored.previewFallbackFired !== undefined) {
      previewFallbackFiredByOption.set(stableMoveKey, scored.previewFallbackFired);
    }
    if (scored.lookupFallbackFired !== undefined) {
      lookupFallbackFiredByOption.set(stableMoveKey, scored.lookupFallbackFired);
    }
  };

  if (input.microturn.kind === 'chooseOne') {
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
    for (const decision of input.microturn.legalActions) {
      if (decision.kind !== 'chooseOne' || decision.decisionKey !== context.decisionKey) {
        continue;
      }
      const stableMoveKey = frontierDecisionKey(input.def, decision);
      const optionIndex = context.options.findIndex((option) => Object.is(option.value, decision.value));
      record(stableMoveKey, scoreMicroturnOptionWithContributions(
        input.state,
        input.def,
        resolvedProfile.catalog,
        input.state.activePlayer,
        resolvedProfile.seatId,
        resolvedProfile.profile.params,
        request,
        decision.value,
        optionIndex,
        considerationIds,
        input.runtime,
        previewOptionResolvedRefsByOptionKey?.get(stableMoveKey),
        previewOptionProjectedStateByOptionKey?.get(stableMoveKey),
      ));
    }
    return { scoreContributionsByOption, unknownPreviewRefsByOption, unknownLookupRefsByOption, previewFallbackFiredByOption, lookupFallbackFiredByOption };
  }

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
  for (const decision of input.microturn.legalActions) {
    if (
      decision.kind !== 'chooseNStep'
      || decision.decisionKey !== context.decisionKey
      || decision.command !== 'add'
      || decision.value === undefined
    ) {
      continue;
    }
    const stableMoveKey = frontierDecisionKey(input.def, decision);
    const optionIndex = context.options.findIndex((option) => Object.is(option.value, decision.value));
    record(stableMoveKey, scoreMicroturnOptionWithContributions(
      input.state,
      input.def,
      resolvedProfile.catalog,
      input.state.activePlayer,
      resolvedProfile.seatId,
      resolvedProfile.profile.params,
      request,
      decision.value,
      optionIndex,
      considerationIds,
      input.runtime,
      previewOptionResolvedRefsByOptionKey?.get(stableMoveKey),
      previewOptionProjectedStateByOptionKey?.get(stableMoveKey),
    ));
  }
  return { scoreContributionsByOption, unknownPreviewRefsByOption, unknownLookupRefsByOption, previewFallbackFiredByOption, lookupFallbackFiredByOption };
};

const chooseStructuralFrontierDecision = (
  input: AgentMicroturnDecisionInput,
  resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  profileIdOverride: string | undefined,
  traceLevel: PolicyDecisionTraceLevel,
  innerPreview?: PolicyAgentInnerPreview,
  frontierScoring?: FrontierScoring,
): AgentMicroturnDecisionResult => {
  const previewByOptionKey = innerPreview?.byOptionKey;
  const innerPreviewRefIds = innerPreview?.refIds ?? [];
  const frontier = input.microturn.legalActions.map<FrontierCandidate>((decision) => {
    const stableMoveKey = frontierDecisionKey(input.def, decision);
    const previewOption = previewByOptionKey?.get(stableMoveKey);
    const unknownPreviewRefs = frontierScoring?.unknownPreviewRefsByOption.get(stableMoveKey)
      ?? unknownPreviewRefsFromStatuses(innerPreview?.refsByOptionKey.get(stableMoveKey));
    const unknownLookupRefs = frontierScoring?.unknownLookupRefsByOption.get(stableMoveKey);
    const previewFallbackFired = frontierScoring?.previewFallbackFiredByOption.get(stableMoveKey);
    const lookupFallbackFired = frontierScoring?.lookupFallbackFiredByOption.get(stableMoveKey);
    return {
      decision,
      stableMoveKey,
      score: chooseNStepProgressBias(input, decision),
      progressBias: chooseNStepProgressBias(input, decision),
      ...(unknownLookupRefs === undefined ? {} : { unknownLookupRefs }),
      ...(lookupFallbackFired === undefined ? {} : { lookupFallbackFired }),
      ...(previewOption === undefined
        ? {}
        : {
            previewRefIds: innerPreviewRefIds,
            ...(unknownPreviewRefs === undefined ? {} : { unknownPreviewRefs }),
            ...(previewFallbackFired === undefined ? {} : { previewFallbackFired }),
            previewOutcome: previewOption.outcome,
            previewDrive: previewOption.previewDrive,
          }),
    };
  });
  const bestProgressBias = Math.max(...frontier.map((candidate) => candidate.progressBias));
  const bestCandidates = frontier.filter((candidate) => candidate.progressBias === bestProgressBias);
  const { item: selected, rng } = pickRandom(bestCandidates, input.rng);
  const metadata: PolicyEvaluationMetadata = {
    seatId: resolvedProfile?.seatId ?? null,
    requestedProfileId: profileIdOverride ?? null,
    profileId: resolvedProfile?.profileId ?? null,
    profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
    canonicalOrder: frontier.map((candidate) => candidate.stableMoveKey),
    candidates: traceCandidatesForFrontier(
      traceLevel,
      frontier,
      selected.stableMoveKey,
      innerPreview?.usage ?? emptyPreviewUsage('disabled'),
      frontierScoring?.scoreContributionsByOption,
    ),
    pruningSteps: [],
    tieBreakChain: [],
    previewUsage: innerPreview?.usage ?? emptyPreviewUsage('disabled'),
    selectedStableMoveKey: selected.stableMoveKey,
    finalScore: selected.score,
    usedFallback: false,
    failure: null,
  };
  const advisory = buildSignalUnavailableAdvisory(input, metadata, frontier);
  const metadataWithAdvisories: PolicyEvaluationMetadata = advisory === undefined
    ? metadata
    : { ...metadata, advisories: [advisory] };

  return {
    decision: selected.decision,
    rng,
    ...(traceLevel === 'none' ? {} : { agentDecision: buildPolicyAgentDecisionTrace(metadataWithAdvisories, traceLevel) }),
  };
};

type GuidedChoiceMatch =
  | {
      readonly matchedDecision: Decision;
      readonly score: number;
      readonly scoreContributionsByOption: ReadonlyMap<string, readonly CompletionScoreContribution[]>;
      readonly unknownPreviewRefsByOption: ReadonlyMap<string, ReadonlyMap<string, PolicyPreviewUnavailabilityReason>>;
      readonly unknownLookupRefsByOption: ReadonlyMap<string, ReadonlyMap<string, LookupUnavailabilityReason>>;
      readonly previewFallbackFiredByOption: ReadonlyMap<string, PolicyPreviewFallbackFired>;
      readonly lookupFallbackFiredByOption: ReadonlyMap<string, PolicyLookupFallbackFired>;
    }
  | null;

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
  private readonly previewWideningState: PreviewWideningState = new Map();

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

    policyChooseCallCount += 1;
    logPolicyOomTrace('choose:start', input);
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
    logPolicyOomTrace('actionSelection:prepared', input, ` actionMoves=${actionDecisions.length}`);
    if (actionDecisions.length === 0) {
      return this.chooseFrontierDecision(input);
    }

    const traceHeapDelta = shouldLogPolicyOomTrace();
    const evalHeapBefore = traceHeapDelta ? heapUsedMb() : 0;
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
      ...(this.traceLevel === 'none' ? { diagnosticsMode: 'disabled' as const } : {}),
      traceLevel: this.traceLevel,
      previewWideningState: this.previewWideningState,
      previewDecisionContext: {
        turnId: Number(input.microturn.turnId),
        seatId: String(input.microturn.seatId),
      },
    });
    logPolicyOomTrace(
      'actionSelection:evaluated',
      input,
      ` actionMoves=${actionDecisions.length} heapDeltaMb=${traceHeapDelta ? heapUsedMb() - evalHeapBefore : 'n/a'} finalScore=${evaluation.metadata.finalScore ?? 'null'}`,
    );
    const selectedDecision = actionDecisions.find((decision) => decision.move === evaluation.move)
      ?? actionDecisions.find(
        (decision) => decision.move !== undefined
          && toMoveIdentityKey(input.def, decision.move) === evaluation.metadata.selectedStableMoveKey,
      );
    if (selectedDecision === undefined) {
      throw new Error('PolicyAgent selected a move that was not present in the published action frontier.');
    }

    return {
      decision: selectedDecision,
      rng: evaluation.rng,
      ...(this.traceLevel === 'none' ? {} : { agentDecision: buildPolicyAgentDecisionTrace(evaluation.metadata, this.traceLevel) }),
    };
  }

  private chooseFrontierDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult {
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, this.profileId);
    const innerPreview = input.microturn.kind === 'chooseOne'
      ? createPolicyAgentChooseOneInnerPreview(input, resolvedProfile)
      : input.microturn.kind === 'chooseNStep'
        ? createPolicyAgentChooseNStepInnerPreview(input, resolvedProfile)
        : undefined;
    const innerPreviewByOptionKey = innerPreview?.byOptionKey;
    const innerPreviewRefIds = innerPreview?.refIds ?? [];
    const guidedChoice = this.disableGuidedChooser
      ? null
      : this.matchGuidedCompletionDecision(
          input,
          resolvedProfile,
          innerPreview?.refsByOptionKey,
          innerPreview?.projectedStateByOptionKey,
    );
    if (guidedChoice !== null) {
      const selectedStableMoveKey = frontierDecisionKey(input.def, guidedChoice.matchedDecision);
      const previewUsage = innerPreview?.usage ?? emptyPreviewUsage('disabled');
      const frontier = input.microturn.legalActions.map<FrontierCandidate>((decision) => {
        const stableMoveKey = frontierDecisionKey(input.def, decision);
        const previewOption = innerPreviewByOptionKey?.get(stableMoveKey);
        const unknownPreviewRefs = guidedChoice.unknownPreviewRefsByOption.get(stableMoveKey)
          ?? unknownPreviewRefsFromStatuses(innerPreview?.refsByOptionKey.get(stableMoveKey));
        const unknownLookupRefs = guidedChoice.unknownLookupRefsByOption.get(stableMoveKey);
        const previewFallbackFired = guidedChoice.previewFallbackFiredByOption.get(stableMoveKey);
        const lookupFallbackFired = guidedChoice.lookupFallbackFiredByOption.get(stableMoveKey);
        const scoreContributions = guidedChoice.scoreContributionsByOption.get(stableMoveKey) ?? [];
        const score = decision === guidedChoice.matchedDecision
          ? guidedChoice.score
          : scoreContributions.reduce((total, contribution) => total + contribution.contribution, 0);
        return {
          decision,
          stableMoveKey,
          score,
          progressBias: chooseNStepProgressBias(input, decision),
          ...(unknownLookupRefs === undefined ? {} : { unknownLookupRefs }),
          ...(lookupFallbackFired === undefined ? {} : { lookupFallbackFired }),
          ...(previewOption === undefined
            ? {}
            : {
                previewRefIds: innerPreviewRefIds,
                ...(unknownPreviewRefs === undefined ? {} : { unknownPreviewRefs }),
                ...(previewFallbackFired === undefined ? {} : { previewFallbackFired }),
                previewOutcome: previewOption.outcome,
                previewDrive: previewOption.previewDrive,
              }),
        };
      });
      const metadata: PolicyEvaluationMetadata = {
        seatId: resolvedProfile?.seatId ?? null,
        requestedProfileId: this.profileId ?? null,
        profileId: resolvedProfile?.profileId ?? null,
        profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
        canonicalOrder: input.microturn.legalActions.map((decision) => frontierDecisionKey(input.def, decision)),
        candidates: traceCandidatesForFrontier(
          this.traceLevel,
          frontier,
          selectedStableMoveKey,
          previewUsage,
          guidedChoice.scoreContributionsByOption,
        ),
        pruningSteps: [],
        tieBreakChain: [],
        previewUsage,
        selectedStableMoveKey,
        finalScore: guidedChoice.score,
        usedFallback: false,
        failure: null,
      };
      const advisory = buildSignalUnavailableAdvisory(input, metadata, frontier);
      const metadataWithAdvisories: PolicyEvaluationMetadata = advisory === undefined
        ? metadata
        : { ...metadata, advisories: [advisory] };

      return {
        decision: guidedChoice.matchedDecision,
        rng: input.rng,
        ...(this.traceLevel === 'none' ? {} : { agentDecision: buildPolicyAgentDecisionTrace(metadataWithAdvisories, this.traceLevel) }),
      };
    }

    const frontierScoring = this.traceLevel === 'verbose'
      ? scoreFrontierForTrace(input, resolvedProfile, innerPreview?.refsByOptionKey, innerPreview?.projectedStateByOptionKey)
      : undefined;
    return chooseStructuralFrontierDecision(
      input,
      resolvedProfile,
      this.profileId,
      this.traceLevel,
      innerPreview,
      frontierScoring,
    );
  }

  private matchGuidedCompletionDecision(
    input: AgentMicroturnDecisionInput,
    resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
    previewOptionResolvedRefsByOptionKey?: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>,
    previewOptionProjectedStateByOptionKey?: ReadonlyMap<string, PreviewOptionProjectedState>,
  ): GuidedChoiceMatch {
    if (resolvedProfile === null) {
      return null;
    }
    if (input.microturn.kind !== 'chooseOne' && input.microturn.kind !== 'chooseNStep') {
      return null;
    }

    const choose = buildMicroturnChooseCallback({
      state: input.state,
      def: input.def,
      catalog: resolvedProfile.catalog,
      playerId: input.state.activePlayer,
      seatId: resolvedProfile.seatId,
      profile: resolvedProfile.profile,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(previewOptionResolvedRefsByOptionKey === undefined ? {} : { previewOptionResolvedRefsByOptionKey }),
      ...(previewOptionProjectedStateByOptionKey === undefined ? {} : { previewOptionProjectedStateByOptionKey }),
    });
    if (choose === undefined) {
      return null;
    }

    if (input.microturn.kind === 'chooseOne') {
      return this.matchGuidedChooseOneDecision(input as AgentMicroturnDecisionInput & {
        readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseOne' };
      }, choose, resolvedProfile, previewOptionResolvedRefsByOptionKey, previewOptionProjectedStateByOptionKey);
    }
    return this.matchGuidedChooseNStepDecision(input as AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseNStep' };
    }, choose);
  }

  private matchGuidedChooseOneDecision(
    input: AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseOne' };
    },
    choose: (request: ChoicePendingRequest) => ReturnType<NonNullable<ReturnType<typeof buildMicroturnChooseCallback>>>,
    resolvedProfile: NonNullable<ReturnType<typeof resolveEffectivePolicyProfile>>,
    previewOptionResolvedRefsByOptionKey?: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>,
    previewOptionProjectedStateByOptionKey?: ReadonlyMap<string, PreviewOptionProjectedState>,
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
    const preferredSelection = selectBestMicroturnChooseOneValue({
      state: input.state,
      def: input.def,
      catalog: resolvedProfile.catalog,
      playerId: input.state.activePlayer,
      seatId: resolvedProfile.seatId,
      profile: resolvedProfile.profile,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(previewOptionResolvedRefsByOptionKey === undefined ? {} : { previewOptionResolvedRefsByOptionKey }),
      ...(previewOptionProjectedStateByOptionKey === undefined ? {} : { previewOptionProjectedStateByOptionKey }),
    }, request, { requirePositiveScore: false });
    const fallbackSelection = preferredSelection ?? choose(request);
    if (fallbackSelection === undefined || Array.isArray(fallbackSelection.value)) {
      return null;
    }
    const preferredValue = fallbackSelection.value;
    const matchedDecision = input.microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
        decision.kind === 'chooseOne'
        && decision.decisionKey === context.decisionKey
        && JSON.stringify(decision.value) === JSON.stringify(preferredValue),
    );
    return matchedDecision === undefined
      ? null
      : {
        matchedDecision,
        score: fallbackSelection.score,
        scoreContributionsByOption: fallbackSelection.scoreContributionsByOption,
        unknownPreviewRefsByOption: fallbackSelection.unknownPreviewRefsByOption,
        unknownLookupRefsByOption: fallbackSelection.unknownLookupRefsByOption,
        previewFallbackFiredByOption: fallbackSelection.previewFallbackFiredByOption,
        lookupFallbackFiredByOption: fallbackSelection.lookupFallbackFiredByOption,
      };
  }

  private matchGuidedChooseNStepDecision(
    input: AgentMicroturnDecisionInput & {
      readonly microturn: AgentMicroturnDecisionInput['microturn'] & { readonly kind: 'chooseNStep' };
    },
    choose: (request: ChoicePendingRequest) => ReturnType<NonNullable<ReturnType<typeof buildMicroturnChooseCallback>>>,
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
    const preferredValues = Array.isArray(preferredSelection.value)
      ? preferredSelection.value
      : [preferredSelection.value];
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
        return {
          matchedDecision: matchedAdd,
          score: preferredSelection.scoreContributionsByOption.get(frontierDecisionKey(input.def, matchedAdd))
            ?.reduce((total, contribution) => total + contribution.contribution, 0) ?? 0,
          scoreContributionsByOption: preferredSelection.scoreContributionsByOption,
          unknownPreviewRefsByOption: preferredSelection.unknownPreviewRefsByOption,
          unknownLookupRefsByOption: preferredSelection.unknownLookupRefsByOption,
          previewFallbackFiredByOption: preferredSelection.previewFallbackFiredByOption,
          lookupFallbackFiredByOption: preferredSelection.lookupFallbackFiredByOption,
        };
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
        return {
          matchedDecision: matchedConfirm,
          score: 0,
          scoreContributionsByOption: preferredSelection.scoreContributionsByOption,
          unknownPreviewRefsByOption: preferredSelection.unknownPreviewRefsByOption,
          unknownLookupRefsByOption: preferredSelection.unknownLookupRefsByOption,
          previewFallbackFiredByOption: preferredSelection.previewFallbackFiredByOption,
          lookupFallbackFiredByOption: preferredSelection.lookupFallbackFiredByOption,
        };
      }
    }

    return null;
  }
}
