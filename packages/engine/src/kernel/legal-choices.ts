import {
  choiceValidationFailed,
  choiceValidationSuccess,
  type ChoiceValidationResult,
} from './choice-validation-result.js';
import {
  runSingletonProbePass,
  runWitnessSearch,
  createDiagnosticsAccumulator,
  finalizeDiagnostics,
  type ChooseNDiagnostics,
  type ChooseNDiagnosticsAccumulator,
  type SingletonProbeBudget,
  type WitnessSearchBudget,
} from './choose-n-option-resolution.js';
import type { ChooseNTemplate } from './choose-n-session.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { applyEffects } from './effects.js';
import { isEffectErrorCode, isEffectRuntimeReason } from './effect-error.js';
import { deriveChoiceTargetKinds } from './choice-target-kinds.js';
import {
  isDeclaredActionParamValueInDomain,
  resolveDeclaredActionParamDomainOptions,
} from './declared-action-param-domain.js';
import { createDiscoveryProbeEffectContext, createDiscoveryStrictEffectContext } from './effect-context.js';
import type { ReadContext } from './eval-context.js';
import { resolveEventCardPendingChoice, resolveEventEffectList } from './event-execution.js';
import { buildMoveRuntimeBindings, resolvePipelineDecisionBindingsForMove } from './move-runtime-bindings.js';
import {
  decideDiscoveryLegalChoicesPipelineViability,
  evaluateDiscoveryPipelinePredicateStatus,
  evaluateDiscoveryStagePredicateStatus,
} from './pipeline-viability-policy.js';
import { selectorInvalidSpecError } from './selector-runtime-contract.js';
import { toChoiceIllegalReason } from './legality-outcome.js';
import { kernelRuntimeError } from './runtime-error.js';
import {
  classifyDecisionSequenceSatisfiability,
  type DecisionSequenceSatisfiability,
} from './decision-sequence-satisfiability.js';
import { buildAdjacencyGraph } from './spatial.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { createSeatResolutionContext, type SeatResolutionContext } from './identity.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import {
  toFreeOperationChoiceIllegalReason,
  toFreeOperationDeniedCauseForLegality,
} from './free-operation-legality-policy.js';
import { canResolveAmbiguousFreeOperationOverlapInCurrentState } from './free-operation-viability.js';
import {
  resolveFreeOperationDiscoveryAnalysis,
} from './free-operation-discovery-analysis.js';
import { validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';
import { isCardEventActionId } from './action-capabilities.js';
import { evalCondition } from './eval-condition.js';
import { unwrapEvalCondition } from './eval-result.js';
import { findPhaseDef } from './phase-lookup.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import { probeWith, resolveProbeResult, type ProbeResult } from './probe-result.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type {
  ActionDef,
  ChoiceIllegalRequest,
  ChoiceOption,
  ChoicePendingChooseNRequest,
  ChoicePendingRequest,
  ChoiceRequest,
  EffectAST,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
} from './types.js';

const COMPLETE: ChoiceRequest = { kind: 'complete', complete: true };

/**
 * Convert a `pending` choice with an empty options domain into `illegal`.
 * A chooseN decision with `canConfirm === true` (min = 0) is still satisfiable
 * with an empty selection, so it passes through unchanged.
 */
const coerceEmptyDomainToIllegal = (request: ChoiceRequest): ChoiceRequest => {
  if (request.kind !== 'pending' || request.options.length > 0) {
    return request;
  }
  if (request.type === 'chooseN' && request.canConfirm) {
    return request;
  }
  return {
    kind: 'illegal',
    complete: false,
    reason: 'emptyDomain',
  };
};

// ---------------------------------------------------------------------------
// Compound SA decision chaining
// ---------------------------------------------------------------------------

/**
 * Tag a choice request originating from compound SA discovery with `decisionPath`.
 * Pending requests get `'compound.specialActivity'` so callers know to route
 * the decision value into `move.compound.specialActivity.params[decisionKey]`.
 */
const tagSADecisionPath = (request: ChoiceRequest): ChoiceRequest => {
  if (request.kind === 'pending') {
    return { ...request, decisionPath: 'compound.specialActivity' as const };
  }
  if (request.kind === 'pendingStochastic') {
    return {
      ...request,
      alternatives: request.alternatives.map((alt) => ({
        ...alt,
        decisionPath: 'compound.specialActivity' as const,
      })),
    };
  }
  // 'complete' and 'illegal' pass through unmodified
  return request;
};
const MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS = 1024;

/** Count-based budget for singleton probe passes (consumed in 63CHOOPEROPT-003). */
const MAX_CHOOSE_N_TOTAL_PROBE_BUDGET = 4096;

/** Count-based budget for witness search nodes (consumed in 63CHOOPEROPT-004). */
const MAX_CHOOSE_N_TOTAL_WITNESS_NODES = 2048;

// Re-export budget constants for test oracle access.
export {
  MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS,
  MAX_CHOOSE_N_TOTAL_PROBE_BUDGET,
  MAX_CHOOSE_N_TOTAL_WITNESS_NODES,
};

/**
 * Mutable accumulator for classification subphase timing.
 *
 * When provided via `LegalChoicesRuntimeOptions.classificationSubphaseTiming`,
 * `legalChoicesEvaluate()` adds elapsed time (ms) to these fields for each
 * identifiable subphase.  Zero-cost when omitted — no `performance.now()` calls.
 */
export interface ClassificationSubphaseTiming {
  /** Time spent building context, adjacency graph, bindings, free-op analysis. */
  bindingTimeMs: number;
  /** Time spent in `resolveActionParamPendingChoice` and option enumeration. */
  targetEnumTimeMs: number;
  /** Time spent in `resolveActionApplicabilityPreflight` and pipeline predicate evaluation. */
  predicateTimeMs: number;
  /** Time spent iterating pipeline stages, cost checking, and effect discovery. */
  pipelineTimeMs: number;
}

/** Create a zeroed `ClassificationSubphaseTiming`. */
export function createClassificationSubphaseTiming(): ClassificationSubphaseTiming {
  return { bindingTimeMs: 0, targetEnumTimeMs: 0, predicateTimeMs: 0, pipelineTimeMs: 0 };
}

export interface LegalChoicesRuntimeOptions {
  readonly onDeferredPredicatesEvaluated?: (count: number) => void;
  readonly onProbeContextPrepared?: () => void;
  /** Callback invoked when a chooseN pending choice is discovered, delivering the full-fidelity template for session-based optimization. */
  readonly onChooseNTemplateCreated?: (template: ChooseNTemplate) => void;
  /** When true, collects chooseN resolution diagnostics and delivers them via onChooseNDiagnostics. Dev-only — zero overhead when false/undefined. */
  readonly collectDiagnostics?: boolean;
  /** Callback invoked with diagnostics after a chooseN resolution completes. Only called when collectDiagnostics is true. */
  readonly onChooseNDiagnostics?: (diagnostics: ChooseNDiagnostics) => void;
  /**
   * When true, `legalChoicesDiscover` chains into compound special-activity
   * decisions after the main action returns `complete`.  Default `false`.
   *
   * Enable for MCTS incremental decision expansion.  Leave off for
   * normalization/replay callers that handle SA normalization separately.
   */
  readonly chainCompoundSA?: boolean;
  /**
   * Optional mutable accumulator for classification subphase timing.
   * When provided, `legalChoicesEvaluate` instruments its internal subphases
   * and adds elapsed time to this object.  Zero-cost when undefined.
   */
  readonly classificationSubphaseTiming?: ClassificationSubphaseTiming;
  /**
   * Transient chooseN selections — intermediate accumulated arrays for
   * in-progress chooseN decisions.  When provided, the kernel uses these
   * instead of `move.params[decisionKey]` for the specified bindings,
   * allowing incremental decision expansion (e.g., MCTS) to track
   * partial selections without the kernel treating them as finalized.
   */
  readonly transientChooseNSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
}

interface LegalChoicesInternalOptions extends LegalChoicesRuntimeOptions {
  /** Mutable accumulator for diagnostics collection. Internal only — created by public API when collectDiagnostics is true. */
  readonly _diagnosticsAccumulator?: ChooseNDiagnosticsAccumulator;
}

const actionMapCache = new WeakMap<readonly ActionDef[], ReadonlyMap<ActionDef['id'], ActionDef>>();

const getActionMap = (actions: readonly ActionDef[]): ReadonlyMap<ActionDef['id'], ActionDef> => {
  let cached = actionMapCache.get(actions);
  if (cached === undefined) {
    const map = new Map<ActionDef['id'], ActionDef>();
    for (const action of actions) {
      map.set(action.id, action);
    }
    cached = map;
    actionMapCache.set(actions, cached);
  }
  return cached;
};

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  getActionMap(def.actions).get(actionId);

export interface LegalChoicesPreparedContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly action: ActionDef;
  readonly adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>;
  readonly runtimeTableIndex: ReturnType<typeof buildRuntimeTableIndex>;
  readonly seatResolution: SeatResolutionContext;
}

