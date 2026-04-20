import { applyTrustedMove } from '../kernel/apply-move.js';
import { applyDecision } from '../kernel/microturn/apply.js';
import type { ChooseNStepContext, ChooseOneContext, Decision } from '../kernel/microturn/types.js';
import { perfStart, perfDynEnd } from '../kernel/perf-profiler.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { enumerateLegalMoves } from '../kernel/legal-moves.js';
import type {
  Agent,
  AgentLegacyDecisionInput,
  AgentLegacyDecisionResult,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
  ChoicePendingRequest,
  ChoicePendingChooseNRequest,
  ChoicePendingChooseOneRequest,
} from '../kernel/types.js';
import { buildCompletionChooseCallback } from './completion-guidance-choice.js';
import { createNoPlayableMoveInvariantError, pickRandom } from './agent-move-selection.js';
import {
  evaluatePolicyMove,
  type PolicyEvaluationFailure,
  type PolicyEvaluationMetadata,
} from './policy-eval.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import { applyPreviewMove, getSeatMargin, type Phase1ActionPreviewEntry } from './policy-preview.js';
import type { PolicyPreviewDependencies } from './policy-preview.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';
import { evaluateState } from './evaluate-state.js';

const DEFAULT_COMPLETIONS_PER_TEMPLATE = 3;

const emptyActionFilterFailure = (
  actionId: string,
): PolicyEvaluationFailure => ({
  code: 'PHASE1_ACTION_FILTER_EMPTY',
  message: `PolicyAgent phase-1 selected action "${actionId}" but phase-2 preparation produced no candidates; widened to broader prepared moves.`,
  detail: {
    actionId,
  },
});

export interface PolicyAgentConfig {
  readonly profileId?: string;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly fallbackOnError?: boolean;
  readonly completionsPerTemplate?: number;
  readonly disableGuidedChooser?: boolean;
}

