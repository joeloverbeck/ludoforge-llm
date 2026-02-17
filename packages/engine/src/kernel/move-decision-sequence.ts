import { legalChoicesDiscover } from './legal-choices.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type {
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  RuntimeWarning,
} from './types.js';

export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
}

export interface ResolveMoveDecisionSequenceResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly illegal?: ChoiceIllegalRequest;
  readonly warnings: readonly RuntimeWarning[];
}

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  const nonIllegalOptionValues = request.options
    .filter((option) => option.legality !== 'illegal')
    .map((option) => option.value);
  const optionValues = nonIllegalOptionValues.length > 0
    ? nonIllegalOptionValues
    : request.options.map((option) => option.value);
  if (request.type === 'chooseOne') {
    const selected = optionValues[0];
    return selected === undefined ? undefined : (selected as MoveParamScalar);
  }

  if (request.type === 'chooseN') {
    const min = request.min ?? 0;
    if (optionValues.length < min) {
      return undefined;
    }
    return optionValues.slice(0, min) as MoveParamScalar[];
  }

  return undefined;
};

export const resolveMoveDecisionSequence = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: ResolveMoveDecisionSequenceOptions,
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
    const request = legalChoicesDiscover(def, state, move, {
      onDeferredPredicatesEvaluated: (count) => {
        deferredPredicatesEvaluated += count;
      },
    });
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

    const selected = choose(request);
    if (selected === undefined) {
      return { complete: false, move, nextDecision: request, warnings };
    }

    move = {
      ...move,
      params: {
        ...move.params,
        [request.decisionId]: selected,
      },
    };
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
  options?: Omit<ResolveMoveDecisionSequenceOptions, 'choose'>,
): boolean => {
  return resolveMoveDecisionSequence(def, state, baseMove, options).complete;
};