interface DiscoveryEffectExecutionResult {
  readonly request: ChoiceRequest;
  readonly state: GameState;
  readonly bindings: Readonly<Record<string, unknown>>;
}

const STACKING_VIOLATION_PROBE_RESULT: ProbeResult<never> = {
  outcome: 'illegal',
  reason: 'stackingViolation',
};

const OWNER_MISMATCH_PROBE_RESULT: ProbeResult<never> = {
  outcome: 'inconclusive',
  reason: 'ownerMismatch',
};

const buildDiscoveryEffectContextBase = (
  evalCtx: ReadContext,
  move: Move,
  options?: LegalChoicesInternalOptions,
): Parameters<typeof createDiscoveryStrictEffectContext>[0] => ({
  def: evalCtx.def,
  adjacencyGraph: evalCtx.adjacencyGraph,
  state: evalCtx.state,
  rng: { state: evalCtx.state.rng },
  activePlayer: evalCtx.activePlayer,
  actorPlayer: evalCtx.actorPlayer,
  bindings: evalCtx.bindings,
  moveParams: move.params,
  resources: evalCtx.resources,
  traceContext: { eventContext: 'actionEffect', actionId: String(move.actionId), effectPathRoot: 'legalChoices.effects' },
  effectPath: '',
  ...(evalCtx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: evalCtx.runtimeTableIndex }),
  ...(evalCtx.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: evalCtx.freeOperationOverlay }),
  ...(evalCtx.maxQueryResults === undefined ? {} : { maxQueryResults: evalCtx.maxQueryResults }),
  ...(options?.transientChooseNSelections === undefined
    ? {}
    : { transientDecisionSelections: options.transientChooseNSelections }),
  ...(options?.onChooseNTemplateCreated === undefined
    ? {}
    : { chooseNTemplateCallback: options.onChooseNTemplateCreated }),
});

const executeDiscoveryEffectsStrict = (
  effects: readonly EffectAST[],
  evalCtx: ReadContext,
  move: Move,
  options?: LegalChoicesInternalOptions,
): ProbeResult<DiscoveryEffectExecutionResult> => {
  const baseContext = buildDiscoveryEffectContextBase(evalCtx, move, options);
  return probeWith(
    () => {
      const result = applyEffects(effects, createDiscoveryStrictEffectContext(baseContext));
      return {
        request: result.choiceValidationError === undefined
          ? result.pendingChoice ?? COMPLETE
          : {
            kind: 'illegal',
            complete: false,
            reason: 'choiceValidationFailed',
            detail: result.choiceValidationError.message,
          },
        state: result.state,
        bindings: result.bindings ?? evalCtx.bindings,
      };
    },
    classifyDiscoveryProbeError,
  );
};

