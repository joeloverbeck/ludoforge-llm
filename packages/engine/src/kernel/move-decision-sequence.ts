import { legalChoicesDiscover } from './legal-choices.js';
import {
  classifyDecisionSequenceSatisfiability,
  type DecisionSequenceChoiceDiscoverer,
  type DecisionSequenceSatisfiabilityResult,
} from './decision-sequence-satisfiability.js';
import { createMoveDecisionSequenceChoiceDiscoverer } from './move-decision-discoverer.js';
import { orderMoveParamValuesByAscendingComplexity, pickDeterministicChoiceValue } from './choice-option-policy.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { classifyMissingBindingProbeError, type MissingBindingPolicyContext } from './missing-binding-policy.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type { PerfProfiler } from './perf-profiler.js';
import { probeWith, resolveProbeResult, type ProbeResult } from './probe-result.js';
import type {
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  ChoiceRequest,
  ChoiceStochasticPendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  RuntimeWarning,
} from './types.js';

export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoveryCache?: DiscoveryCache;
}

export type DiscoveryCache = Map<Move, ChoiceRequest>;

export interface MoveDecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoverer?: DecisionSequenceChoiceDiscoverer;
  readonly emitCompletionCertificate?: boolean;
  readonly validateSatisfiedMove?: (move: Move) => boolean;
  readonly onClassified?: (result: MoveDecisionSequenceSatisfiabilityResult) => void;
  readonly profiler?: PerfProfiler;
}

export interface ResolveMoveDecisionSequenceResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly nextDecisionSet?: readonly ChoicePendingRequest[];
  readonly stochasticDecision?: ChoiceStochasticPendingRequest;
  readonly illegal?: ChoiceIllegalRequest;
  readonly warnings: readonly RuntimeWarning[];
}

export type MoveDecisionSequenceSatisfiabilityResult = DecisionSequenceSatisfiabilityResult;

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue | undefined =>
  pickDeterministicChoiceValue(request);

const probeMoveDecisionSequenceAdmissionClassification = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): ProbeResult<MoveDecisionSequenceSatisfiabilityResult['classification']> =>
  probeWith(
    () => classifyMoveDecisionSequenceSatisfiability(def, state, baseMove, options, runtime).classification,
    (e) => classifyMissingBindingProbeError(e, context),
  );

const probeMoveDecisionSequenceAdmissionResult = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): ProbeResult<MoveDecisionSequenceSatisfiabilityResult> =>
  probeWith(
    () => classifyMoveDecisionSequenceSatisfiability(def, state, baseMove, options, runtime),
    (e) => classifyMissingBindingProbeError(e, context),
  );

export const resolveMoveDecisionSequence = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: ResolveMoveDecisionSequenceOptions,
  runtime?: GameDefRuntime,
): ResolveMoveDecisionSequenceResult => {
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

  for (let step = 0; step < maxSteps; step += 1) {
    const cached = options?.discoveryCache?.get(move);
    const request = cached ?? legalChoicesDiscover(def, state, move, {
      onDeferredPredicatesEvaluated: (count) => {
        deferredPredicatesEvaluated += count;
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

    const selected = choose(request);
    if (selected === undefined) {
      return { complete: false, move, nextDecision: request, warnings };
    }

    if (request.decisionPath === 'compound.specialActivity') {
      const compound = move.compound;
      if (compound === undefined) {
        throw new Error('resolveMoveDecisionSequence: decisionPath is compound.specialActivity but move has no compound payload');
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

export const isMoveDecisionSequenceSatisfiable = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): boolean => {
  const classification = classifyMoveDecisionSequenceSatisfiability(def, state, baseMove, options, runtime).classification;
  return classification === 'satisfiable' || classification === 'explicitStochastic';
};

export const classifyMoveDecisionSequenceAdmissionForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult['classification'] => {
  const result = probeMoveDecisionSequenceAdmissionClassification(
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

export const classifyMoveDecisionSequenceSatisfiabilityForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult => {
  const result = probeMoveDecisionSequenceAdmissionResult(
    def,
    state,
    baseMove,
    context,
    options,
    runtime,
  );
  return resolveProbeResult(result, {
    onLegal: (value) => value,
    onIllegal: (): MoveDecisionSequenceSatisfiabilityResult => ({ classification: 'unknown', warnings: [] }),
    onInconclusive: (): MoveDecisionSequenceSatisfiabilityResult => ({ classification: 'unknown', warnings: [] }),
  });
};

export const isMoveDecisionSequenceAdmittedForLegalMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): boolean => {
  const result = classifyMoveDecisionSequenceSatisfiabilityForLegalMove(
    def,
    state,
    baseMove,
    context,
    options,
    runtime,
  );
  options?.onClassified?.(result);
  return result.classification === 'satisfiable' || result.classification === 'explicitStochastic';
};

export const classifyMoveDecisionSequenceSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: MoveDecisionSequenceSatisfiabilityOptions,
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult => {
  const discoverChoices = options?.discoverer ?? createMoveDecisionSequenceChoiceDiscoverer(def, state, runtime);
  return classifyDecisionSequenceSatisfiability(
    baseMove,
    discoverChoices,
    {
      orderSelections: (_request, selectableValues) => orderMoveParamValuesByAscendingComplexity(state, selectableValues),
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
      ...(options?.validateSatisfiedMove === undefined ? {} : { validateSatisfiedMove: options.validateSatisfiedMove }),
      ...(options?.emitCompletionCertificate === true
        ? {
          emitCompletionCertificate: true,
          certificateFingerprintStateHash: state.stateHash,
        }
        : {}),
      ...(options?.profiler === undefined ? {} : { profiler: options.profiler }),
    },
  );
};