interface FrontierCandidate {
  readonly decision: Decision;
  readonly stableMoveKey: string;
  readonly score: number;
}

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
  private readonly plannedMovesByTurnId = new Map<number, AgentLegacyDecisionResult['move']>();
  private readonly profileId: string | undefined;
  private readonly traceLevel: PolicyDecisionTraceLevel;
  private readonly fallbackOnError: boolean | undefined;
  private readonly completionsPerTemplate: number;
  private readonly disableGuidedChooser: boolean;

  constructor(config: PolicyAgentConfig = {}) {
    const { completionsPerTemplate } = config;
    if (
      completionsPerTemplate !== undefined
      && (!Number.isSafeInteger(completionsPerTemplate) || completionsPerTemplate < 1)
    ) {
      throw new RangeError('PolicyAgent completionsPerTemplate must be a positive safe integer');
    }
    this.profileId = config.profileId;
    this.traceLevel = config.traceLevel ?? 'summary';
    this.fallbackOnError = config.fallbackOnError;
    this.completionsPerTemplate = completionsPerTemplate ?? DEFAULT_COMPLETIONS_PER_TEMPLATE;
    this.disableGuidedChooser = config.disableGuidedChooser ?? false;
  }

  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult;
  chooseDecision(input: AgentLegacyDecisionInput): AgentLegacyDecisionResult;
  chooseDecision(input: AgentMicroturnDecisionInput | AgentLegacyDecisionInput): AgentMicroturnDecisionResult | AgentLegacyDecisionResult {
    if ('microturn' in input) {
      if (input.microturn.legalActions.length === 0) {
        throw new Error('PolicyAgent.chooseDecision called with empty legalActions');
      }

      const t0_eval = perfStart(input.profiler);
      const result = input.microturn.kind === 'actionSelection'
        ? this.chooseActionSelectionDecision(input)
        : this.chooseFrontierDecision(input);
      perfDynEnd(input.profiler, 'agent:evaluatePolicyExpression', t0_eval);
      return result;
    }

    return this.chooseLegacyMove(input);
  }

  private chooseActionSelectionDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult {
    const plannedResult = this.choosePlannedActionSelectionDecision(input);
    if (plannedResult !== null) {
      return plannedResult;
    }

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

  private choosePlannedActionSelectionDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult | null {
    const legalMoves = enumerateLegalMoves(input.def, input.state, undefined, input.runtime).moves;
    if (legalMoves.length === 0) {
      return null;
    }

    const legacy = this.chooseLegacyMove({
      def: input.def,
      state: input.state,
      playerId: input.state.activePlayer,
      legalMoves,
      rng: input.rng,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(input.profiler === undefined ? {} : { profiler: input.profiler }),
    });

    const selectedDecision = input.microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
        decision.kind === 'actionSelection'
        && matchesPublishedActionDecision(input.def, decision, legacy.move.move),
    );
    if (selectedDecision === undefined) {
      return null;
    }

    this.prunePlannedMoves(input.microturn.turnId);
    this.plannedMovesByTurnId.set(Number(input.microturn.turnId), legacy.move);
    return {
      decision: selectedDecision,
      rng: legacy.rng,
      ...(legacy.agentDecision === undefined ? {} : { agentDecision: legacy.agentDecision }),
    };
  }

  private chooseFrontierDecision(
    input: AgentMicroturnDecisionInput,
  ): AgentMicroturnDecisionResult {
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, this.profileId);
    const plannedDecision = this.matchPlannedDecision(input);
    if (plannedDecision !== null) {
      const metadata: PolicyEvaluationMetadata = {
        seatId: resolvedProfile?.seatId ?? null,
        requestedProfileId: this.profileId ?? null,
        profileId: resolvedProfile?.profileId ?? null,
        profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
        canonicalOrder: input.microturn.legalActions.map((decision) => frontierDecisionKey(input.def, decision)),
        candidates: input.microturn.legalActions.map((decision) => ({
          actionId: decision.kind === 'actionSelection' ? String(decision.actionId) : decision.kind,
          stableMoveKey: frontierDecisionKey(input.def, decision),
          score: decision === plannedDecision ? 1 : 0,
          prunedBy: [],
          scoreContributions: [],
          previewRefIds: [],
          unknownPreviewRefs: [],
        })),
        pruningSteps: [],
        tieBreakChain: [],
        previewUsage: emptyPreviewUsage(),
        selectedStableMoveKey: frontierDecisionKey(input.def, plannedDecision),
        finalScore: 1,
        usedFallback: false,
        failure: null,
      };
      return {
        decision: plannedDecision,
        rng: input.rng,
        agentDecision: buildPolicyAgentDecisionTrace(metadata, this.traceLevel),
      };
    }

    const guidedChoice = this.matchGuidedCompletionDecision(input, resolvedProfile);
    if (guidedChoice !== null) {
      const metadata: PolicyEvaluationMetadata = {
        seatId: resolvedProfile?.seatId ?? null,
        requestedProfileId: this.profileId ?? null,
        profileId: resolvedProfile?.profileId ?? null,
        profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
        canonicalOrder: input.microturn.legalActions.map((decision) => frontierDecisionKey(input.def, decision)),
        candidates: input.microturn.legalActions.map((decision) => ({
          actionId: decision.kind === 'actionSelection' ? String(decision.actionId) : decision.kind,
          stableMoveKey: frontierDecisionKey(input.def, decision),
          score: decision === guidedChoice.matchedDecision ? guidedChoice.score : 0,
          prunedBy: [],
          scoreContributions: [],
          previewRefIds: [],
          unknownPreviewRefs: [],
        })),
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

    const frontier = input.microturn.legalActions.map<FrontierCandidate>((decision) => {
      const nextState = applyDecision(input.def, input.state, decision, undefined, input.runtime).state;
      return {
        decision,
        stableMoveKey: frontierDecisionKey(input.def, decision),
        score: evaluateState(input.def, nextState, input.state.activePlayer, input.runtime),
      };
    });
    const bestScore = Math.max(...frontier.map((candidate) => candidate.score));
    const bestCandidates = frontier.filter((candidate) => candidate.score === bestScore);
    const { item: selected, rng } = pickRandom(bestCandidates, input.rng);
    const metadata: PolicyEvaluationMetadata = {
      seatId: resolvedProfile?.seatId ?? null,
      requestedProfileId: this.profileId ?? null,
      profileId: resolvedProfile?.profileId ?? null,
      profileFingerprint: resolvedProfile?.profile.fingerprint ?? null,
      canonicalOrder: frontier.map((candidate) => candidate.stableMoveKey),
      candidates: frontier.map((candidate) => ({
        actionId: candidate.decision.kind === 'actionSelection' ? String(candidate.decision.actionId) : candidate.decision.kind,
        stableMoveKey: candidate.stableMoveKey,
        score: candidate.score,
        prunedBy: [],
        scoreContributions: [],
        previewRefIds: [],
        unknownPreviewRefs: [],
      })),
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

  private matchPlannedDecision(
    input: AgentMicroturnDecisionInput,
  ): Decision | null {
    const plannedMove = this.plannedMovesByTurnId.get(Number(input.microturn.turnId));
    if (plannedMove === undefined) {
      return null;
    }
    if (input.microturn.kind === 'chooseOne') {
      const context = input.microturn.decisionContext as ChooseOneContext;
      const desiredValue = plannedMove.move.params[context.decisionKey];
      if (desiredValue === undefined || Array.isArray(desiredValue)) {
        return null;
      }
      return input.microturn.legalActions.find(
        (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
          decision.kind === 'chooseOne'
          && decision.decisionKey === context.decisionKey
          && JSON.stringify(decision.value) === JSON.stringify(desiredValue),
      ) ?? null;
    }
    if (input.microturn.kind === 'chooseNStep') {
      const context = input.microturn.decisionContext as ChooseNStepContext;
      const desiredRaw = plannedMove.move.params[context.decisionKey];
      const desiredValues = Array.isArray(desiredRaw)
        ? desiredRaw
        : desiredRaw === undefined ? [] : [desiredRaw];
      const currentValues = context.selectedSoFar;
      const nextAdd = desiredValues.find((value) =>
        !currentValues.some((selected: string | number | boolean) => selected === value),
      );
      if (nextAdd !== undefined) {
        return input.microturn.legalActions.find(
          (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
            decision.kind === 'chooseNStep'
            && decision.decisionKey === context.decisionKey
            && decision.command === 'add'
            && decision.value === nextAdd,
        ) ?? null;
      }
      const reachedDesiredSet = desiredValues.length === currentValues.length
        && desiredValues.every((value) => currentValues.some((selected: string | number | boolean) => selected === value));
      if (reachedDesiredSet) {
        return input.microturn.legalActions.find(
          (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
            decision.kind === 'chooseNStep'
            && decision.decisionKey === context.decisionKey
            && decision.command === 'confirm',
        ) ?? null;
      }
    }
    return null;
  }

  private prunePlannedMoves(currentTurnId: number): void {
    for (const turnId of this.plannedMovesByTurnId.keys()) {
      if (turnId < currentTurnId) {
        this.plannedMovesByTurnId.delete(turnId);
      }
    }
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
      }, choose);
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
    const preferredValue = choose(request);
    if (preferredValue === undefined || Array.isArray(preferredValue)) {
      return null;
    }
    const matchedDecision = input.microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
        decision.kind === 'chooseOne'
        && decision.decisionKey === context.decisionKey
        && JSON.stringify(decision.value) === JSON.stringify(preferredValue),
    );
    return matchedDecision === undefined ? null : { matchedDecision, score: 1 };
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

  private chooseLegacyMove(
    input: AgentLegacyDecisionInput,
  ): AgentLegacyDecisionResult {
    const profiler = input.profiler;
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.playerId, this.profileId);
    const previewDependencies = createMemoizedPreviewDependencies();
    const choose = resolvedProfile === null
      ? undefined
      : buildCompletionChooseCallback({
        state: input.state,
        def: input.def,
        catalog: resolvedProfile.catalog,
        playerId: input.playerId,
        seatId: resolvedProfile.seatId,
        profile: resolvedProfile.profile,
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      });
    const phase1Preparation = buildPhase1ActionPreviewIndex(
      input,
      resolvedProfile,
      choose,
      profiler,
      this.disableGuidedChooser,
    );
    const phase1EvaluationInput = {
      ...input,
      legalMoves: input.legalMoves.map((classified) => classified.move),
      trustedMoveIndex: new Map(),
      ...(phase1Preparation.index.size === 0 ? {} : { phase1ActionPreviewIndex: phase1Preparation.index }),
      rng: phase1Preparation.rng,
      selectionGrouping: 'actionId' as const,
      previewDependencies,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    };

    const t0_eval = perfStart(profiler);
    const phase1 = evaluatePolicyMove(phase1EvaluationInput);
    perfDynEnd(profiler, 'agent:evaluatePolicyMove', t0_eval);

    const t0_prepare = perfStart(profiler);
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: this.completionsPerTemplate,
      actionIdFilter: phase1.move.actionId,
      disableGuidedChooser: this.disableGuidedChooser,
      ...(choose === undefined ? {} : { choose }),
    });
    perfDynEnd(profiler, 'agent:preparePlayableMoves', t0_prepare);

    let phase2Prepared = prepared;
    let phase2Failure: PolicyEvaluationFailure | null = null;
    let playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
    if (playableMoves.length === 0) {
      const t0_broaderPrepare = perfStart(profiler);
      const broaderPrepared = preparePlayableMoves({
        ...input,
        rng: prepared.rng,
      }, {
        pendingTemplateCompletions: this.completionsPerTemplate,
        disableGuidedChooser: this.disableGuidedChooser,
        ...(choose === undefined ? {} : { choose }),
      });
      perfDynEnd(profiler, 'agent:preparePlayableMovesFallback', t0_broaderPrepare);
      const broaderPlayableMoves = (
        broaderPrepared.completedMoves.length > 0 ? broaderPrepared.completedMoves : broaderPrepared.stochasticMoves
      );
      if (broaderPlayableMoves.length > 0) {
        phase2Prepared = broaderPrepared;
        playableMoves = broaderPlayableMoves;
        phase2Failure = emptyActionFilterFailure(String(phase1.move.actionId));
      }
    }
    if (playableMoves.length === 0) {
      throw createNoPlayableMoveInvariantError('PolicyAgent', input.legalMoves.length);
    }
    const trustedMoveIndex = new Map(
      playableMoves.map((trustedMove) => [toMoveIdentityKey(input.def, trustedMove.move), trustedMove] as const),
    );

    const t0_phase2 = perfStart(profiler);
    const phase2 = evaluatePolicyMove({
      ...input,
      legalMoves: playableMoves.map((move) => move.move),
      trustedMoveIndex,
      rng: phase2Prepared.rng,
      completionStatistics: phase2Prepared.statistics,
      movePreparations: phase2Prepared.movePreparations,
      previewDependencies,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    });
    perfDynEnd(profiler, 'agent:evaluatePolicyMovePhase2', t0_phase2);

    const resultMoveKey = toMoveIdentityKey(input.def, phase2.move);
    const trustedMove = trustedMoveIndex.get(resultMoveKey);
    if (trustedMove === undefined) {
      throw new Error('PolicyAgent selected a move that was not present in the trusted candidate set.');
    }

    const phase1ActionRanking = rankActionIdsByBestCandidateScore(phase1.metadata.candidates);

    return {
      move: trustedMove,
      rng: phase2.rng,
      agentDecision: buildPolicyAgentDecisionTrace({
        ...phase2.metadata,
        ...(phase2Failure === null ? {} : { failure: phase2Failure, usedFallback: true }),
        canonicalOrder: phase1.metadata.canonicalOrder,
        candidates: phase1.metadata.candidates,
        pruningSteps: phase1.metadata.pruningSteps,
        tieBreakChain: phase1.metadata.tieBreakChain,
        previewUsage: phase1.metadata.previewUsage,
        ...(phase1.metadata.selection === undefined ? {} : { selection: phase1.metadata.selection }),
        ...(phase1.metadata.stateFeatures === undefined ? {} : { stateFeatures: phase1.metadata.stateFeatures }),
        phase1Score: phase1.metadata.finalScore,
        phase2Score: phase2.metadata.finalScore,
        phase1ActionRanking,
      }, this.traceLevel),
    };
  }
}