const executeDiscoveryEffectsProbe = (
  effects: readonly EffectAST[],
  evalCtx: ReadContext,
  move: Move,
  options?: LegalChoicesInternalOptions,
): ProbeResult<DiscoveryEffectExecutionResult> => {
  const baseContext = buildDiscoveryEffectContextBase(evalCtx, move, options);
  return probeWith(
    () => {
      const result = applyEffects(effects, createDiscoveryProbeEffectContext(baseContext));
      return {
        request: result.choiceValidationError === undefined
          ? result.pendingChoice ?? COMPLETE
          : {
            kind: 'illegal',
            complete: false,
            reason: 'choiceValidationFailed',
            detail: result.choiceValidationError.message,
          },
        state: result.state,
        bindings: result.bindings ?? evalCtx.bindings,
      };
    },
    classifyDiscoveryProbeError,
  );
};

export const optionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const classifyDiscoveryProbeError = (error: unknown): ProbeResult<never> | null =>
  isEffectErrorCode(error, 'STACKING_VIOLATION') ? STACKING_VIOLATION_PROBE_RESULT : null;

const classifyChoiceProbeError = (error: unknown): ProbeResult<never> | null =>
  isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH) ? OWNER_MISMATCH_PROBE_RESULT : null;

const evaluateProbeMoveWithChoiceValidationResult = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  move: Move,
): ChoiceValidationResult<ChoiceRequest> => {
  try {
    const request = evaluateProbeMove(move);
    if (request.kind === 'illegal' && request.reason === 'choiceValidationFailed') {
      return choiceValidationFailed(request.detail ?? request.reason);
    }
    return choiceValidationSuccess(request);
  } catch (error: unknown) {
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      return choiceValidationFailed(error.message, error.context);
    }
    throw error;
  }
};

const probeChoiceRequest = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  move: Move,
): ProbeResult<ChoiceRequest> =>
  probeWith(() => evaluateProbeMove(move), classifyChoiceProbeError);

const probeDecisionSequenceSatisfiability = (
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  move: Move,
): ProbeResult<DecisionSequenceSatisfiability> =>
  probeWith(() => classifyProbeMoveSatisfiability(move), classifyChoiceProbeError);

const countCombinationsCapped = (n: number, k: number, cap: number): number => {
  if (k < 0 || k > n) {
    return 0;
  }

  const normalizedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= normalizedK; i += 1) {
    result = (result * (n - normalizedK + i)) / i;
    if (result > cap) {
      return cap;
    }
  }

  return Math.floor(result);
};

const enumerateCombinations = (
  n: number,
  k: number,
  visit: (indices: readonly number[]) => void,
): void => {
  const current: number[] = [];

  const walk = (start: number, remaining: number): void => {
    if (remaining === 0) {
      visit(current);
      return;
    }

    const upper = n - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(index);
      walk(index + 1, remaining - 1);
      current.pop();
    }
  };

  walk(0, k);
};

const classifyProbeOutcomeLegality = (
  probed: ChoiceRequest,
  classification: DecisionSequenceSatisfiability | null,
): { legality: ChoiceOption['legality']; illegalReason: ChoiceOption['illegalReason'] } => {
  if (probed.kind === 'illegal' || classification === 'unsatisfiable') {
    return {
      legality: 'illegal',
      illegalReason: probed.kind === 'illegal' ? probed.reason : null,
    };
  }

  // Stay conservative under unresolved or stochastic probe outcomes.
  if (
    probed.kind === 'pendingStochastic'
    || classification === 'unknown'
    || (probed.kind === 'pending' && classification === null)
  ) {
    return {
      legality: 'unknown',
      illegalReason: null,
    };
  }

  return {
    legality: 'legal',
    illegalReason: null,
  };
};

/**
 * Exhaustive combination enumerator — exact path for small search spaces.
 * Also serves as the test oracle for the hybrid resolver.
 */
const resolveChooseNOptionsExhaustive = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingChooseNRequest,
  uniqueOptions: readonly Move['params'][string][],
  minAdditionalSelections: number,
  maxAdditionalSelections: number,
): readonly ChoiceOption[] => {
  const optionLegalityByKey = new Map<string, { legality: ChoiceOption['legality']; illegalReason: ChoiceOption['illegalReason'] }>();
  const fixedIllegalOptionKeys = new Set<string>();
  for (const option of request.options) {
    const key = optionKey(option.value);
    const status = option.legality === 'illegal'
      ? { legality: 'illegal' as const, illegalReason: option.illegalReason }
      : { legality: 'illegal' as const, illegalReason: null };
    optionLegalityByKey.set(key, status);
    if (option.legality === 'illegal') {
      fixedIllegalOptionKeys.add(key);
    }
  }

  for (let size = minAdditionalSelections; size <= maxAdditionalSelections; size += 1) {
    if (size === 0) {
      continue;
    }

    enumerateCombinations(uniqueOptions.length, size, (indices) => {
      const additionalSelected = indices.map((index) => uniqueOptions[index]!);
      if (additionalSelected.some((option) => fixedIllegalOptionKeys.has(optionKey(option)))) {
        return;
      }
      const selectedChoice = [...request.selected, ...additionalSelected] as Move['params'][string];
      const probeMove = {
        ...partialMove,
        params: {
          ...partialMove.params,
          [request.decisionKey]: selectedChoice,
        },
      };
      const probedResult = probeChoiceRequest(evaluateProbeMove, probeMove);
      const probed = resolveProbeResult(probedResult, {
        onLegal: (value) => value,
        onIllegal: () => null,
        onInconclusive: () => null,
      });
      if (probed === null) {
        for (const option of additionalSelected) {
          const key = optionKey(option);
          const status = optionLegalityByKey.get(key);
          if (status !== undefined && status.legality === 'illegal') {
            status.legality = 'unknown';
            status.illegalReason = null;
          }
        }
        return;
      }

      let classification: DecisionSequenceSatisfiability | null = null;
      if (probed.kind === 'pending') {
        classification = resolveProbeResult(
          probeDecisionSequenceSatisfiability(classifyProbeMoveSatisfiability, probeMove),
          {
            onLegal: (value) => value,
            onIllegal: () => 'unknown' as DecisionSequenceSatisfiability,
            onInconclusive: () => 'unknown' as DecisionSequenceSatisfiability,
          },
        );
      }

      for (const option of additionalSelected) {
        const key = optionKey(option);
        const status = optionLegalityByKey.get(key);
        if (status === undefined || status.legality === 'legal') {
          continue;
        }

        const next = classifyProbeOutcomeLegality(probed, classification);
        if (next.legality === 'unknown') {
          status.legality = 'unknown';
          status.illegalReason = null;
          continue;
        }

        if (next.legality === 'illegal') {
          if (status.legality === 'illegal' && status.illegalReason === null && next.illegalReason !== null) {
            status.illegalReason = next.illegalReason;
          }
          continue;
        }

        status.legality = next.legality;
        status.illegalReason = next.illegalReason;
      }
    });
  }

  return request.options.map((option) => {
    const status = optionLegalityByKey.get(optionKey(option.value));
    if (status === undefined) {
      return {
        value: option.value,
        legality: 'unknown',
        illegalReason: null,
        resolution: 'exact' as const,
      };
    }

    return {
      value: option.value,
      legality: status.legality,
      illegalReason: status.legality === 'legal' ? null : status.illegalReason,
      resolution: 'exact' as const,
    };
  });
};

