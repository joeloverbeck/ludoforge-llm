import { evalCondition } from './eval-condition.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { resolveDeclaredActionParamDomainOptions } from './declared-action-param-domain.js';
import type { ReadContext, EvalRuntimeResources } from './eval-context.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import { resolveCapturedSequenceZonesByKey } from './free-operation-captured-sequence-zones.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import {
  classifyMoveDecisionSequenceAdmissionForLegalMove,
  isMoveDecisionSequenceAdmittedForLegalMove,
  type DiscoveryCache,
  type MoveDecisionSequenceSatisfiabilityOptions,
} from './move-decision-sequence.js';
import { createMoveDecisionSequenceChoiceDiscoverer } from './move-decision-discoverer.js';
import {
  applyTurnFlowWindowFilters,
  isMoveAllowedByTurnFlowOptionMatrix,
  resolveConstrainedSecondEligibleActionClasses,
} from './legal-moves-turn-order.js';
import {
  grantActionIds,
  isPendingFreeOperationGrantSequenceReady,
} from './free-operation-grant-authorization.js';
import { resolveTurnFlowDefaultFreeOperationActionDomain } from './free-operation-action-domain.js';
import {
  resolveGrantMoveActionClassOverride,
  resolvePendingFreeOperationGrantExecutionPlayer,
} from './free-operation-grant-bindings.js';
import {
  isFreeOperationApplicableForMove,
  isFreeOperationGrantedForMove,
} from './free-operation-discovery-analysis.js';
import {
  canResolveAmbiguousFreeOperationOverlapInCurrentState,
  hasLegalCompletedFreeOperationMoveInCurrentState,
} from './free-operation-viability.js';
import { resolveStrongestRequiredFreeOperationOutcomeGrant } from './free-operation-outcome-policy.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import type { TurnFlowActionClass } from './types-turn-flow.js';
import { shouldEnumerateLegalMoveForOutcome } from './legality-outcome.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import {
  decideDiscoveryLegalChoicesPipelineViability,
  decideDiscoveryLegalMovesPipelineViability,
  evaluateDiscoveryPipelinePredicateStatus,
} from './pipeline-viability-policy.js';
import { MISSING_BINDING_POLICY_CONTEXTS, shouldDeferMissingBinding } from './missing-binding-policy.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { toMoveIdentityKey } from './move-identity.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { isActiveSeatEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import { isCardEventAction } from './action-capabilities.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import { computeAlwaysCompleteActionIds } from './always-complete-actions.js';
import { probeMoveViability } from './apply-move.js';
import { kernelRuntimeError } from './runtime-error.js';
import { createSeatResolutionContext } from './identity.js';
import { createTrustedExecutableMove } from './trusted-move.js';
import { requireCardDrivenActiveSeat, validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { findPhaseDef } from './phase-lookup.js';
import type {
  ActionDef,
  ActionPipelineDef,
  ClassifiedMove,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  PhaseDef,
  RuntimeWarning,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

export interface LegalMoveEnumerationOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  /**
   * When true, plain (non-pipeline) actions are probed for decision-sequence
   * feasibility before inclusion. Actions whose first choice has an empty
   * domain are excluded. Defaults to false for backward compatibility with
   * internal callers like phase-advance that rely on template presence.
   */
  readonly probePlainActionFeasibility?: boolean;
  /**
   * When true, enumeration stops after finding the first legal move.
   * Used by advanceToDecisionPoint which only needs to know whether
   * any legal move exists, not what they all are.
   */
  readonly earlyExitAfterFirst?: boolean;
}

export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];
  readonly warnings: readonly RuntimeWarning[];
}

interface RawLegalMoveEnumerationResult {
  readonly moves: readonly Move[];
  readonly warnings: readonly RuntimeWarning[];
  readonly discoveryCache: DiscoveryCache;
}

type EnumerationDecisionDiscoverer = MoveDecisionSequenceSatisfiabilityOptions['discoverer'];

interface MoveEnumerationState {
  readonly budgets: MoveEnumerationBudgets;
  readonly probePlainActionFeasibility: boolean;
  readonly warnings: RuntimeWarning[];
  readonly moves: Move[];
  paramExpansions: number;
  templateBudgetExceeded: boolean;
  paramExpansionBudgetExceeded: boolean;
}

const emitEnumerationWarning = (state: MoveEnumerationState, warning: RuntimeWarning): void => {
  state.warnings.push(warning);
};

const tryPushTemplateMove = (state: MoveEnumerationState, move: Move, actionId: ActionDef['id']): boolean => {
  if (state.moves.length >= state.budgets.maxTemplates) {
    if (!state.templateBudgetExceeded) {
      state.templateBudgetExceeded = true;
      emitEnumerationWarning(state, {
        code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED',
        message: 'Legal move template budget reached; remaining templates were truncated deterministically.',
        context: {
          actionId: String(actionId),
          maxTemplates: state.budgets.maxTemplates,
        },
      });
    }
    return false;
  }
  state.moves.push(move);
  return true;
};

