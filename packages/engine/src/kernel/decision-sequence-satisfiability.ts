import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { perfCount, type PerfProfiler } from './perf-profiler.js';
import {
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import type {
  ChoicePendingRequest,
  ChoiceRequest,
  Move,
  MoveParamScalar,
  MoveParamValue,
  RuntimeWarning,
} from './types.js';

export type DecisionSequenceSatisfiability = 'satisfiable' | 'unsatisfiable' | 'unknown';

export interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability;
  readonly warnings: readonly RuntimeWarning[];
  readonly canonicalViableHeadSelection?: MoveParamValue;
}

export interface DecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly orderSelections?: (request: ChoicePendingRequest, selectableValues: readonly MoveParamValue[]) => readonly MoveParamValue[];
  readonly emitCanonicalViableHeadSelection?: boolean;
  readonly profiler?: PerfProfiler;
}

export type DecisionSequenceChoiceDiscoverer = (
  move: Move,
  options?: {
    readonly onDeferredPredicatesEvaluated?: (count: number) => void;
  },
) => ChoiceRequest;

const collectSelectableOptionValues = (request: ChoicePendingRequest): readonly MoveParamValue[] => {
  if (request.type === 'chooseOne') {
    return selectChoiceOptionValuesByLegalityPrecedence(request);
  }
  return selectUniqueChoiceOptionValuesByLegalityPrecedence(request);
};

const enumerateChooseNSelections = (
  request: ChoicePendingRequest,
  selectableValues: readonly MoveParamValue[],
  visit: (selection: MoveParamValue) => boolean,
): boolean => {
  if (request.type !== 'chooseN') {
    throw new Error('enumerateChooseNSelections requires a chooseN request');
  }
  const min = request.min ?? 0;
  const max = Math.min(request.max ?? selectableValues.length, selectableValues.length);
  if (min > max) {
    return true;
  }

  const current: MoveParamScalar[] = [];

  const enumerate = (start: number, remaining: number): boolean => {
    if (remaining === 0) {
      return visit([...current]);
    }

    const upper = selectableValues.length - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(selectableValues[index] as MoveParamScalar);
      if (!enumerate(index + 1, remaining - 1)) {
        return false;
      }
      current.pop();
    }
    return true;
  };

  for (let size = min; size <= max; size += 1) {
    if (size === 0) {
      if (!visit([])) {
        return false;
      }
      continue;
    }
    if (!enumerate(0, size)) {
      return false;
    }
  }

  return true;
};

const forEachDecisionSelection = (
  request: ChoicePendingRequest,
  visit: (selection: MoveParamValue) => boolean,
  options?: DecisionSequenceSatisfiabilityOptions,
): boolean => {
  const selectableValues = collectSelectableOptionValues(request);
  const orderedValues = options?.orderSelections?.(request, selectableValues) ?? selectableValues;
  if (request.type === 'chooseOne') {
    for (const selection of orderedValues) {
      if (!visit(selection)) {
        return false;
      }
    }
    return true;
  }

  return enumerateChooseNSelections(request, orderedValues, visit);
};