/**
 * Strategy dispatcher for chooseN option resolution.
 *
 * Routes to the exact exhaustive enumerator for small domains,
 * or produces a mixed surface (static-exact + provisional) for large domains.
 */
const mapChooseNOptions = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingRequest,
  diagnostics?: ChooseNDiagnosticsAccumulator,
): readonly ChoiceOption[] => {
  if (request.type !== 'chooseN') {
    throw new Error('mapChooseNOptions requires a chooseN request');
  }
  const selectedKeys = new Set(request.selected.map((value) => optionKey(value)));
  const uniqueOptions: Move['params'][string][] = [];
  const uniqueByKey = new Map<string, Move['params'][string]>();
  for (const option of request.options) {
    const key = optionKey(option.value);
    if (selectedKeys.has(key) || uniqueByKey.has(key)) {
      continue;
    }
    uniqueByKey.set(key, option.value);
    uniqueOptions.push(option.value);
  }

  const minAdditionalSelections = Math.max(0, (request.min ?? 0) - request.selected.length);
  const maxAdditionalSelections = Math.min(
    Math.max(0, (request.max ?? uniqueOptions.length) - request.selected.length),
    uniqueOptions.length,
  );
  if (minAdditionalSelections > maxAdditionalSelections) {
    return request.options.map((option) => ({
      value: option.value,
      legality: 'illegal',
      illegalReason: null,
      resolution: 'exact' as const,
    }));
  }

  let totalCombinations = 0;
  for (let size = minAdditionalSelections; size <= maxAdditionalSelections; size += 1) {
    totalCombinations += countCombinationsCapped(
      uniqueOptions.length,
      size,
      MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS - totalCombinations + 1,
    );
    if (totalCombinations > MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS) {
      if (diagnostics !== undefined) {
        diagnostics.mode = 'hybridSearch';
      }
      // Large domain: singleton probe pass for O(n) fast filtering,
      // then witness search for unresolved candidates.
      const singletonBudget: SingletonProbeBudget = { remaining: MAX_CHOOSE_N_TOTAL_PROBE_BUDGET };
      const singletonResults = runSingletonProbePass(
        (probeMove) => evaluateProbeMoveWithChoiceValidationResult(evaluateProbeMove, probeMove),
        classifyProbeMoveSatisfiability,
        partialMove,
        request,
        uniqueOptions,
        selectedKeys,
        singletonBudget,
        diagnostics,
      );

      // Witness search for options left unresolved by singleton pass.
      const witnessBudget: WitnessSearchBudget = { remaining: MAX_CHOOSE_N_TOTAL_WITNESS_NODES };
      const witnessStats = diagnostics !== undefined ? { cacheHits: 0, nodesVisited: 0 } : undefined;
      return runWitnessSearch(
        (probeMove) => evaluateProbeMoveWithChoiceValidationResult(evaluateProbeMove, probeMove),
        classifyProbeMoveSatisfiability,
        partialMove,
        request,
        singletonResults,
        uniqueOptions,
        selectedKeys,
        witnessBudget,
        witnessStats,
        undefined,
        diagnostics,
      );
    }
  }

  return resolveChooseNOptionsExhaustive(
    evaluateProbeMove,
    classifyProbeMoveSatisfiability,
    partialMove,
    request,
    uniqueOptions,
    minAdditionalSelections,
    maxAdditionalSelections,
  );
};

const mapOptionsForPendingChoice = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingRequest,
  diagnostics?: ChooseNDiagnosticsAccumulator,
): readonly ChoiceOption[] => {
  if (request.type === 'chooseN') {
    return mapChooseNOptions(evaluateProbeMove, classifyProbeMoveSatisfiability, partialMove, request, diagnostics);
  }

  return request.options.map((option) => {
    const probeMove = {
      ...partialMove,
      params: {
        ...partialMove.params,
        [request.decisionKey]: option.value,
      },
    };
    const probedResult = probeChoiceRequest(evaluateProbeMove, probeMove);
    const probed = resolveProbeResult(probedResult, {
      onLegal: (value) => value,
      onIllegal: () => null,
      onInconclusive: () => null,
    });
    if (probed === null) {
      return {
        value: option.value,
        legality: 'unknown',
        illegalReason: null,
        resolution: 'exact' as const,
      };
    }

    let classification: DecisionSequenceSatisfiability | null = null;
    if (probed.kind === 'pending') {
      classification = resolveProbeResult(
        probeDecisionSequenceSatisfiability(classifyProbeMoveSatisfiability, probeMove),
        {
          onLegal: (value) => value,
          onIllegal: () => 'unknown' as DecisionSequenceSatisfiability,
          onInconclusive: () => 'unknown' as DecisionSequenceSatisfiability,
        },
      );
    }
    const legality = classifyProbeOutcomeLegality(probed, classification);
    return {
      value: option.value,
      legality: legality.legality,
      illegalReason: legality.illegalReason,
      resolution: 'exact' as const,
    };
  });
};