const isBaseClassCompatibleWithConstrained = (
  baseClass: TurnFlowActionClass,
  constrainedClass: TurnFlowActionClass,
): boolean => {
  if (baseClass === 'operation') {
    return constrainedClass === 'operation' || constrainedClass === 'limitedOperation' || constrainedClass === 'operationPlusSpecialActivity';
  }
  if (baseClass === 'specialActivity') {
    return constrainedClass === 'operationPlusSpecialActivity';
  }
  return baseClass === constrainedClass;
};

const tryPushOptionMatrixFilteredMove = (
  enumeration: MoveEnumerationState,
  def: GameDef,
  state: GameState,
  move: Move,
  action: ActionDef,
): boolean => {
  const baseClass = resolveTurnFlowActionClass(def, move);
  if (move.freeOperation === true && isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
    return tryPushTemplateMove(
      enumeration,
      baseClass !== null && move.actionClass === undefined
        ? {
            ...move,
            actionClass: baseClass,
          }
        : move,
      action.id,
    );
  }

  const constrainedClasses = resolveConstrainedSecondEligibleActionClasses(def, state);
  const variants: Move[] = [];
  if (constrainedClasses !== null && String(action.id) !== 'pass' && !isCardEventAction(action)) {
    if (baseClass === null) {
      for (const actionClass of constrainedClasses) {
        if (actionClass === 'event' || actionClass === 'pass') {
          continue;
        }
        variants.push({
          ...move,
          actionClass,
        });
      }
    } else {
      for (const actionClass of constrainedClasses) {
        if (isBaseClassCompatibleWithConstrained(baseClass, actionClass)) {
          variants.push({
            ...move,
            actionClass,
          });
        }
      }
    }
  } else {
    variants.push(
      baseClass !== null && move.actionClass === undefined
        ? {
            ...move,
            actionClass: baseClass,
          }
        : move,
    );
  }

  for (const variant of variants) {
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, variant)) {
      continue;
    }
    if (!tryPushTemplateMove(enumeration, variant, action.id)) {
      return false;
    }
  }
  return true;
};

const consumeParamExpansionBudget = (state: MoveEnumerationState, actionId: ActionDef['id']): boolean => {
  state.paramExpansions += 1;
  if (state.paramExpansions <= state.budgets.maxParamExpansions) {
    return true;
  }
  if (!state.paramExpansionBudgetExceeded) {
    state.paramExpansionBudgetExceeded = true;
    emitEnumerationWarning(state, {
      code: 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED',
      message: 'Legal move parameter expansion budget reached; remaining expansions were truncated deterministically.',
      context: {
        actionId: String(actionId),
        maxParamExpansions: state.budgets.maxParamExpansions,
      },
    });
  }
  return false;
};

const isDeferredFreeOperationTemplateProbeFailure = (
  move: Move,
  viability: ReturnType<typeof probeMoveViability>,
): boolean => {
  if (move.freeOperation !== true || viability.viable || viability.code !== 'ILLEGAL_MOVE') {
    return false;
  }
  const ctx = viability.context;
  return (
    ctx.reason === 'freeOperationNotGranted'
    && 'freeOperationDenial' in ctx
    && (ctx as { readonly freeOperationDenial: { readonly cause: string } }).freeOperationDenial.cause === 'zoneFilterMismatch'
  );
};

const classifyEnumeratedMoves = (
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  warnings: RuntimeWarning[],
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): readonly ClassifiedMove[] => {
  const alwaysCompleteActionIds = runtime?.alwaysCompleteActionIds ?? computeAlwaysCompleteActionIds(def);
  const classified: ClassifiedMove[] = [];

  for (const move of moves) {
    if (alwaysCompleteActionIds.has(move.actionId)) {
      classified.push({
        move,
        viability: {
          viable: true,
          complete: true,
          move,
          warnings: [],
        },
        trustedMove: createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
      });
      continue;
    }

    const viability = probeMoveViability(def, state, move, runtime, discoveryCache);
    if (viability.viable) {
      classified.push({
        move,
        viability,
        ...(viability.complete || viability.stochasticDecision !== undefined
          ? {
            trustedMove: createTrustedExecutableMove(
              viability.move,
              state.stateHash,
              'enumerateLegalMoves',
            ),
          }
          : {}),
      });
      continue;
    }

    if (isDeferredFreeOperationTemplateProbeFailure(move, viability)) {
      classified.push({
        move,
        viability: {
          viable: true,
          complete: false,
          move,
          warnings: [],
        },
      });
      continue;
    }

    warnings.push({
      code: 'MOVE_ENUM_PROBE_REJECTED',
      message: 'Enumerated legal move was rejected by move viability probing and removed.',
      context: {
        actionId: String(move.actionId),
        reason: viability.code,
      },
    });
  }

  return classified;
};

function makeEvalContext(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  evalRuntimeResources: EvalRuntimeResources,
  state: GameState,
  executionPlayer: GameState['activePlayer'],
  bindings: Readonly<Record<string, unknown>>,
  options?: {
    readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
  },
): ReadContext {
  return createEvalContext({
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    runtimeTableIndex,
    resources: evalRuntimeResources,
    ...(options?.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: options.freeOperationOverlay }),
  });
}

