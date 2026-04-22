import { legalChoicesDiscover } from '../legal-choices.js';
import type { ChooseNTemplate } from '../choose-n-session.js';
import {
  analyzeDecisionSequence,
  type DecisionSequenceAnalysisResult,
  type DecisionSequenceChoiceDiscoverer,
} from '../decision-sequence-analysis.js';
import { createMoveDecisionSequenceChoiceDiscoverer } from '../move-decision-discoverer.js';
import {
  orderMoveParamValuesByAscendingComplexity,
  pickDeterministicChoiceValue,
} from '../choice-option-policy.js';
import type { GameDefRuntime } from '../gamedef-runtime.js';
import { classifyMissingBindingProbeError, type MissingBindingPolicyContext } from '../missing-binding-policy.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from '../move-enumeration-budgets.js';
import type { PerfProfiler } from '../perf-profiler.js';
import { probeWith, resolveProbeResult, type ProbeResult } from '../probe-result.js';
import type {
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  ChoiceRequest,
  ChoiceStochasticPendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  RuntimeWarning,
} from '../types.js';
import type { SuspendedEffectFrameSnapshot } from './types.js';

export interface ResolveDecisionContinuationOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoveryCache?: DecisionContinuationCache;
  readonly onChooseNTemplateCreated?: (template: ChooseNTemplate) => void;
}

export type DecisionContinuationCache = Map<Move, ChoiceRequest>;

export interface DecisionContinuationAnalysisOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoverer?: DecisionSequenceChoiceDiscoverer;
  readonly validateSatisfiedMove?: (move: Move) => boolean;
  readonly profiler?: PerfProfiler;
}

export interface DecisionContinuationResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly nextDecisionSet?: readonly ChoicePendingRequest[];
  readonly stochasticDecision?: ChoiceStochasticPendingRequest;
  readonly illegal?: ChoiceIllegalRequest;
  readonly warnings: readonly RuntimeWarning[];
  readonly nextChooseNTemplate?: ChooseNTemplate;
  readonly suspendedFrame?: SuspendedEffectFrameSnapshot;
}

export type DecisionContinuationAnalysisResult = DecisionSequenceAnalysisResult;

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue | undefined =>
  pickDeterministicChoiceValue(request);

const choiceValueKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const resolveForcedPendingSelection = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  if (request.type !== 'chooseN') {
    return undefined;
  }

  const selectedKeys = new Set(request.selected.map((value) => choiceValueKey(value)));
  const seenRemainingKeys = new Set<string>();
  const remainingSelectable = request.options
    .filter((option) => option.legality !== 'illegal')
    .map((option) => option.value)
    .filter((value): value is MoveParamScalar => !Array.isArray(value))
    .filter((value) => {
      const key = choiceValueKey(value);
      if (selectedKeys.has(key) || seenRemainingKeys.has(key)) {
        return false;
      }
      seenRemainingKeys.add(key);
      return true;
    });
  const min = request.min ?? 0;
  const max = request.max ?? (request.selected.length + remainingSelectable.length);

  if (min !== max) {
    return undefined;
  }

  const requiredRemaining = Math.max(0, min - request.selected.length);
  return remainingSelectable.length === requiredRemaining
    ? [...request.selected, ...remainingSelectable]
    : undefined;
};

const probeDecisionContinuationAdmissionClassification = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): ProbeResult<DecisionContinuationAnalysisResult['classification']> =>
  probeWith(
    () => classifyDecisionContinuationSatisfiability(def, state, baseMove, options, runtime).classification,
    (error) => classifyMissingBindingProbeError(error, context),
  );

const probeDecisionContinuationAdmissionResult = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): ProbeResult<DecisionContinuationAnalysisResult> =>
  probeWith(
    () => classifyDecisionContinuationSatisfiability(def, state, baseMove, options, runtime),
    (error) => classifyMissingBindingProbeError(error, context),
  );