const resolveActionParamPendingChoice = (
  action: ActionDef,
  evalCtx: ReadContext,
  partialMove: Move,
): ChoicePendingRequest | null => {
  let bindings: Readonly<Record<string, unknown>> = evalCtx.bindings;

  for (const param of action.params) {
    if (Object.prototype.hasOwnProperty.call(partialMove.params, param.name)) {
      const candidateEvalCtx = { ...evalCtx, bindings };
      if (!isDeclaredActionParamValueInDomain(param, partialMove.params[param.name], candidateEvalCtx)) {
        throw kernelRuntimeError(
          'LEGAL_CHOICES_VALIDATION_FAILED',
          `legalChoices: provided action param "${param.name}" is outside its declared domain`,
          {
            actionId: action.id,
            param: param.name,
            value: partialMove.params[param.name],
          },
        );
      }
      bindings = {
        ...bindings,
        [param.name]: partialMove.params[param.name],
      };
      continue;
    }

    const resolution = resolveDeclaredActionParamDomainOptions(param, {
      ...evalCtx,
      bindings,
    });
    if (resolution.invalidOption !== undefined) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `legalChoices: action param "${param.name}" domain option is not move-param encodable`,
        {
          actionId: action.id,
          param: param.name,
          value: resolution.invalidOption,
        },
      );
    }
    const targetKinds = deriveChoiceTargetKinds(param.domain);
    return {
      kind: 'pending',
      complete: false,
      decisionPlayer: evalCtx.activePlayer,
      decisionKey: param.name as ChoicePendingRequest['decisionKey'],
      name: param.name,
      type: 'chooseOne',
      options: resolution.options.map((value) => ({
        value,
        legality: 'unknown',
        illegalReason: null,
      })),
      targetKinds,
    };
  }

  return null;
};

type ExecuteDiscoveryEffects = (
  effects: readonly EffectAST[],
  evalCtx: ReadContext,
  move: Move,
  options?: LegalChoicesInternalOptions,
) => ProbeResult<DiscoveryEffectExecutionResult>;

type ProbeLegalityEvaluator = (move: Move, options?: LegalChoicesRuntimeOptions) => ChoiceRequest;

const classifyProbeMoveSatisfiability = (
  probeMove: Move,
  options: LegalChoicesRuntimeOptions | undefined,
  evaluateProbeLegality: ProbeLegalityEvaluator,
): DecisionSequenceSatisfiability =>
  classifyDecisionSequenceSatisfiability(
    probeMove,
    (candidateMove, discoverOptions) =>
      evaluateProbeLegality(candidateMove, {
        onDeferredPredicatesEvaluated: (count) => {
          options?.onDeferredPredicatesEvaluated?.(count);
          discoverOptions?.onDeferredPredicatesEvaluated?.(count);
        },
      }),
  ).classification;

const mapPendingChoiceOptions = (
  partialMove: Move,
  request: ChoicePendingRequest,
  options: LegalChoicesRuntimeOptions | undefined,
  evaluateProbeLegality: ProbeLegalityEvaluator,
  diagnostics?: ChooseNDiagnosticsAccumulator,
): readonly ChoiceOption[] =>
  mapOptionsForPendingChoice(
    (probeMove) => evaluateProbeLegality(probeMove, options),
    (probeMove) => classifyProbeMoveSatisfiability(probeMove, options, evaluateProbeLegality),
    partialMove,
    request,
    diagnostics,
  );

const toPipelineLegalityFailedRequest = (): ChoiceIllegalRequest => ({
  kind: 'illegal',
  complete: false,
  reason: 'pipelineLegalityFailed',
});