function enumerateParams(
  action: ActionDef,
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  evalRuntimeResources: EvalRuntimeResources,
  state: GameState,
  paramIndex: number,
  bindings: Readonly<Record<string, unknown>>,
  enumeration: MoveEnumerationState,
  currentPhaseDef: PhaseDef | undefined,
  options?: {
    readonly pipeline?: ActionPipelineDef;
    readonly executionPlayerOverride?: GameState['activePlayer'];
    readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
    readonly moveOverrides?: Partial<Move>;
    readonly moveFilter?: (move: Move) => boolean;
    readonly discoverer?: EnumerationDecisionDiscoverer;
    readonly runtime?: GameDefRuntime;
  },
): void {
  if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
    return;
  }

  const resolveExecutionPlayerForBindings = (allowPendingBinding: boolean): GameState['activePlayer'] | null => {
    if (options?.executionPlayerOverride !== undefined) {
      return options.executionPlayerOverride;
    }
    const resolution = resolveActionExecutor({
      def,
      state,
      adjacencyGraph,
      action,
      decisionPlayer: state.activePlayer,
      bindings,
      runtimeTableIndex,
      evalRuntimeResources,
    });
    if (resolution.kind === 'notApplicable') {
      return null;
    }
    if (resolution.kind === 'invalidSpec') {
      if (
        allowPendingBinding &&
        shouldDeferMissingBinding(
          resolution.error,
          MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EXECUTOR_DURING_PARAM_ENUMERATION,
        )
      ) {
        return state.activePlayer;
      }
      throw selectorInvalidSpecError('legalMoves', 'executor', action, resolution.error);
    }
    return resolution.executionPlayer;
  };

  if (paramIndex >= action.params.length) {
    const executionPlayer = resolveExecutionPlayerForBindings(false);
    if (executionPlayer === null) {
      return;
    }
    const ctx = makeEvalContext(def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, executionPlayer, bindings, {
      ...(options?.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: options.freeOperationOverlay }),
    });
    if (currentPhaseDef?.actionDefaults?.pre !== undefined) {
      if (!evalCondition(currentPhaseDef.actionDefaults.pre, ctx)) {
        return;
      }
    }
    if (action.pre !== null && !evalCondition(action.pre, ctx)) {
      return;
    }

    if (options?.pipeline !== undefined) {
      const status = evaluateDiscoveryPipelinePredicateStatus(action, options.pipeline, ctx, {
        includeCostValidation: options.pipeline.atomicity === 'atomic',
      });
      const viabilityDecision = decideDiscoveryLegalChoicesPipelineViability(status);
      if (viabilityDecision.kind === 'illegalChoice') {
        return;
      }
    }

    const params = Object.fromEntries(
      action.params.map((param) => [param.name, bindings[param.name] as MoveParamValue]),
    );
    const move: Move = {
      actionId: action.id,
      params,
      ...(options?.moveOverrides ?? {}),
    };

    if (enumeration.probePlainActionFeasibility && options?.pipeline === undefined) {
      try {
        if (
          !isMoveDecisionSequenceAdmittedForLegalMove(
            def,
            state,
            move,
            MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE,
            {
              budgets: enumeration.budgets,
              onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
              ...(options?.discoverer === undefined ? {} : { discoverer: options.discoverer }),
            },
            options?.runtime,
          )
        ) {
          return;
        }
      } catch {
        // Plain actions may have effects that reference runtime state not
        // available during discovery (missing vars, unresolvable selectors).
        // Any probe error is treated as "unknown" — keep the move.
      }
    }

    if (options?.moveFilter !== undefined && !options.moveFilter(move)) {
      return;
    }

    tryPushOptionMatrixFilteredMove(enumeration, def, state, move, action);
    return;
  }

  const param = action.params[paramIndex];
  if (param === undefined) {
    return;
  }

  const executionPlayer = resolveExecutionPlayerForBindings(true);
  if (executionPlayer === null) {
    return;
  }
  const ctx = makeEvalContext(def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, executionPlayer, bindings, {
    ...(options?.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: options.freeOperationOverlay }),
  });
  const resolution = resolveDeclaredActionParamDomainOptions(param, ctx);
  if (resolution.invalidOption !== undefined) {
    throw kernelRuntimeError(
      'LEGAL_MOVES_VALIDATION_FAILED',
      `legalMoves: action param "${param.name}" domain option is not move-param encodable`,
      {
        actionId: action.id,
        param: param.name,
        value: resolution.invalidOption,
      },
    );
  }
  for (const value of resolution.options) {
    if (!consumeParamExpansionBudget(enumeration, action.id)) {
      return;
    }
    enumerateParams(
      action,
      def,
      adjacencyGraph,
      runtimeTableIndex,
      evalRuntimeResources,
      state,
      paramIndex + 1,
      { ...bindings, [param.name]: value },
      enumeration,
      currentPhaseDef,
      options,
    );
    if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
      return;
    }
  }
}

