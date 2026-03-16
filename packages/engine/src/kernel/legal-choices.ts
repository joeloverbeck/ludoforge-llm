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
import { resolveEventEffectList } from './event-execution.js';
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
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
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

export interface LegalChoicesRuntimeOptions {
  readonly onDeferredPredicatesEvaluated?: (count: number) => void;
  readonly onProbeContextPrepared?: () => void;
  /** Callback invoked when a chooseN pending choice is discovered, delivering the full-fidelity template for session-based optimization. */
  readonly onChooseNTemplateCreated?: (template: ChooseNTemplate) => void;
  /** When true, collects chooseN resolution diagnostics and delivers them via onChooseNDiagnostics. Dev-only — zero overhead when false/undefined. */
  readonly collectDiagnostics?: boolean;
  /** Callback invoked with diagnostics after a chooseN resolution completes. Only called when collectDiagnostics is true. */
  readonly onChooseNDiagnostics?: (diagnostics: ChooseNDiagnostics) => void;
}

interface LegalChoicesInternalOptions extends LegalChoicesRuntimeOptions {
  readonly transientChooseNSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  /** Mutable accumulator for diagnostics collection. Internal only — created by public API when collectDiagnostics is true. */
  readonly _diagnosticsAccumulator?: ChooseNDiagnosticsAccumulator;
}

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

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
): DiscoveryEffectExecutionResult => {
  const baseContext = buildDiscoveryEffectContextBase(evalCtx, move, options);
  try {
    const result = applyEffects(effects, createDiscoveryStrictEffectContext(baseContext));
    return {
      request: result.pendingChoice ?? COMPLETE,
      state: result.state,
      bindings: result.bindings ?? evalCtx.bindings,
    };
  } catch (error: unknown) {
    if (isEffectErrorCode(error, 'STACKING_VIOLATION')) {
      return {
        request: { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' },
        state: evalCtx.state,
        bindings: evalCtx.bindings,
      };
    }
    throw error;
  }
};

const executeDiscoveryEffectsProbe = (
  effects: readonly EffectAST[],
  evalCtx: ReadContext,
  move: Move,
  options?: LegalChoicesInternalOptions,
): DiscoveryEffectExecutionResult => {
  const baseContext = buildDiscoveryEffectContextBase(evalCtx, move, options);
  try {
    const result = applyEffects(effects, createDiscoveryProbeEffectContext(baseContext));
    return {
      request: result.pendingChoice ?? COMPLETE,
      state: result.state,
      bindings: result.bindings ?? evalCtx.bindings,
    };
  } catch (error: unknown) {
    if (isEffectErrorCode(error, 'STACKING_VIOLATION')) {
      return {
        request: { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' },
        state: evalCtx.state,
        bindings: evalCtx.bindings,
      };
    }
    throw error;
  }
};

export const optionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

export const isChoiceDecisionOwnerMismatchDuringProbe = (error: unknown): boolean => {
  return isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH);
};

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
      let probed: ChoiceRequest;
      try {
        probed = evaluateProbeMove(
          {
            ...partialMove,
            params: {
              ...partialMove.params,
              [request.decisionKey]: selectedChoice,
            },
          },
        );
      } catch (error: unknown) {
        if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
          throw error;
        }
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
        try {
          classification = classifyProbeMoveSatisfiability(
            {
              ...partialMove,
              params: {
                ...partialMove.params,
                [request.decisionKey]: selectedChoice,
              },
            },
          );
        } catch (error: unknown) {
          if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
            throw error;
          }
          classification = 'unknown';
        }
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
        evaluateProbeMove,
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
        evaluateProbeMove,
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
    let probed: ChoiceRequest;
    try {
      probed = evaluateProbeMove(
        {
          ...partialMove,
          params: {
            ...partialMove.params,
            [request.decisionKey]: option.value,
          },
        },
      );
    } catch (error: unknown) {
      if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
        throw error;
      }
      return {
        value: option.value,
        legality: 'unknown',
        illegalReason: null,
        resolution: 'exact' as const,
      };
    }

    let classification: DecisionSequenceSatisfiability | null = null;
    if (probed.kind === 'pending') {
      try {
        classification = classifyProbeMoveSatisfiability(
          {
            ...partialMove,
            params: {
                ...partialMove.params,
                [request.decisionKey]: option.value,
              },
            },
          );
      } catch (error: unknown) {
        if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
          throw error;
        }
        classification = 'unknown';
      }
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
) => DiscoveryEffectExecutionResult;

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

  const baseBindings: Record<string, unknown> = {
    ...buildMoveRuntimeBindings(partialMove),
  };
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
  const actionParamRequest = resolveActionParamPendingChoice(action, evalCtx, partialMove);
  if (actionParamRequest !== null) {
    const request = !shouldEvaluateOptionLegality
      ? actionParamRequest
      : {
      ...actionParamRequest,
      options: mapPendingChoiceOptions(partialMove, actionParamRequest, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
    };
    return finalizeRequest(request);
  }

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
        return finalizeRequest({ kind: 'illegal', complete: false, reason: toChoiceIllegalReason(stageDecision.outcome) });
      }
      if (stageStatus.atomicity === 'partial' && stageStatus.costValidation === 'failed') {
        continue;
      }
      const stageResult = executeDiscoveryEffects(stage.effects, stageEvalCtx, partialMove, options);
      stageState = stageResult.state;
      stageBindings = stageResult.bindings;
      if (!shouldEvaluateOptionLegality || stageResult.request.kind !== 'pending') {
        if (stageResult.request.kind !== 'complete') {
          return finalizeRequest(stageResult.request);
        }
      } else {
        return finalizeRequest({
          ...stageResult.request,
          options: mapPendingChoiceOptions(partialMove, stageResult.request, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
        });
      }
    }
    const eventEvalCtx: ReadContext = {
      ...pipelineEvalCtx,
      state: stageState,
      bindings: stageBindings,
    };
    const request = executeDiscoveryEffects(eventEffects, eventEvalCtx, partialMove).request;
    if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
      return finalizeRequest(request);
    }

    return finalizeRequest({
      ...request,
      options: mapPendingChoiceOptions(partialMove, request, options, evaluateProbeLegality, options?._diagnosticsAccumulator),
    });
  }

  const request = executeDiscoveryEffects(
    [...action.effects, ...eventEffects],
    evalCtx,
    partialMove,
    options,
  ).request;
  if (!shouldEvaluateOptionLegality || request.kind !== 'pending') {
    return finalizeRequest(request);
  }

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
  shouldEvaluateOptionLegality: boolean,
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

  const saContext = prepareLegalChoicesContext(def, state, sa, runtime);
  const saResult = legalChoicesWithPreparedContextStrict(saContext, sa, shouldEvaluateOptionLegality, options);
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
  const context = prepareLegalChoicesContext(def, state, partialMove, runtime);
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