const legalChoicesWithPreparedContextInternal = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  executeDiscoveryEffects: ExecuteDiscoveryEffects,
  evaluateProbeLegality: ProbeLegalityEvaluator,
  options?: LegalChoicesInternalOptions,
  allowAmbiguousFreeOperationOverlapDiscovery = false,
): ChoiceRequest => {
  const { def, state, action, adjacencyGraph, runtimeTableIndex, seatResolution } = context;
  const cst = options?.classificationSubphaseTiming;
  const tFreeOp = cst !== undefined ? performance.now() : 0;
  let freeOperationAnalysis: ReturnType<typeof resolveFreeOperationDiscoveryAnalysis> | undefined;
  let freeOperationAmbiguousOverlapReason: Extract<ChoiceIllegalRequest['reason'], 'freeOperationAmbiguousOverlap'> | null = null;
  if (partialMove.freeOperation === true) {
    const analysis = resolveFreeOperationDiscoveryAnalysis(def, state, partialMove, seatResolution, {
      zoneFilterErrorSurface: 'legalChoices',
    });
    const deniedCause = toFreeOperationDeniedCauseForLegality(analysis.denial.cause);
    if (deniedCause !== null) {
      const deniedReason = toFreeOperationChoiceIllegalReason(deniedCause);
      if (!(allowAmbiguousFreeOperationOverlapDiscovery && deniedReason === 'freeOperationAmbiguousOverlap')) {
        if (cst !== undefined) { cst.bindingTimeMs += performance.now() - tFreeOp; }
        return {
          kind: 'illegal',
          complete: false,
          reason: deniedReason,
        };
      }
      freeOperationAmbiguousOverlapReason = deniedReason;
    }
    freeOperationAnalysis = analysis;
  }
  if (cst !== undefined) {
    cst.bindingTimeMs += performance.now() - tFreeOp;
  }

  const finalizeRequest = (request: ChoiceRequest): ChoiceRequest => {
    if (freeOperationAmbiguousOverlapReason === null) {
      return request;
    }
    return request.kind === 'pending' || request.kind === 'pendingStochastic'
      ? request
      : {
        kind: 'illegal',
        complete: false,
        reason: freeOperationAmbiguousOverlapReason,
      };
  };

  const tBinding = cst !== undefined ? performance.now() : 0;
  const baseBindings: Record<string, unknown> = {
    ...buildMoveRuntimeBindings(partialMove),
  };
  if (cst !== undefined) {
    cst.bindingTimeMs += performance.now() - tBinding;
  }
  const tPredicate = cst !== undefined ? performance.now() : 0;
  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: baseBindings,
    runtimeTableIndex,
    ...buildFreeOperationPreflightOverlay(freeOperationAnalysis, partialMove, 'legalChoices'),
  });
  if (cst !== undefined) {
    cst.predicateTimeMs += performance.now() - tPredicate;
  }
  if (preflight.kind === 'notApplicable') {
    return { kind: 'illegal', complete: false, reason: toChoiceIllegalReason(preflight.reason) };
  }
  if (preflight.kind === 'invalidSpec') {
    throw selectorInvalidSpecError(
      'legalChoices',
      preflight.selector,
      action,
      preflight.error,
      preflight.selectorContractViolations,
    );
  }
  const evalCtx = preflight.evalCtx;
  const pipelineDispatch = preflight.pipelineDispatch;
  const tTargetEnum = cst !== undefined ? performance.now() : 0;
  const actionParamRequest = resolveActionParamPendingChoice(action, evalCtx, partialMove);
  if (actionParamRequest !== null) {
    if (cst !== undefined) {
      cst.targetEnumTimeMs += performance.now() - tTargetEnum;
    }
    const request = !shouldEvaluateOptionLegality
      ? actionParamRequest
      : {
      ...actionParamRequest,
      options: mapPendingChoiceOptions(partialMove, actionParamRequest, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
    };
    return finalizeRequest(request);
  }
  // Event card implicit param resolution (side, branch)
  if (isCardEventActionId(def, action.id)) {
    const eventPendingChoice = resolveEventCardPendingChoice(def, state, partialMove);
    if (eventPendingChoice !== null) {
      if (cst !== undefined) {
        cst.targetEnumTimeMs += performance.now() - tTargetEnum;
      }
      const request = !shouldEvaluateOptionLegality
        ? eventPendingChoice
        : {
          ...eventPendingChoice,
          options: mapPendingChoiceOptions(partialMove, eventPendingChoice, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
        };
      return finalizeRequest(request);
    }
  }
  if (cst !== undefined) {
    cst.targetEnumTimeMs += performance.now() - tTargetEnum;
  }

  // All declared params are resolved — evaluate phase-default and action
  // preconditions.  This mirrors enumerateParams (legal-moves.ts:302-309)
  // and validateMove (apply-move.ts:742).
  const currentPhaseDef = findPhaseDef(def, state.currentPhase);
  if (currentPhaseDef?.actionDefaults?.pre !== undefined) {
    if (!unwrapEvalCondition(evalCondition(currentPhaseDef.actionDefaults.pre, evalCtx))) {
      return finalizeRequest({
        kind: 'illegal',
        complete: false,
        reason: 'actionPreconditionFailed',
      });
    }
  }
  if (action.pre !== null && !unwrapEvalCondition(evalCondition(action.pre, evalCtx))) {
    return finalizeRequest({
      kind: 'illegal',
      complete: false,
      reason: 'actionPreconditionFailed',
    });
  }

  const tPipeline = cst !== undefined ? performance.now() : 0;
  const recordPipeline = (): void => {
    if (cst !== undefined) {
      cst.pipelineTimeMs += performance.now() - tPipeline;
    }
  };
  const eventEffects = isCardEventActionId(def, action.id)
    ? resolveEventEffectList(def, state, partialMove)
    : [];
  if (pipelineDispatch.kind === 'matched') {
    const pipeline = pipelineDispatch.profile;
    const pipelineBindings = buildMoveRuntimeBindings(
      partialMove,
      resolvePipelineDecisionBindingsForMove(pipeline, partialMove.params),
    );
    const pipelineEvalCtx: ReadContext = {
      ...evalCtx,
      bindings: pipelineBindings,
    };
    const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, pipelineEvalCtx, {
      includeCostValidation: partialMove.freeOperation !== true,
    });
    const deferredCount = (status.legality === 'deferred' ? 1 : 0) + (status.costValidation === 'deferred' ? 1 : 0);
    if (deferredCount > 0) {
      options?.onDeferredPredicatesEvaluated?.(deferredCount);
    }
    const viabilityDecision = decideDiscoveryLegalChoicesPipelineViability(status);
    if (viabilityDecision.kind === 'illegalChoice') {
      recordPipeline();
      return finalizeRequest({ kind: 'illegal', complete: false, reason: toChoiceIllegalReason(viabilityDecision.outcome) });
    }
    let stageState = state;
    let stageBindings = pipelineEvalCtx.bindings;
    for (const stage of pipeline.stages) {
      const stageEvalCtx: ReadContext = {
        ...pipelineEvalCtx,
        state: stageState,
        bindings: stageBindings,
      };
      const stageStatus = evaluateDiscoveryStagePredicateStatus(
        action,
        pipeline.id,
        stage,
        pipeline.atomicity,
        stageEvalCtx,
        { includeCostValidation: partialMove.freeOperation !== true },
      );
      const stageDeferredCount = (stageStatus.legality === 'deferred' ? 1 : 0) + (stageStatus.costValidation === 'deferred' ? 1 : 0);
      if (stageDeferredCount > 0) {
        options?.onDeferredPredicatesEvaluated?.(stageDeferredCount);
      }
      const stageDecision = decideDiscoveryLegalChoicesPipelineViability(stageStatus);
      if (stageDecision.kind === 'illegalChoice') {
        recordPipeline();
        return finalizeRequest({ kind: 'illegal', complete: false, reason: toChoiceIllegalReason(stageDecision.outcome) });
      }
      if (stageStatus.atomicity === 'partial' && stageStatus.costValidation === 'failed') {
        continue;
      }
      const stageResult = executeDiscoveryEffects(stage.effects, stageEvalCtx, partialMove, options);
      const resolvedStageResult = resolveProbeResult(stageResult, {
        onLegal: (value) => value,
        onIllegal: () => null,
        onInconclusive: () => null,
      });
      if (resolvedStageResult === null) {
        recordPipeline();
        return finalizeRequest(toPipelineLegalityFailedRequest());
      }
      stageState = resolvedStageResult.state;
      stageBindings = resolvedStageResult.bindings;
      if (!shouldEvaluateOptionLegality || resolvedStageResult.request.kind !== 'pending') {
        if (resolvedStageResult.request.kind !== 'complete') {
          recordPipeline();
          return finalizeRequest(resolvedStageResult.request);
        }
      } else {
        recordPipeline();
        return finalizeRequest({
          ...resolvedStageResult.request,
          options: mapPendingChoiceOptions(
            partialMove,
            resolvedStageResult.request,
            options,
            evaluateProbeLegality,
            options?._diagnosticsAccumulator,
          ),
        });
      }
    }
    const eventEvalCtx: ReadContext = {
      ...pipelineEvalCtx,
      state: stageState,
      bindings: stageBindings,
    };
    const eventResult = executeDiscoveryEffects(eventEffects, eventEvalCtx, partialMove);
    const resolvedEventResult = resolveProbeResult(eventResult, {
      onLegal: (value) => value,
      onIllegal: () => null,
      onInconclusive: () => null,
    });
    if (resolvedEventResult === null) {
      recordPipeline();
      return finalizeRequest(toPipelineLegalityFailedRequest());
    }
    const request = resolvedEventResult.request;
    if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
      recordPipeline();
      return finalizeRequest(request);
    }

    recordPipeline();
    return finalizeRequest({
      ...request,
      options: mapPendingChoiceOptions(partialMove, request, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
    });
  }

  const rootResult = executeDiscoveryEffects(
    [...action.effects, ...eventEffects],
    evalCtx,
    partialMove,
    options,
  );
  const resolvedRootResult = resolveProbeResult(rootResult, {
    onLegal: (value) => value,
    onIllegal: () => null,
    onInconclusive: () => null,
  });
  if (resolvedRootResult === null) {
    recordPipeline();
    return finalizeRequest(toPipelineLegalityFailedRequest());
  }
  const request = resolvedRootResult.request;
  if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
    recordPipeline();
    return finalizeRequest(request);
  }

  recordPipeline();
  return finalizeRequest({
    ...request,
    options: mapPendingChoiceOptions(partialMove, request, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
  });
};