export const classifyDecisionSequenceSatisfiability = (
  baseMove: Move,
  discoverChoices: DecisionSequenceChoiceDiscoverer,
  options?: DecisionSequenceSatisfiabilityOptions,
): DecisionSequenceSatisfiabilityResult => {
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const profiler = options?.profiler;
  const warnings: RuntimeWarning[] = [];
  const emitWarning = (warning: RuntimeWarning): void => {
    warnings.push(warning);
    options?.onWarning?.(warning);
  };

  let decisionProbeSteps = 0;
  let deferredPredicatesEvaluated = 0;
  let paramExpansions = 0;

  const classifyFromRequest = (
    move: Move,
    request: ChoiceRequest,
  ): DecisionSequenceSatisfiability => {
    if (request.kind === 'complete') {
      return 'satisfiable';
    }

    if (request.kind === 'illegal') {
      return 'unsatisfiable';
    }
    if (request.kind === 'pendingStochastic') {
      return 'unknown';
    }

    let branchOutcome: DecisionSequenceSatisfiability = 'unsatisfiable';
    const exhausted = forEachDecisionSelection(request, (selection) => {
      paramExpansions += 1;
      if (paramExpansions > budgets.maxParamExpansions) {
        emitWarning({
          code: 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED',
          message: 'Move decision probing exceeded maxParamExpansions budget; satisfiability classified as unknown.',
          context: {
            actionId: String(baseMove.actionId),
            maxParamExpansions: budgets.maxParamExpansions,
            paramExpansions,
          },
        });
        return false;
      }
      const outcome = classifyFromMove({
        ...move,
        params: {
          ...move.params,
          [request.decisionKey]: selection,
        },
      });
      if (outcome === 'satisfiable') {
        branchOutcome = 'satisfiable';
        return false;
      }
      if (outcome === 'unknown') {
        branchOutcome = 'unknown';
        return false;
      }
      return true;
    }, options);

    if (branchOutcome !== 'unsatisfiable') {
      return branchOutcome;
    }
    if (!exhausted) {
      return 'unknown';
    }

    return 'unsatisfiable';
  };

  const classifyFromMove = (move: Move): DecisionSequenceSatisfiability => {
    if (decisionProbeSteps >= budgets.maxDecisionProbeSteps) {
      emitWarning({
        code: 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxDecisionProbeSteps budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxDecisionProbeSteps: budgets.maxDecisionProbeSteps,
        },
      });
      return 'unknown';
    }

    decisionProbeSteps += 1;
    perfCount(profiler, 'decisionSequenceSatisfiability:probeStep');

    const request = discoverChoices(move, {
      onDeferredPredicatesEvaluated: (count) => {
        deferredPredicatesEvaluated += count;
      },
    });

    if (deferredPredicatesEvaluated > budgets.maxDeferredPredicates) {
      emitWarning({
        code: 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxDeferredPredicates budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxDeferredPredicates: budgets.maxDeferredPredicates,
          deferredPredicatesEvaluated,
        },
      });
      return 'unknown';
    }

    return classifyFromRequest(move, request);
  };

  if (options?.emitCanonicalViableHeadSelection !== true) {
    return { classification: classifyFromMove(baseMove), warnings };
  }

  if (decisionProbeSteps >= budgets.maxDecisionProbeSteps) {
    emitWarning({
      code: 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED',
      message: 'Move decision probing exceeded maxDecisionProbeSteps budget; satisfiability classified as unknown.',
      context: {
        actionId: String(baseMove.actionId),
        maxDecisionProbeSteps: budgets.maxDecisionProbeSteps,
      },
    });
    return { classification: 'unknown', warnings };
  }

  decisionProbeSteps += 1;
  perfCount(profiler, 'decisionSequenceSatisfiability:probeStep');
  const baseRequest = discoverChoices(baseMove, {
    onDeferredPredicatesEvaluated: (count) => {
      deferredPredicatesEvaluated += count;
    },
  });

  if (deferredPredicatesEvaluated > budgets.maxDeferredPredicates) {
    emitWarning({
      code: 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED',
      message: 'Move decision probing exceeded maxDeferredPredicates budget; satisfiability classified as unknown.',
      context: {
        actionId: String(baseMove.actionId),
        maxDeferredPredicates: budgets.maxDeferredPredicates,
        deferredPredicatesEvaluated,
      },
    });
    return { classification: 'unknown', warnings };
  }

  if (baseRequest.kind !== 'pending' || baseRequest.type !== 'chooseN') {
    return {
      classification: classifyFromRequest(baseMove, baseRequest),
      warnings,
    };
  }

  let canonicalViableHeadSelection: MoveParamValue | undefined;
  let headGuidanceIncomplete = false;
  const exhausted = forEachDecisionSelection(baseRequest, (selection) => {
    paramExpansions += 1;
    if (paramExpansions > budgets.maxParamExpansions) {
      emitWarning({
        code: 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxParamExpansions budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxParamExpansions: budgets.maxParamExpansions,
          paramExpansions,
        },
      });
      headGuidanceIncomplete = true;
      return false;
    }
    const outcome = classifyFromMove({
      ...baseMove,
      params: {
        ...baseMove.params,
        [baseRequest.decisionKey]: selection,
      },
    });
    if (outcome === 'satisfiable') {
      canonicalViableHeadSelection = selection;
      return false;
    }
    if (outcome === 'unknown') {
      headGuidanceIncomplete = true;
      return false;
    }
    return true;
  }, options);

  if (canonicalViableHeadSelection !== undefined) {
    return {
      classification: 'satisfiable',
      warnings,
      canonicalViableHeadSelection,
    };
  }

  if (headGuidanceIncomplete || !exhausted) {
    return {
      classification: 'unknown',
      warnings,
    };
  }

  return {
    classification: 'unsatisfiable',
    warnings,
  };
};