function enumeratePendingFreeOperationMoves(
  def: GameDef,
  state: GameState,
  enumeration: MoveEnumerationState,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  evalRuntimeResources: EvalRuntimeResources,
  currentPhaseDef: PhaseDef | undefined,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): void {
  if (state.turnOrderState.type !== 'cardDriven') {
    return;
  }

  const runtime = state.turnOrderState.runtime;
  const pending = runtime.pendingFreeOperationGrants ?? [];
  if (pending.length === 0) {
    return;
  }

  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.PENDING_FREE_OPERATION_VARIANT_APPLICATION,
    seatResolution,
  );
  const readyGrants = pending.filter(
    (grant) =>
      grant.seat === activeSeat &&
      isPendingFreeOperationGrantSequenceReady(pending, grant, runtime.freeOperationSequenceContexts),
  );
  if (readyGrants.length === 0) {
    return;
  }

  const seenGrantMoveKeys = new Set<string>();
  const defaultActionDomain = resolveTurnFlowDefaultFreeOperationActionDomain(def);
  const isCurrentReadyGrant = (grantId: string): boolean => readyGrants.some((grant) => grant.grantId === grantId);
  const createReadyGrantScopedState = (grantIds: readonly string[]): GameState => ({
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        pendingFreeOperationGrants: pending.filter(
          (pendingGrant) => grantIds.includes(pendingGrant.grantId) || !isCurrentReadyGrant(pendingGrant.grantId),
        ),
      },
    },
  });
  const isFreeOperationCandidateAdmitted = (candidateState: GameState, candidateMove: Move): boolean => {
    if (!isFreeOperationApplicableForMove(def, candidateState, candidateMove, seatResolution)) {
      return false;
    }
    if (!isFreeOperationGrantedForMove(def, candidateState, candidateMove, seatResolution)) {
      if (!canResolveAmbiguousFreeOperationOverlapInCurrentState(def, candidateState, candidateMove, seatResolution)) {
        return false;
      }
    }
    const decisionSequenceClassification = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      candidateState,
      candidateMove,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
      {
        budgets: enumeration.budgets,
        onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
      },
    );
    if (decisionSequenceClassification === 'unsatisfiable') {
      return false;
    }
    if (decisionSequenceClassification !== 'satisfiable') {
      return true;
    }
    if (
      candidateState.turnOrderState.type !== 'cardDriven'
      || !(candidateState.turnOrderState.runtime.pendingFreeOperationGrants ?? []).some((grant) => grant.outcomePolicy === 'mustChangeGameplayState')
    ) {
      return true;
    }
    let strongestOutcomeGrant: TurnFlowPendingFreeOperationGrant | null;
    try {
      strongestOutcomeGrant = resolveStrongestRequiredFreeOperationOutcomeGrant(def, candidateState, candidateMove, seatResolution);
      if (strongestOutcomeGrant === null) {
        return true;
      }
    } catch (error) {
      if (isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')) {
        return true;
      }
      throw error;
    }
    // Required grants must always be surfaced so the obligation is visible;
    // apply-move.ts `validateFreeOperationOutcomePolicy` enforces outcome policy.
    if (strongestOutcomeGrant.completionPolicy === 'required') {
      return true;
    }
    return hasLegalCompletedFreeOperationMoveInCurrentState(
      def,
      candidateState,
      candidateMove,
      seatResolution,
      {
        budgets: enumeration.budgets,
        onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
      },
    );
  };
  const collectViableNonExecutionContextReadyGrantIds = (candidateMove: Move): readonly string[] =>
    readyGrants
      .filter((candidateGrant) => {
        const candidateExecutionPlayer = resolvePendingFreeOperationGrantExecutionPlayer(def, state, candidateGrant);
        if (candidateExecutionPlayer === undefined || candidateGrant.executionContext !== undefined) {
          return false;
        }
        const resolvedCandidateMoveClass = resolveTurnFlowActionClass(def, {
          actionId: candidateMove.actionId,
          params: candidateMove.params,
        });
        const candidateTargetActionClass =
          resolvedCandidateMoveClass === candidateGrant.operationClass
            ? resolvedCandidateMoveClass
            : candidateGrant.operationClass;
        const candidateIdentityMove: Move = {
          ...candidateMove,
          ...(resolvedCandidateMoveClass !== candidateTargetActionClass
            ? { actionClass: candidateTargetActionClass }
            : {}),
        };
        if (toMoveIdentityKey(def, candidateIdentityMove) !== toMoveIdentityKey(def, candidateMove)) {
          return false;
        }
        return isFreeOperationCandidateAdmitted(
          createReadyGrantScopedState([candidateGrant.grantId]),
          candidateMove,
        );
      })
      .map((candidateGrant) => candidateGrant.grantId);

  for (const grant of readyGrants) {
    const executionPlayer = resolvePendingFreeOperationGrantExecutionPlayer(def, state, grant);
    if (executionPlayer === undefined) {
      continue;
    }

    for (const actionId of grantActionIds(def, grant).length > 0 ? grantActionIds(def, grant) : defaultActionDomain) {
      const action = def.actions.find((candidate) => String(candidate.id) === actionId);
      if (action === undefined) {
        continue;
      }

      const hasActionPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);
      const mappedActionClass = resolveTurnFlowActionClass(def, { actionId: action.id, params: {} });
      const grantActionClassOverride = resolveGrantMoveActionClassOverride(def, action.id, grant.operationClass);
      const targetActionClass = grantActionClassOverride ?? mappedActionClass ?? 'operation';
      const needsGrantActionClassOverride = grantActionClassOverride !== undefined;
      const grantRootedProbeMove: Move = {
        actionId: action.id,
        params: {},
        freeOperation: true,
        ...(needsGrantActionClassOverride ? { actionClass: targetActionClass } : {}),
      };
      const hasEnumeratedBaseTemplate = enumeration.moves.some(
        (move) =>
          move.freeOperation !== true
          && String(move.actionId) === actionId
          && (resolveTurnFlowActionClass(def, move) ?? 'operation') === targetActionClass,
      );

      const freeOperationPreflightOverlay = buildFreeOperationPreflightOverlay(
        {
          executionPlayer,
          ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
          ...(grant.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
          ...(resolveCapturedSequenceZonesByKey(state, grant) === undefined
            ? {}
            : { capturedSequenceZonesByKey: resolveCapturedSequenceZonesByKey(state, grant) }),
          ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
        },
        { actionId: action.id, params: {} },
        'turnFlowEligibility',
        { skipPhaseCheck: false },
      );
      const preflight = resolveActionApplicabilityPreflight({
        def,
        state,
        action,
        adjacencyGraph,
        decisionPlayer: state.activePlayer,
        bindings: buildMoveRuntimeBindings(grantRootedProbeMove),
        runtimeTableIndex,
        evalRuntimeResources,
        skipExecutorCheck: !hasActionPipeline,
        skipPipelineDispatch: !hasActionPipeline,
        ...freeOperationPreflightOverlay,
      });
      if (preflight.kind === 'invalidSpec') {
        throw selectorInvalidSpecError(
          'legalMoves',
          preflight.selector,
          action,
          preflight.error,
          preflight.selectorContractViolations,
        );
      }

      if (grant.executionContext !== undefined) {
        if (
          preflight.kind === 'notApplicable'
          && preflight.reason !== 'pipelineNotApplicable'
          && preflight.reason !== 'phaseMismatch'
          && !hasEnumeratedBaseTemplate
        ) {
          continue;
        }
        enumerateParams(
          action,
          def,
          adjacencyGraph,
          runtimeTableIndex,
          evalRuntimeResources,
          state,
          0,
          {},
          enumeration,
          currentPhaseDef,
          {
            ...(
              preflight.kind === 'applicable' && preflight.pipelineDispatch.kind === 'matched'
                ? { pipeline: preflight.pipelineDispatch.profile }
                : {}
            ),
            ...freeOperationPreflightOverlay,
            moveOverrides: {
              freeOperation: true,
              ...(needsGrantActionClassOverride ? { actionClass: targetActionClass } : {}),
            },
          },
        );
        if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
          return;
        }
        continue;
      }

      if (!hasActionPipeline) {
        if (preflight.kind === 'notApplicable') {
          continue;
        }
        enumerateParams(
          action,
          def,
          adjacencyGraph,
          runtimeTableIndex,
          evalRuntimeResources,
          state,
          0,
          {},
          enumeration,
          currentPhaseDef,
          {
            moveOverrides: {
              freeOperation: true,
              ...(needsGrantActionClassOverride ? { actionClass: targetActionClass } : {}),
            },
            moveFilter: (candidateMove) => {
              const grantMoveKey = toMoveIdentityKey(def, candidateMove);
              if (seenGrantMoveKeys.has(grantMoveKey)) {
                return false;
              }
              const viableReadyGrantIds = collectViableNonExecutionContextReadyGrantIds(candidateMove);
              if (viableReadyGrantIds.length === 0) {
                return false;
              }
              if (!isFreeOperationCandidateAdmitted(createReadyGrantScopedState(viableReadyGrantIds), candidateMove)) {
                return false;
              }
              seenGrantMoveKeys.add(grantMoveKey);
              return true;
            },
          },
        );
        if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
          return;
        }
        continue;
      }

      const pipeline =
        preflight.kind === 'applicable' && preflight.pipelineDispatch.kind === 'matched'
          ? preflight.pipelineDispatch.profile
          : undefined;
      if (
        pipeline === undefined
        && !hasEnumeratedBaseTemplate
        && !(
          preflight.kind === 'notApplicable'
          && (preflight.reason === 'pipelineNotApplicable' || preflight.reason === 'phaseMismatch')
        )
      ) {
        continue;
      }
      if (pipeline !== undefined) {
        if (preflight.kind !== 'applicable' || preflight.pipelineDispatch.kind !== 'matched') {
          continue;
        }
        const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
          includeCostValidation: pipeline.atomicity === 'atomic',
        });
        const viabilityDecision = decideDiscoveryLegalMovesPipelineViability(status);
        if (viabilityDecision.kind === 'excludeTemplate') {
          if (
            viabilityDecision.outcome !== 'pipelineLegalityFailed'
            || !shouldEnumerateLegalMoveForOutcome(viabilityDecision.outcome)
          ) {
            continue;
          }
        }
      }
      const baseMove: Move = {
        actionId: action.id,
        params: {},
        freeOperation: true,
        ...(needsGrantActionClassOverride ? { actionClass: targetActionClass } : {}),
      };

      const viableReadyGrantIds = readyGrants
        .filter((candidateGrant) => {
          const candidateExecutionPlayer = resolvePendingFreeOperationGrantExecutionPlayer(def, state, candidateGrant);
          if (candidateExecutionPlayer === undefined || candidateGrant.executionContext !== undefined) {
            return false;
          }

          const candidatePreflightOverlay = buildFreeOperationPreflightOverlay(
            {
              executionPlayer: candidateExecutionPlayer,
              ...(candidateGrant.zoneFilter === undefined ? {} : { zoneFilter: candidateGrant.zoneFilter }),
              ...(resolveCapturedSequenceZonesByKey(state, candidateGrant) === undefined
                ? {}
                : { capturedSequenceZonesByKey: resolveCapturedSequenceZonesByKey(state, candidateGrant) }),
              ...(candidateGrant.tokenInterpretations === undefined ? {} : { tokenInterpretations: candidateGrant.tokenInterpretations }),
            },
            { actionId: action.id, params: {} },
            'turnFlowEligibility',
            { skipPhaseCheck: false },
          );
          const candidatePreflight = resolveActionApplicabilityPreflight({
            def,
            state,
            action,
            adjacencyGraph,
            decisionPlayer: state.activePlayer,
            bindings: buildMoveRuntimeBindings({
              actionId: action.id,
              params: {},
              freeOperation: true,
              ...(resolveGrantMoveActionClassOverride(def, action.id, candidateGrant.operationClass) === undefined
                ? {}
                : { actionClass: candidateGrant.operationClass }),
            }),
            runtimeTableIndex,
            evalRuntimeResources,
            skipExecutorCheck: !hasActionPipeline,
            skipPipelineDispatch: !hasActionPipeline,
            ...candidatePreflightOverlay,
          });
          if (candidatePreflight.kind === 'invalidSpec') {
            throw selectorInvalidSpecError(
              'legalMoves',
              candidatePreflight.selector,
              action,
              candidatePreflight.error,
              candidatePreflight.selectorContractViolations,
            );
          }
          const candidatePipeline =
            candidatePreflight.kind === 'applicable' && candidatePreflight.pipelineDispatch.kind === 'matched'
              ? candidatePreflight.pipelineDispatch.profile
              : undefined;
          if (
            candidatePipeline === undefined
            && !hasEnumeratedBaseTemplate
            && !(
              candidatePreflight.kind === 'notApplicable'
              && (
                candidatePreflight.reason === 'pipelineNotApplicable'
                || candidatePreflight.reason === 'phaseMismatch'
              )
            )
          ) {
            return false;
          }
          if (candidatePipeline !== undefined) {
            if (candidatePreflight.kind !== 'applicable' || candidatePreflight.pipelineDispatch.kind !== 'matched') {
              return false;
            }
            const candidateStatus = evaluateDiscoveryPipelinePredicateStatus(
              action,
              candidatePipeline,
              candidatePreflight.evalCtx,
              {
                includeCostValidation: candidatePipeline.atomicity === 'atomic',
              },
            );
            const candidateViabilityDecision = decideDiscoveryLegalMovesPipelineViability(candidateStatus);
            if (
              candidateViabilityDecision.kind === 'excludeTemplate'
              && (
                candidateViabilityDecision.outcome !== 'pipelineLegalityFailed'
                || !shouldEnumerateLegalMoveForOutcome(candidateViabilityDecision.outcome)
              )
            ) {
              return false;
            }
          }

          const candidateMove: Move = {
            actionId: action.id,
            params: {},
            freeOperation: true,
            ...(resolveGrantMoveActionClassOverride(def, action.id, candidateGrant.operationClass) === undefined
              ? {}
              : { actionClass: candidateGrant.operationClass }),
          };
          if (toMoveIdentityKey(def, candidateMove) !== toMoveIdentityKey(def, baseMove)) {
            return false;
          }
          const candidateScopedState: GameState = {
            ...state,
            turnOrderState: {
              type: 'cardDriven',
              runtime: {
                ...runtime,
                pendingFreeOperationGrants: pending.filter(
                  (pendingGrant) => pendingGrant.grantId === candidateGrant.grantId || !isCurrentReadyGrant(pendingGrant.grantId),
                ),
              },
            },
          };
          if (!isFreeOperationApplicableForMove(def, candidateScopedState, candidateMove, seatResolution)) {
            return false;
          }
          if (!isFreeOperationGrantedForMove(def, candidateScopedState, candidateMove, seatResolution)) {
            return false;
          }
          return isMoveDecisionSequenceAdmittedForLegalMove(
            def,
            candidateScopedState,
            candidateMove,
            MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
            {
              budgets: enumeration.budgets,
              onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
            },
          );
        })
        .map((candidateGrant) => candidateGrant.grantId);

      const viableReadyGrantState = createReadyGrantScopedState(viableReadyGrantIds);

      if (!isFreeOperationCandidateAdmitted(viableReadyGrantState, baseMove)) {
        continue;
      }

      const grantMoveKey = toMoveIdentityKey(def, baseMove);
      if (seenGrantMoveKeys.has(grantMoveKey)) {
        continue;
      }
      seenGrantMoveKeys.add(grantMoveKey);

      if (!tryPushTemplateMove(enumeration, baseMove, action.id)) {
        return;
      }
    }
  }
}

