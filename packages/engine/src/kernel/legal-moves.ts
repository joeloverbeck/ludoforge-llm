import { hasActionPipeline } from './action-pipeline-lookup.js';
import { evaluateConditionWithCache } from './compiled-condition-expr-cache.js';
import { resolveActionExecutor } from './action-executor.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { resolveDeclaredActionParamDomainOptions } from './declared-action-param-domain.js';
import { createEnumerationSnapshot, type EnumerationStateSnapshot } from './enumeration-snapshot.js';
import type { ReadContext, EvalRuntimeResources } from './eval-context.js';
import { createEvalRuntimeResources } from './eval-context.js';
import { isRecoverableEvalResolutionError } from './eval-error-classification.js';
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
} from './free-operation-viability.js';
import { createProbeOverlay, transitionReadyGrantForCandidateMove } from './grant-lifecycle.js';
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
import { MISSING_BINDING_POLICY_CONTEXTS, classifyMissingBindingProbeError } from './missing-binding-policy.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { toMoveIdentityKey } from './move-identity.js';
import { resolveProbeResult, type ProbeResult } from './probe-result.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { isActiveSeatEligibleForTurnFlow } from './turn-flow-eligibility.js';
import { resolveCurrentEventCardState } from './event-execution.js';
import { isCardEventAction } from './action-capabilities.js';
import { compileGameDefFirstDecisionDomains, type FirstDecisionDomainResult, type FirstDecisionRuntimeCompilation } from './first-decision-compiler.js';
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
import { getPhaseActionIndex } from './phase-action-index.js';
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

type MutableEnumerationReadContext = {
  -readonly [K in keyof ReadContext]: ReadContext[K];
};

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
        trustedMove: viability.complete || viability.stochasticDecision !== undefined
          ? createTrustedExecutableMove(
            viability.move,
            state.stateHash,
            'enumerateLegalMoves',
          )
          : undefined,
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
        trustedMove: undefined,
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

const finalizeEarlyExitMoves = (
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): readonly Move[] => applyTurnFlowWindowFilters(def, state, moves, seatResolution);

function createMutableEnumerationReadContext(
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
): MutableEnumerationReadContext {
  return {
    def,
    adjacencyGraph,
    state,
    activePlayer: executionPlayer,
    actorPlayer: executionPlayer,
    bindings,
    resources: evalRuntimeResources,
    runtimeTableIndex,
    freeOperationOverlay: options?.freeOperationOverlay,
    maxQueryResults: undefined,
    collector: evalRuntimeResources.collector,
  };
}

function updateMutableEnumerationReadContext(
  scope: MutableEnumerationReadContext,
  state: GameState,
  executionPlayer: GameState['activePlayer'],
  bindings: Readonly<Record<string, unknown>>,
): ReadContext {
  scope.state = state;
  scope.activePlayer = executionPlayer;
  scope.actorPlayer = executionPlayer;
  scope.bindings = bindings;
  return scope;
}

