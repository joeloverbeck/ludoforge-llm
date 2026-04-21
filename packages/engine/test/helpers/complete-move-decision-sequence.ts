import {
  type ChoicePendingRequest,
  type ChoiceStochasticPendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../src/kernel/index.js';
import { resolveDecisionContinuation } from '../../src/kernel/microturn/continuation.js';

export interface CompleteMoveDecisionSequenceOptions {
  readonly budgets?: {
    readonly maxDecisionProbeSteps?: number;
  };
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly chooseStochastic?: (
    request: ChoiceStochasticPendingRequest,
  ) => Readonly<Record<string, string | number | boolean>> | undefined;
}

export interface CompleteMoveDecisionSequenceResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly nextDecisionSet?: readonly ChoicePendingRequest[];
  readonly stochasticDecision?: ChoiceStochasticPendingRequest;
  readonly illegal?: ReturnType<typeof resolveDecisionContinuation>['illegal'];
}

const applyBindings = (
  move: Move,
  bindings: Readonly<Record<string, string | number | boolean>>,
): Move => ({
  ...move,
  params: {
    ...move.params,
    ...bindings,
  },
});

export const completeMoveDecisionSequence = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: CompleteMoveDecisionSequenceOptions,
): CompleteMoveDecisionSequenceResult => {
  const maxSteps = options?.budgets?.maxDecisionProbeSteps ?? 256;
  let move = baseMove;

  for (let step = 0; step < maxSteps; step += 1) {
    const result = resolveDecisionContinuation(
      def,
      state,
      move,
      {
        ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
        ...(options?.choose === undefined ? {} : { choose: options.choose }),
      },
    );
    if (result.complete || result.illegal !== undefined) {
      return result;
    }
    if (result.stochasticDecision === undefined) {
      return result;
    }

    const selectedBindings = options?.chooseStochastic?.(result.stochasticDecision);
    if (selectedBindings === undefined) {
      return result;
    }
    move = applyBindings(result.move, selectedBindings);
  }

  return resolveDecisionContinuation(
    def,
    state,
    move,
    {
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
      ...(options?.choose === undefined ? {} : { choose: options.choose }),
    },
  );
};