function enumerateCurrentEventMoves(
  action: ActionDef,
  def: GameDef,
  state: GameState,
  enumeration: MoveEnumerationState,
  discoverer?: EnumerationDecisionDiscoverer,
  runtime?: GameDefRuntime,
): void {
  if (enumeration.templateBudgetExceeded) {
    return;
  }
  if (!isCardEventAction(action)) {
    return;
  }

  const current = resolveCurrentEventCardState(def, state);
  if (current === null) {
    return;
  }

  const sides: Array<{ readonly side: 'unshaded' | 'shaded'; readonly branches: readonly { readonly id: string }[] | undefined }> = [];
  if (current.card.unshaded !== undefined) {
    sides.push({ side: 'unshaded', branches: current.card.unshaded.branches });
  }
  if (current.card.shaded !== undefined) {
    sides.push({ side: 'shaded', branches: current.card.shaded.branches });
  }

  const baseMoves: Move[] = [];
  for (const side of sides) {
    if (side.branches === undefined || side.branches.length === 0) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
        },
      });
      continue;
    }
    for (const branch of side.branches) {
      baseMoves.push({
        actionId: action.id,
        params: {
          eventCardId: current.card.id,
          eventDeckId: current.deckId,
          side: side.side,
          branch: branch.id,
        },
      });
    }
  }

  for (const move of baseMoves) {
    // Matrix filtering must happen before decision-sequence probing.
    // Some event branches reference decision bindings in their effects;
    // probing a move that is matrix-disallowed can raise false runtime errors.
    if (!isMoveAllowedByTurnFlowOptionMatrix(def, state, move)) {
      continue;
    }

    if (
      !isMoveDecisionSequenceAdmittedForLegalMove(
        def,
        state,
        move,
        MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
        {
          budgets: enumeration.budgets,
          onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
          ...(discoverer === undefined ? {} : { discoverer }),
        },
        runtime,
      )
    ) {
      continue;
    }
    if (!tryPushOptionMatrixFilteredMove(enumeration, def, state, move, action)) {
      return;
    }
  }
}

const enumerateRawLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): RawLegalMoveEnumerationResult => {
  validateTurnFlowRuntimeStateInvariants(state);
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const warnings: RuntimeWarning[] = [];
  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const discoveryCache: DiscoveryCache = new Map();

  if (!isActiveSeatEligibleForTurnFlow(def, state, seatResolution)) {
    return { moves: [], warnings, discoveryCache };
  }

  const enumeration: MoveEnumerationState = {
    budgets,
    probePlainActionFeasibility: options?.probePlainActionFeasibility === true,
    warnings,
    moves: [],
    paramExpansions: 0,
    templateBudgetExceeded: false,
    paramExpansionBudgetExceeded: false,
  };
  const adjacencyGraph = runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const evalRuntimeResources = createEvalRuntimeResources();
  const currentPhaseDef = findPhaseDef(def, state.currentPhase);
  const defaultDiscover = createMoveDecisionSequenceChoiceDiscoverer(def, state, runtime);
  const cachedDiscover: EnumerationDecisionDiscoverer = (move, discoverOptions) => {
    const cached = discoveryCache.get(move);
    if (cached !== undefined) {
      return cached;
    }
    const result = defaultDiscover(move, discoverOptions);
    discoveryCache.set(move, result);
    return result;
  };

  const earlyExitAfterFirst = options?.earlyExitAfterFirst === true;

  // When only checking existence (earlyExitAfterFirst), try trivial actions
  // first — those with no params, no precondition, and always-complete.
  // These generate exactly one move with minimal cost, avoiding iteration
  // through complex parameterized operations. This is game-agnostic: any
  // action that matches these criteria (e.g., 'pass' in COIN games) benefits.
  const alwaysComplete = runtime?.alwaysCompleteActionIds ?? computeAlwaysCompleteActionIds(def);
  let earlyExitTriedTrivial = false;
  if (earlyExitAfterFirst) {
    for (const action of def.actions) {
      // Trivial = no params + always-complete + no precondition + no pipeline
      if (action.params.length > 0 || !alwaysComplete.has(action.id)) continue;
      if (action.pre !== null) continue;
      if ((def.actionPipelines ?? []).some((p) => p.actionId === action.id)) continue;
      if (isCardEventAction(action)) continue;
      earlyExitTriedTrivial = true;
      const preflight = resolveActionApplicabilityPreflight({
        def,
        state,
        action,
        adjacencyGraph,
        decisionPlayer: state.activePlayer,
        bindings: buildMoveRuntimeBindings({ actionId: action.id, params: {} }),
        runtimeTableIndex,
        evalRuntimeResources,
        skipExecutorCheck: true,
        skipPipelineDispatch: true,
      });
      if (preflight.kind !== 'applicable') continue;
      enumerateParams(action, def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, 0, {}, enumeration, currentPhaseDef,
        {
          ...(runtime === undefined ? {} : { runtime }),
          discoverer: cachedDiscover,
        },
      );
      if (enumeration.moves.length > 0) break;
    }
  }

  for (const action of def.actions) {
    if (enumeration.templateBudgetExceeded) {
      break;
    }
    if (earlyExitAfterFirst && enumeration.moves.length > 0) {
      break;
    }
    // Skip trivial actions already tried in the early-exit pass.
    if (earlyExitTriedTrivial && action.params.length === 0 && alwaysComplete.has(action.id) && action.pre === null) {
      continue;
    }
    const hasActionPipeline = (def.actionPipelines ?? []).some((pipeline) => pipeline.actionId === action.id);
    const preflight = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph,
      decisionPlayer: state.activePlayer,
      bindings: buildMoveRuntimeBindings({ actionId: action.id, params: {} }),
      runtimeTableIndex,
      evalRuntimeResources,
      skipExecutorCheck: !hasActionPipeline,
      skipPipelineDispatch: !hasActionPipeline,
    });
    if (preflight.kind === 'notApplicable') {
      void shouldEnumerateLegalMoveForOutcome(preflight.reason);
      continue;
    }
    if (preflight.kind === 'invalidSpec') {
      throw selectorInvalidSpecError(
        'legalMoves',
        preflight.selector,
        action,
        preflight.error,
        preflight.selectorContractViolations,
      );
    }

    const eventAction = isCardEventAction(action);
    const beforeEventCount = enumeration.moves.length;
    enumerateCurrentEventMoves(action, def, state, enumeration, cachedDiscover, runtime);
    if (eventAction) {
      if (enumeration.moves.length > beforeEventCount) {
        continue;
      }

      // Card-event actions normally require a resolvable current card context.
      // Fallback template enumeration is only allowed when no event decks exist
      // (pure action-class tests), when a pipeline-backed template is needed,
      // or when the action explicitly binds eventCardId and can be satisfied
      // without a currently resolved card token.
      const hasEventDecks = (def.eventDecks?.length ?? 0) > 0;
      if (hasEventDecks && !hasActionPipeline) {
        const hasResolvedCurrentCard = resolveCurrentEventCardState(def, state) !== null;
        const actionDeclaresEventCardId = action.params.some((param) => param.name === 'eventCardId');
        if (hasResolvedCurrentCard || !actionDeclaresEventCardId) {
          continue;
        }
      }
    }

    if (!hasActionPipeline) {
      enumerateParams(action, def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, 0, {}, enumeration, currentPhaseDef,
        {
          ...(runtime === undefined ? {} : { runtime }),
          discoverer: cachedDiscover,
        },
      );
      continue;
    }

    if (preflight.pipelineDispatch.kind === 'matched') {
      const pipeline = preflight.pipelineDispatch.profile;
      const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
        includeCostValidation: pipeline.atomicity === 'atomic',
      });
      const viabilityDecision = decideDiscoveryLegalMovesPipelineViability(status);
      if (viabilityDecision.kind === 'excludeTemplate') {
        if (viabilityDecision.outcome === 'pipelineLegalityFailed') {
          if (!shouldEnumerateLegalMoveForOutcome(viabilityDecision.outcome)) {
            continue;
          }
        } else {
          continue;
        }
      }

      if (
        !isMoveDecisionSequenceAdmittedForLegalMove(
          def,
          state,
          { actionId: action.id, params: {} },
          MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
          {
            budgets: enumeration.budgets,
            onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
            discoverer: cachedDiscover,
          },
          runtime,
        )
      ) {
        continue;
      }

      tryPushOptionMatrixFilteredMove(enumeration, def, state, { actionId: action.id, params: {} }, action);
      continue;
    }
  }

  enumeratePendingFreeOperationMoves(
    def,
    state,
    enumeration,
    adjacencyGraph,
    runtimeTableIndex,
    evalRuntimeResources,
    currentPhaseDef,
    seatResolution,
  );

  const finalMoves = applyTurnFlowWindowFilters(def, state, enumeration.moves, seatResolution);
  return { moves: finalMoves, warnings, discoveryCache };
};

export const enumerateLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): LegalMoveEnumerationResult => {
  const { moves, warnings: rawWarnings, discoveryCache } = enumerateRawLegalMoves(def, state, options, runtime);
  const warnings = [...rawWarnings];
  return {
    moves: classifyEnumeratedMoves(def, state, moves, warnings, runtime, discoveryCache),
    warnings,
  };
};

export const legalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): readonly Move[] => enumerateRawLegalMoves(def, state, options, runtime).moves;
