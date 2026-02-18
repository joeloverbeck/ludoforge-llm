import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
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

const optionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const collectSelectableOptionValues = (request: ChoicePendingRequest): readonly MoveParamValue[] => {
  const nonIllegalOptionValues = request.options
    .filter((option) => option.legality !== 'illegal')
    .map((option) => option.value);

  if (nonIllegalOptionValues.length === 0) {
    return [];
  }

  if (request.type === 'chooseOne') {
    return nonIllegalOptionValues;
  }

  const uniqueValues: MoveParamValue[] = [];
  const seen = new Set<string>();
  for (const value of nonIllegalOptionValues) {
    const key = optionKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueValues.push(value);
  }
  return uniqueValues;
};

const collectChooseNSelections = (
  request: ChoicePendingRequest,
  selectableValues: readonly MoveParamValue[],
): readonly MoveParamValue[] => {
  const min = request.min ?? 0;
  const max = Math.min(request.max ?? selectableValues.length, selectableValues.length);
  if (min > max) {
    return [];
  }

  const selections: MoveParamValue[] = [];
  const current: MoveParamScalar[] = [];

  const enumerate = (start: number, remaining: number): void => {
    if (remaining === 0) {
      selections.push([...current]);
      return;
    }

    const upper = selectableValues.length - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(selectableValues[index] as MoveParamScalar);
      enumerate(index + 1, remaining - 1);
      current.pop();
    }
  };

  for (let size = min; size <= max; size += 1) {
    if (size === 0) {
      selections.push([]);
      continue;
    }
    enumerate(0, size);
  }

  return selections;
};

const collectDecisionSelections = (request: ChoicePendingRequest): readonly MoveParamValue[] => {
  const selectableValues = collectSelectableOptionValues(request);
  if (request.type === 'chooseOne') {
    return selectableValues;
  }

  return collectChooseNSelections(request, selectableValues);
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

  const stack: Move[] = [baseMove];
  let decisionProbeSteps = 0;
  let deferredPredicatesEvaluated = 0;
  let paramExpansions = 0;

  while (stack.length > 0) {
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

    const move = stack.pop()!;
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
      return { classification: 'unknown', warnings };
    }

    if (request.kind === 'complete') {
      return { classification: 'satisfiable', warnings };
    }

    if (request.kind === 'illegal') {
      continue;
    }

    const selections = collectDecisionSelections(request);
    for (let index = selections.length - 1; index >= 0; index -= 1) {
      const selection = selections[index]!;
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
        return { classification: 'unknown', warnings };
      }

      stack.push({
        ...move,
        params: {
          ...move.params,
          [request.decisionId]: selection,
        },
      });
    }
  }

  return { classification: 'unsatisfiable', warnings };
};