const isCompiledFirstDecisionRejected = (
  compiled: FirstDecisionDomainResult,
  ctx: ReadContext,
): boolean => {
  if (!compiled.compilable || compiled.check === undefined) {
    return false;
  }

  try {
    return !compiled.check(ctx).admissible;
  } catch (error) {
    // The compiled first-decision domain check evaluates evalQuery and
    // resolveChooseNCardinality, both of which may throw recoverable eval
    // errors (MISSING_BINDING, MISSING_VAR, DIVISION_BY_ZERO) when bindings
    // are not yet resolved during discovery.  Treat these as "cannot
    // determine admissibility" → not rejected (false).
    if (isRecoverableEvalResolutionError(error)) return false;
    throw error;
  }
};

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
    readonly firstDecisionDomains?: FirstDecisionRuntimeCompilation;
    readonly snapshot?: EnumerationStateSnapshot;
  },
  scope?: MutableEnumerationReadContext,
): void {
  if (enumeration.paramExpansionBudgetExceeded || enumeration.templateBudgetExceeded) {
    return;
  }

  const readScope = scope ?? createMutableEnumerationReadContext(
    def,
    adjacencyGraph,
    runtimeTableIndex,
    evalRuntimeResources,
    state,
    state.activePlayer,
    bindings,
    options,
  );

  const resolveExecutionPlayerForBindings = (
    allowPendingBinding: boolean,
  ): ProbeResult<GameState['activePlayer'] | null> => {
    if (options?.executionPlayerOverride !== undefined) {
      return { outcome: 'legal', value: options.executionPlayerOverride };
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
      return { outcome: 'legal', value: null };
    }
    if (resolution.kind === 'invalidSpec') {
      if (allowPendingBinding) {
        const classified = classifyMissingBindingProbeError(
          resolution.error,
          MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EXECUTOR_DURING_PARAM_ENUMERATION,
        );
        if (classified !== null) {
          return classified;
        }
      }
      throw selectorInvalidSpecError('legalMoves', 'executor', action, resolution.error);
    }
    return { outcome: 'legal', value: resolution.executionPlayer };
  };

  if (paramIndex >= action.params.length) {
    const executionPlayer = resolveProbeResult(resolveExecutionPlayerForBindings(false), {
      onLegal: (value) => value,
      onIllegal: () => null,
      onInconclusive: () => null,
    });
    if (executionPlayer === null) {
      return;
    }
    const ctx = updateMutableEnumerationReadContext(readScope, state, executionPlayer, bindings);
    if (currentPhaseDef?.actionDefaults?.pre !== undefined) {
      if (!evaluateConditionWithCache(currentPhaseDef.actionDefaults.pre, ctx)) {
        return;
      }
    }
    if (action.pre !== null && !evaluateConditionWithCache(action.pre, ctx)) {
      return;
    }

    if (options?.pipeline !== undefined) {
      const status = evaluateDiscoveryPipelinePredicateStatus(action, options.pipeline, ctx, {
        includeCostValidation: options.pipeline.atomicity === 'atomic',
        snapshot: options.snapshot,
      });
      const viabilityDecision = decideDiscoveryLegalChoicesPipelineViability(status);
      if (viabilityDecision.kind === 'illegalChoice') {
        return;
      }
    }

    if (
      enumeration.probePlainActionFeasibility
      && options?.pipeline === undefined
      && options?.firstDecisionDomains !== undefined
      && isCompiledFirstDecisionRejected(options.firstDecisionDomains.byActionId.get(action.id) ?? { compilable: false }, ctx)
    ) {
      return;
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
        // Intentional bare catch — discovery-time safety net for plain actions.
        // The decision-sequence evaluation chain can throw diverse error classes
        // (eval errors, effect errors, stacking violations, choice probe errors)
        // when effects reference runtime state not available during discovery.
        // Typed classification is infeasible here because the error surface spans
        // the full effect/choice/selector execution stack.  Any probe error is
        // treated as "viability unknown" → keep the move.
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

  const executionPlayerResult = resolveExecutionPlayerForBindings(true);
  const executionPlayer = resolveProbeResult(executionPlayerResult, {
    onLegal: (value) => value,
    onIllegal: () => state.activePlayer,
    onInconclusive: () => state.activePlayer,
  });
  if (executionPlayer === null) {
    return;
  }
  const ctx = updateMutableEnumerationReadContext(readScope, state, executionPlayer, bindings);
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
      readScope,
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
  firstDecisionDomains: FirstDecisionRuntimeCompilation,
  currentPhaseDef: PhaseDef | undefined,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
  snapshot: EnumerationStateSnapshot,
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
      grant.phase !== 'sequenceWaiting',
  );
  if (readyGrants.length === 0) {
    return;
  }

  const seenGrantMoveKeys = new Set<string>();
  const baseTemplateActionClassKeys = new Set<string>();
  for (const move of enumeration.moves) {
    if (move.freeOperation !== true) {
      const cls = resolveTurnFlowActionClass(def, move) ?? 'operation';
      baseTemplateActionClassKeys.add(`${String(move.actionId)}:${cls}`);
    }
  }
  const defaultActionDomain = resolveTurnFlowDefaultFreeOperationActionDomain(def);
  const readyGrantIdSet = new Set(readyGrants.map((grant) => grant.grantId));
  const nonCurrentReadyGrants = pending.filter(
    (pendingGrant) => !readyGrantIdSet.has(pendingGrant.grantId),
  );
  const createReadyGrantScopedGrants = (
    grantIds: readonly string[],
  ): readonly TurnFlowPendingFreeOperationGrant[] => createProbeOverlay(
    nonCurrentReadyGrants,
    pending.filter((pendingGrant) => grantIds.includes(pendingGrant.grantId)),
  );
  const createReadyGrantScopedState = (grantIds: readonly string[]): GameState => ({
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        pendingFreeOperationGrants: createReadyGrantScopedGrants(grantIds),
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
      // Zone-filter evaluation during outcome-grant resolution can throw
      // FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED when evalCondition
      // encounters unresolvable bindings.  The upstream still throws (Group C
      // deferred — evalCondition has no result-returning variant yet).  Treat
      // the failure as "grant not determinable" → keep the move (return true).
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
    if (strongestOutcomeGrant.phase !== 'ready') {
      return strongestOutcomeGrant.phase === 'offered';
    }
    return transitionReadyGrantForCandidateMove(
      def,
      candidateState,
      strongestOutcomeGrant,
      candidateMove,
      seatResolution,
      {
        budgets: enumeration.budgets,
        onWarning: (warning) => emitEnumerationWarning(enumeration, warning),
      },
    ).grant.phase === 'offered';
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

    const grantActions = grantActionIds(def, grant);
    const actionDomain = grantActions.length > 0 ? grantActions : defaultActionDomain;
    for (const actionId of actionDomain) {
      const action = def.actions.find((candidate) => String(candidate.id) === actionId);
      if (action === undefined) {
        continue;
      }

      const hasPipeline = hasActionPipeline(def, action.id);
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
      const hasEnumeratedBaseTemplate = baseTemplateActionClassKeys.has(`${actionId}:${targetActionClass}`);

      const grantCapturedZones = resolveCapturedSequenceZonesByKey(state, grant);
      const freeOperationPreflightOverlay = buildFreeOperationPreflightOverlay(
        {
          executionPlayer,
          ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
          ...(grant.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
          ...(grantCapturedZones === undefined ? {} : { capturedSequenceZonesByKey: grantCapturedZones }),
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
        skipExecutorCheck: !hasPipeline,
        skipPipelineDispatch: !hasPipeline,
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
            firstDecisionDomains,
            snapshot,
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

      if (!hasPipeline) {
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
            firstDecisionDomains,
            snapshot,
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
          snapshot,
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
      const baseMoveKey = toMoveIdentityKey(def, baseMove);

      const viableReadyGrantIds = readyGrants
        .filter((candidateGrant) => {
          const candidateExecutionPlayer = resolvePendingFreeOperationGrantExecutionPlayer(def, state, candidateGrant);
          if (candidateExecutionPlayer === undefined || candidateGrant.executionContext !== undefined) {
            return false;
          }

          const candidateCapturedZones = resolveCapturedSequenceZonesByKey(state, candidateGrant);
          const candidatePreflightOverlay = buildFreeOperationPreflightOverlay(
            {
              executionPlayer: candidateExecutionPlayer,
              ...(candidateGrant.zoneFilter === undefined ? {} : { zoneFilter: candidateGrant.zoneFilter }),
              ...(candidateCapturedZones === undefined ? {} : { capturedSequenceZonesByKey: candidateCapturedZones }),
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
            skipExecutorCheck: !hasPipeline,
            skipPipelineDispatch: !hasPipeline,
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
                snapshot,
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
          if (toMoveIdentityKey(def, candidateMove) !== baseMoveKey) {
            return false;
          }
          const candidateScopedState = createReadyGrantScopedState([candidateGrant.grantId]);
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

      if (seenGrantMoveKeys.has(baseMoveKey)) {
        continue;
      }
      seenGrantMoveKeys.add(baseMoveKey);

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

    // Event effects resolve from the current card/branch runtime state.
    // Keep event admission on the canonical interpreter path; the compiled
    // first-decision guard only applies to static action/pipeline effect trees.
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
  const firstDecisionDomains = runtime?.firstDecisionDomains ?? compileGameDefFirstDecisionDomains(def);

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
  const snapshot = createEnumerationSnapshot(def, state);
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
  const actionsForPhase = getPhaseActionIndex(def).actionsByPhase.get(state.currentPhase) ?? [];
  let earlyExitTriedTrivial = false;
  if (earlyExitAfterFirst) {
    for (const action of actionsForPhase) {
      // Trivial = no params + always-complete + no precondition + no pipeline
      if (action.params.length > 0 || !alwaysComplete.has(action.id)) continue;
      if (action.pre !== null) continue;
      if (hasActionPipeline(def, action.id)) continue;
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
          firstDecisionDomains,
          discoverer: cachedDiscover,
          snapshot,
        },
      );
      if (enumeration.moves.length > 0) {
        const earlyExitMoves = finalizeEarlyExitMoves(def, state, enumeration.moves, seatResolution);
        if (earlyExitMoves.length > 0) {
          return { moves: earlyExitMoves, warnings, discoveryCache };
        }
        enumeration.moves.length = 0;
        break;
      }
    }
  }

  for (const action of actionsForPhase) {
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
    const hasPipeline = hasActionPipeline(def, action.id);
    const preflight = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph,
      decisionPlayer: state.activePlayer,
      bindings: buildMoveRuntimeBindings({ actionId: action.id, params: {} }),
      runtimeTableIndex,
      evalRuntimeResources,
      skipExecutorCheck: !hasPipeline,
      skipPipelineDispatch: !hasPipeline,
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
      if (hasEventDecks && !hasPipeline) {
        const hasResolvedCurrentCard = resolveCurrentEventCardState(def, state) !== null;
        const actionDeclaresEventCardId = action.params.some((param) => param.name === 'eventCardId');
        if (hasResolvedCurrentCard || !actionDeclaresEventCardId) {
          continue;
        }
      }
    }

    if (!hasPipeline) {
      enumerateParams(action, def, adjacencyGraph, runtimeTableIndex, evalRuntimeResources, state, 0, {}, enumeration, currentPhaseDef,
        {
          ...(runtime === undefined ? {} : { runtime }),
          firstDecisionDomains,
          discoverer: cachedDiscover,
          snapshot,
        },
      );
      continue;
    }

    if (preflight.pipelineDispatch.kind === 'matched') {
      const pipeline = preflight.pipelineDispatch.profile;
      const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, preflight.evalCtx, {
        includeCostValidation: pipeline.atomicity === 'atomic',
        snapshot,
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
        isCompiledFirstDecisionRejected(
          firstDecisionDomains.byPipelineProfileId.get(pipeline.id) ?? { compilable: false },
          preflight.evalCtx,
        )
      ) {
        continue;
      }

      // Skip the expensive decision-sequence satisfiability probe for pipeline
      // template moves. The compiled first-decision domain check above already
      // rejects templates whose first decision has zero options (when compilable).
      // For state-dependent first decisions (compilable: false, e.g. mapSpaces
      // queries), the probe was the costliest call in the pipeline enumeration
      // path — executing effects (applyChooseN, evalQuery, filterTokensByExpr)
      // just to verify satisfiability. The agent handles unsatisfiable templates
      // gracefully via templateCompletionUnsatisfiable, making the enumeration-time
      // probe redundant safety overhead.

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
    firstDecisionDomains,
    currentPhaseDef,
    seatResolution,
    snapshot,
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
