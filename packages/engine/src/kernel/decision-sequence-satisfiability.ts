import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
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
}

export interface DecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
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
): boolean => {
  const selectableValues = collectSelectableOptionValues(request);
  if (request.type === 'chooseOne') {
    for (const selection of selectableValues) {
      if (!visit(selection)) {
        return false;
      }
    }
    return true;
  }

  return enumerateChooseNSelections(request, selectableValues, visit);
};

export const classifyDecisionSequenceSatisfiability = (
  baseMove: Move,
  discoverChoices: DecisionSequenceChoiceDiscoverer,
  options?: DecisionSequenceSatisfiabilityOptions,
): DecisionSequenceSatisfiabilityResult => {
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const warnings: RuntimeWarning[] = [];
  const emitWarning = (warning: RuntimeWarning): void => {
    warnings.push(warning);
    options?.onWarning?.(warning);
  };

  let decisionProbeSteps = 0;
  let deferredPredicatesEvaluated = 0;
  let paramExpansions = 0;

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

    if (request.kind === 'complete') {
      return 'satisfiable';
    }

    if (request.kind === 'illegal') {
      return 'unsatisfiable';
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
          [request.decisionId]: selection,
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
    });

    if (branchOutcome !== 'unsatisfiable') {
      return branchOutcome;
    }
    if (!exhausted) {
      return 'unknown';
    }

    return 'unsatisfiable';
  };

  return { classification: classifyFromMove(baseMove), warnings };
};