const matchesPublishedActionDecision = (
  _def: AgentMicroturnDecisionInput['def'],
  decision: Extract<Decision, { readonly kind: 'actionSelection' }>,
  move: AgentLegacyDecisionResult['move']['move'],
): boolean => {
  if (decision.actionId !== move.actionId) {
    return false;
  }
  if (decision.move === undefined) {
    return true;
  }
  return Object.entries(decision.move.params).every(([key, value]) =>
    JSON.stringify(move.params[key]) === JSON.stringify(value),
  );
};

function createMemoizedPreviewDependencies(): PolicyPreviewDependencies {
  const applyMoveCache = new Map<string, ReturnType<typeof applyPreviewMove>>();
  return {
    applyMove(def, state, move, options, runtime) {
      const cacheKey = `${state.stateHash}:${toMoveIdentityKey(def, move.move)}`;
      const cached = applyMoveCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      const applied = applyPreviewMove(def, state, move, options, runtime);
      applyMoveCache.set(cacheKey, applied);
      return applied;
    },
  };
}

function buildPhase1ActionPreviewIndex(
  input: AgentLegacyDecisionInput,
  resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  choose: ReturnType<typeof buildCompletionChooseCallback> | undefined,
  profiler: Parameters<typeof perfStart>[0],
  disableGuidedChooser: boolean,
): {
    readonly index: ReadonlyMap<string, Phase1ActionPreviewEntry>;
    readonly rng: typeof input.rng;
  } {
  if (resolvedProfile?.profile.preview.phase1 !== true) {
    return { index: new Map(), rng: input.rng };
  }

  const completionBudget = resolvedProfile.profile.preview.phase1CompletionsPerAction ?? 1;
  const actionIds = [...new Set(input.legalMoves.map((classified) => String(classified.move.actionId)))].sort();
  const index = new Map<string, Phase1ActionPreviewEntry>();
  let rng = input.rng;

  const t0_prepare = perfStart(profiler);
  for (const actionId of actionIds) {
    const actionIdFilter = input.legalMoves.find(
      (classified) => String(classified.move.actionId) === actionId,
    )?.move.actionId;
    if (actionIdFilter === undefined) {
      continue;
    }
    const prepared = preparePlayableMoves(
      {
        ...input,
        rng,
      },
      {
        pendingTemplateCompletions: completionBudget,
        actionIdFilter,
        disableGuidedChooser,
        ...(choose === undefined ? {} : { choose }),
      },
    );
    rng = prepared.rng;
    const representative = selectPhase1RepresentativeMove(
      input,
      resolvedProfile.seatId,
      completionBudget,
      prepared.completedMoves,
    );
    if (representative !== undefined) {
      index.set(actionId, {
        actionId,
        trustedMove: representative,
      });
    }
  }
  perfDynEnd(profiler, 'agent:phase1Completions', t0_prepare);

  return { index, rng };
}