export const resolveDecisionContinuation = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: ResolveDecisionContinuationOptions,
  runtime?: GameDefRuntime,
): DecisionContinuationResult => {
  const choose = options?.choose ?? defaultChoose;
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const warnings: RuntimeWarning[] = [];
  const emitWarning = (warning: RuntimeWarning): void => {
    warnings.push(warning);
    options?.onWarning?.(warning);
  };
  const maxSteps = budgets.maxDecisionProbeSteps;
  const maxDeferredPredicates = budgets.maxDeferredPredicates;
  let deferredPredicatesEvaluated = 0;
  let move = baseMove;
  let nextChooseNTemplate: ChooseNTemplate | undefined;

  for (let step = 0; step < maxSteps; step += 1) {
    const cached = options?.discoveryCache?.get(move);
    const request = cached ?? legalChoicesDiscover(def, state, move, {
      onDeferredPredicatesEvaluated: (count) => {
        deferredPredicatesEvaluated += count;
      },
      onChooseNTemplateCreated: (template) => {
        nextChooseNTemplate = template;
        options?.onChooseNTemplateCreated?.(template);
      },
    }, runtime);
    if (deferredPredicatesEvaluated > maxDeferredPredicates) {
      emitWarning({
        code: 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxDeferredPredicates budget; sequence truncated deterministically.',
        context: {
          actionId: String(baseMove.actionId),
          maxDeferredPredicates,
          deferredPredicatesEvaluated,
        },
      });
      return { complete: false, move, warnings };
    }
    if (request.kind === 'complete') {
      return { complete: true, move, warnings };
    }
    if (request.kind === 'illegal') {
      return { complete: false, move, illegal: request, warnings };
    }
    if (request.kind === 'pendingStochastic') {
      return {
        complete: false,
        move,
        nextDecisionSet: request.alternatives,
        stochasticDecision: request,
        warnings,
      };
    }

    const selected = choose(request) ?? resolveForcedPendingSelection(request);
    if (selected === undefined) {
      return {
        complete: false,
        move,
        nextDecision: request,
        warnings,
        ...(request.suspendedFrame === undefined ? {} : { suspendedFrame: request.suspendedFrame }),
        ...(request.type === 'chooseN' && nextChooseNTemplate !== undefined
          ? { nextChooseNTemplate }
          : {}),
      };
    }

    if (request.decisionPath === 'compound.specialActivity') {
      const compound = move.compound;
      if (compound === undefined) {
        throw new Error('resolveDecisionContinuation: decisionPath is compound.specialActivity but move has no compound payload');
      }
      move = {
        ...move,
        compound: {
          ...compound,
          specialActivity: {
            ...compound.specialActivity,
            params: {
              ...compound.specialActivity.params,
              [request.decisionKey]: selected,
            },
          },
        },
      };
    } else {
      move = {
        ...move,
        params: {
          ...move.params,
          [request.decisionKey]: selected,
        },
      };
    }
  }

  emitWarning({
    code: 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED',
    message: 'Move decision probing exceeded maxDecisionProbeSteps budget; sequence truncated deterministically.',
    context: {
      actionId: String(baseMove.actionId),
      maxDecisionProbeSteps: maxSteps,
    },
  });
  return { complete: false, move, warnings };
};

export const isDecisionContinuationSatisfiable = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): boolean => {
  const classification = classifyDecisionContinuationSatisfiability(def, state, baseMove, options, runtime).classification;
  return classification === 'satisfiable' || classification === 'explicitStochastic';
};

export const classifyDecisionContinuationAdmissionForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): DecisionContinuationAnalysisResult['classification'] => {
  const result = probeDecisionContinuationAdmissionClassification(
    def,
    state,
    baseMove,
    context,
    options,
    runtime,
  );
  return resolveProbeResult(result, {
    onLegal: (value) => value,
    onIllegal: () => 'unknown',
    onInconclusive: () => 'unknown',
  });
};

export const classifyDecisionContinuationForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): DecisionContinuationAnalysisResult => {
  const result = probeDecisionContinuationAdmissionResult(
    def,
    state,
    baseMove,
    context,
    options,
    runtime,
  );
  return resolveProbeResult(result, {
    onLegal: (value) => value,
    onIllegal: (): DecisionContinuationAnalysisResult => ({ classification: 'unknown', warnings: [] }),
    onInconclusive: (): DecisionContinuationAnalysisResult => ({ classification: 'unknown', warnings: [] }),
  });
};

export const isDecisionContinuationAdmittedForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): boolean => {
  const result = classifyDecisionContinuationForLegalMove(
    def,
    state,
    baseMove,
    context,
    options,
    runtime,
  );
  return result.classification === 'satisfiable' || result.classification === 'explicitStochastic';
};

export const classifyDecisionContinuationSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: DecisionContinuationAnalysisOptions,
  runtime?: GameDefRuntime,
): DecisionContinuationAnalysisResult => {
  const discoverChoices = options?.discoverer ?? createMoveDecisionSequenceChoiceDiscoverer(def, state, runtime);
  return analyzeDecisionSequence(
    baseMove,
    discoverChoices,
    {
      orderSelections: (_request, selectableValues) => orderMoveParamValuesByAscendingComplexity(state, selectableValues),
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
      ...(options?.validateSatisfiedMove === undefined ? {} : { validateSatisfiedMove: options.validateSatisfiedMove }),
      ...(options?.profiler === undefined ? {} : { profiler: options.profiler }),
    },
  );
};
