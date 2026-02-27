import { legalChoicesDiscover } from './legal-choices.js';
import {
  classifyDecisionSequenceSatisfiability,
  type DecisionSequenceSatisfiabilityResult,
} from './decision-sequence-satisfiability.js';
import { pickDeterministicChoiceValue } from './choice-option-policy.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type {
  ChoiceIllegalRequest,
  ChoicePendingRequest,
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
  readonly decisionPlayer?: GameState['activePlayer'];
}

export interface ResolveMoveDecisionSequenceResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly illegal?: ChoiceIllegalRequest;
  readonly warnings: readonly RuntimeWarning[];
}

export type MoveDecisionSequenceSatisfiabilityResult = DecisionSequenceSatisfiabilityResult;

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue | undefined =>
  pickDeterministicChoiceValue(request);

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
    const request = legalChoicesDiscover(def, state, move, {
      ...(options?.decisionPlayer === undefined ? {} : { decisionPlayer: options.decisionPlayer }),
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
  runtime?: GameDefRuntime,
): boolean => {
  return classifyMoveDecisionSequenceSatisfiability(def, state, baseMove, options, runtime).classification === 'satisfiable';
};

export const classifyMoveDecisionSequenceSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: Omit<ResolveMoveDecisionSequenceOptions, 'choose'>,
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult => {
  return classifyDecisionSequenceSatisfiability(
    baseMove,
    (move, discoverOptions) =>
      legalChoicesDiscover(def, state, move, {
        ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
          ? {}
          : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
      }, runtime),
    {
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
    },
  );
};