const legalChoicesWithPreparedContextProbeInternal = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesInternalOptions,
  allowAmbiguousFreeOperationOverlapDiscovery = false,
): ChoiceRequest =>
  legalChoicesWithPreparedContextInternal(
    context,
    partialMove,
    shouldEvaluateOptionLegality,
    executeDiscoveryEffectsProbe,
    (probeMove, probeOptions) => legalChoicesWithPreparedContextProbeInternal(
      context,
      probeMove,
      false,
      probeOptions,
      allowAmbiguousFreeOperationOverlapDiscovery,
    ),
    options,
    allowAmbiguousFreeOperationOverlapDiscovery,
  );

const legalChoicesWithPreparedContextProbe = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesInternalOptions,
): ChoiceRequest =>
  legalChoicesWithPreparedContextProbeInternal(
    context,
    partialMove,
    shouldEvaluateOptionLegality,
    options,
  );

const canResolveAmbiguousFreeOperationOverlapViaLaterDecisions = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  options?: LegalChoicesInternalOptions,
): boolean =>
  canResolveAmbiguousFreeOperationOverlapInCurrentState(
    context.def,
    context.state,
    partialMove,
    context.seatResolution,
    {
      onWarning: () => undefined,
      resolveDecisionSequence: (move) => {
        const request = legalChoicesWithPreparedContextProbeInternal(
          context,
          move,
          false,
          options,
          true,
        );
        if (request.kind === 'complete') {
          return {
            complete: true,
            move,
            warnings: [],
          };
        }
        if (request.kind === 'illegal') {
          return {
            complete: false,
            move,
            illegal: request,
            warnings: [],
          };
        }
        if (request.kind === 'pendingStochastic') {
          return {
            complete: false,
            move,
            nextDecisionSet: request.alternatives,
            stochasticDecision: request,
            warnings: [],
          };
        }
        return {
          complete: false,
          move,
          nextDecision: request,
          warnings: [],
        };
      },
    },
  );

const legalChoicesWithPreparedContextStrict = (
  context: LegalChoicesPreparedContext,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesInternalOptions,
): ChoiceRequest => {
  const strictRequest = legalChoicesWithPreparedContextInternal(
    context,
    partialMove,
    shouldEvaluateOptionLegality,
    executeDiscoveryEffectsStrict,
    (probeMove, probeOptions) => legalChoicesWithPreparedContextProbe(context, probeMove, false, probeOptions),
    options,
  );
  if (strictRequest.kind !== 'illegal' || strictRequest.reason !== 'freeOperationAmbiguousOverlap') {
    return strictRequest;
  }

  const provisionalRequest = legalChoicesWithPreparedContextInternal(
    context,
    partialMove,
    shouldEvaluateOptionLegality,
    executeDiscoveryEffectsStrict,
    (probeMove, probeOptions) => legalChoicesWithPreparedContextProbe(context, probeMove, false, probeOptions),
    options,
    true,
  );
  if (
    (provisionalRequest.kind !== 'pending' && provisionalRequest.kind !== 'pendingStochastic')
    || !canResolveAmbiguousFreeOperationOverlapViaLaterDecisions(context, partialMove, options)
  ) {
    return strictRequest;
  }
  return provisionalRequest;
};

const prepareLegalChoicesContext = (
  def: GameDef,
  state: GameState,
  partialMove: Move,
  runtime?: GameDefRuntime,
): LegalChoicesPreparedContext => {
  const action = findAction(def, partialMove.actionId);
  if (action === undefined) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_UNKNOWN_ACTION',
      `legalChoices: unknown action id: ${String(partialMove.actionId)}`,
      { actionId: partialMove.actionId },
    );
  }

  return {
    def,
    state,
    action,
    adjacencyGraph: runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones),
    runtimeTableIndex: runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def),
    seatResolution: createSeatResolutionContext(def, state.playerCount),
  };
};

/**
 * Discover decisions for the compound special activity after the main action
 * has been fully resolved.  Uses the original game state (pre-main-op) for SA
 * discovery — this is sufficient for decision enumeration; `applyMove()` will
 * validate the final compound move against the real accumulated state.
 *
 * Returns the SA's choice request tagged with `decisionPath: 'compound.specialActivity'`
 * so callers know to route the value into `move.compound.specialActivity.params`.
 */