function selectPhase1RepresentativeMove(
  input: AgentLegacyDecisionInput,
  seatId: string,
  completionBudget: number,
  completedMoves: readonly ReturnType<typeof preparePlayableMoves>['completedMoves'][number][],
): ReturnType<typeof preparePlayableMoves>['completedMoves'][number] | undefined {
  const firstCompletedMove = completedMoves[0];
  if (firstCompletedMove === undefined) {
    return undefined;
  }
  if (completionBudget <= 1 || completedMoves.length <= 1) {
    return firstCompletedMove;
  }

  let bestMove = firstCompletedMove;
  let bestMargin = getProjectedSelfMargin(input, seatId, firstCompletedMove);

  for (let index = 1; index < completedMoves.length; index += 1) {
    const candidate = completedMoves[index];
    if (candidate === undefined) {
      continue;
    }
    const candidateMargin = getProjectedSelfMargin(input, seatId, candidate);
    if (candidateMargin > bestMargin) {
      bestMove = candidate;
      bestMargin = candidateMargin;
    }
  }

  return bestMove;
}

function getProjectedSelfMargin(
  input: AgentLegacyDecisionInput,
  seatId: string,
  move: ReturnType<typeof preparePlayableMoves>['completedMoves'][number],
): number {
  const projectedState = applyTrustedMove(
    input.def,
    input.state,
    move,
    undefined,
    input.runtime,
  ).state;
  return getSeatMargin(input.def, projectedState, seatId, input.runtime) ?? Number.NEGATIVE_INFINITY;
}

function rankActionIdsByBestCandidateScore(
  candidates: PolicyEvaluationMetadata['candidates'],
): readonly string[] {
  const bestByActionId = new Map<string, { readonly score: number; readonly stableMoveKey: string }>();
  for (const candidate of candidates) {
    const existing = bestByActionId.get(candidate.actionId);
    if (
      existing === undefined
      || candidate.score > existing.score
      || (candidate.score === existing.score && candidate.stableMoveKey < existing.stableMoveKey)
    ) {
      bestByActionId.set(candidate.actionId, {
        score: candidate.score,
        stableMoveKey: candidate.stableMoveKey,
      });
    }
  }

  return [...bestByActionId.entries()]
    .sort((left, right) => {
      if (right[1].score !== left[1].score) {
        return right[1].score - left[1].score;
      }
      return left[1].stableMoveKey.localeCompare(right[1].stableMoveKey);
    })
    .map(([actionId]) => actionId);
}