const discoverCompoundSAChoices = (
  def: GameDef,
  state: GameState,
  partialMove: Move,
  _shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesInternalOptions,
  runtime?: GameDefRuntime,
): ChoiceRequest => {
  const sa = partialMove.compound!.specialActivity;
  const saAction = findAction(def, sa.actionId);
  if (saAction === undefined) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_UNKNOWN_ACTION',
      `legalChoices: unknown compound SA action id: ${String(sa.actionId)}`,
      { actionId: sa.actionId },
    );
  }

  // Always disable option legality validation for SA discovery.  The SA is
  // evaluated against the pre-main-op state, which may differ from the
  // post-main-op state the SA was authored against.  applyMove will catch
  // truly illegal selections when the compound move is executed.
  const saContext = prepareLegalChoicesContext(def, state, sa, runtime);
  const saResult = legalChoicesWithPreparedContextStrict(saContext, sa, false, options);
  return tagSADecisionPath(saResult);
};

/**
 * Check for compound SA decisions after the main action returns `complete`.
 * If the move has a compound special activity, chain into SA discovery.
 * Otherwise, return the original result unchanged.
 */
const maybeChainCompoundSA = (
  result: ChoiceRequest,
  def: GameDef,
  state: GameState,
  partialMove: Move,
  shouldEvaluateOptionLegality: boolean,
  options?: LegalChoicesInternalOptions,
  runtime?: GameDefRuntime,
): ChoiceRequest => {
  if (result.kind !== 'complete' || partialMove.compound?.specialActivity === undefined) {
    return result;
  }

  // SA completeness check: probe the SA without option legality validation.
  // If the SA's params already satisfy all required decisions, the compound
  // move is fully resolved — return `complete` without re-discovery.
  // This prevents resolveMoveDecisionSequence from re-routing already-filled
  // SA params through the decision-key system against the pre-main-op state.
  //
  // The probe checks moveParams by decision key.  Externally-specified moves
  // (e.g. from test harnesses or playbook replay) may use named bind keys
  // like `$targetSpaces` instead of decision keys.  When the probe reports
  // `pending` but the pending decision's bind name is already present in
  // `sa.params`, the SA is complete under named keys — skip chaining.
  const sa = partialMove.compound.specialActivity;
  const saAction = findAction(def, sa.actionId);
  if (saAction !== undefined) {
    const saContext = prepareLegalChoicesContext(def, state, sa, runtime);
    const saProbe = legalChoicesWithPreparedContextStrict(saContext, sa, false, options);
    if (saProbe.kind === 'complete') {
      return result; // SA already fully resolved via decision keys
    }
    if (saProbe.kind === 'pending' && sa.params[saProbe.name] !== undefined) {
      return result; // SA has named param for pending decision — externally specified
    }
  }

  return discoverCompoundSAChoices(def, state, partialMove, shouldEvaluateOptionLegality, options, runtime);
};

export function legalChoicesDiscover(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesRuntimeOptions,
  runtime?: GameDefRuntime,
): ChoiceRequest {
  validateTurnFlowRuntimeStateInvariants(state);
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
  options?.onProbeContextPrepared?.();
  const result = legalChoicesWithPreparedContextStrict(context, partialMove, false, options);
  if (options?.chainCompoundSA !== true) {
    return coerceEmptyDomainToIllegal(result);
  }
  return coerceEmptyDomainToIllegal(
    maybeChainCompoundSA(result, def, state, partialMove, false, options, runtime),
  );
}

export function legalChoicesEvaluate(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesRuntimeOptions,
  runtime?: GameDefRuntime,
): ChoiceRequest {
  validateTurnFlowRuntimeStateInvariants(state);
  const cst = options?.classificationSubphaseTiming;
  const t0 = cst !== undefined ? performance.now() : 0;
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
  if (cst !== undefined) {
    cst.bindingTimeMs += performance.now() - t0;
  }
  options?.onProbeContextPrepared?.();
  const accumulator = options?.collectDiagnostics === true
    ? createDiagnosticsAccumulator('exactEnumeration')
    : undefined;
  const internalOptions: LegalChoicesInternalOptions | undefined = accumulator !== undefined
    ? { ...options, _diagnosticsAccumulator: accumulator }
    : options;
  const result = legalChoicesWithPreparedContextStrict(context, partialMove, true, internalOptions);
  if (accumulator !== undefined && options?.onChooseNDiagnostics !== undefined && result.kind === 'pending' && result.type === 'chooseN') {
    options.onChooseNDiagnostics(finalizeDiagnostics(accumulator, result.options));
  }
  return coerceEmptyDomainToIllegal(
    maybeChainCompoundSA(result, def, state, partialMove, true, internalOptions, runtime),
  );
}

export function legalChoicesEvaluateWithTransientChooseNSelections(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  transientChooseNSelections: Readonly<Record<string, readonly MoveParamScalar[]>>,
  options?: LegalChoicesRuntimeOptions,
  runtime?: GameDefRuntime,
): ChoiceRequest {
  validateTurnFlowRuntimeStateInvariants(state);
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
  options?.onProbeContextPrepared?.();
  const accumulator = options?.collectDiagnostics === true
    ? createDiagnosticsAccumulator('exactEnumeration')
    : undefined;
  const result = legalChoicesWithPreparedContextStrict(
    context,
    partialMove,
    true,
    {
      ...options,
      transientChooseNSelections,
      ...(accumulator !== undefined ? { _diagnosticsAccumulator: accumulator } : {}),
    },
  );
  if (accumulator !== undefined && options?.onChooseNDiagnostics !== undefined && result.kind === 'pending' && result.type === 'chooseN') {
    options.onChooseNDiagnostics(finalizeDiagnostics(accumulator, result.options));
  }
  const internalOptions: LegalChoicesInternalOptions = {
    ...options,
    transientChooseNSelections,
    ...(accumulator !== undefined ? { _diagnosticsAccumulator: accumulator } : {}),
  };
  return coerceEmptyDomainToIllegal(
    maybeChainCompoundSA(result, def, state, partialMove, true, internalOptions, runtime),
  );
}
