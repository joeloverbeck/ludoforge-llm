import { pickDeterministicChoiceValue } from './choice-option-policy.js';
import { resolveMoveDecisionSequence, type ResolveMoveDecisionSequenceOptions } from './move-decision-sequence.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
} from './types.js';

export interface CompleteMoveDecisionSequenceOptions extends ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly chooseStochastic?: (
    request: ChoiceStochasticPendingRequest,
  ) => Readonly<Record<string, MoveParamScalar>> | undefined;
  readonly evaluateOneDecisionPerPass?: boolean;
}

export const completeMoveDecisionSequence = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: CompleteMoveDecisionSequenceOptions,
  runtime?: GameDefRuntime,
): ReturnType<typeof resolveMoveDecisionSequence> => {
  const choose = options?.choose ?? ((request: ChoicePendingRequest) => pickDeterministicChoiceValue(request));
  let move = baseMove;
  const evaluateOneDecisionPerPass = options?.evaluateOneDecisionPerPass === true;

  for (;;) {
    let advanced = false;
    const result = resolveMoveDecisionSequence(
      def,
      state,
      move,
      {
        choose: evaluateOneDecisionPerPass
          ? (request) => {
            if (advanced) {
              return undefined;
            }
            const selected = choose(request);
            if (selected !== undefined) {
              advanced = true;
            }
            return selected;
          }
          : choose,
        evaluateChoices: true,
        ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
        ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
      },
      runtime,
    );

    if (result.complete || result.illegal !== undefined || result.nextDecision !== undefined) {
      if (!evaluateOneDecisionPerPass || result.nextDecision === undefined || advanced === false) {
        return result;
      }
      move = result.move;
      continue;
    }

    if (result.stochasticDecision === undefined) {
      if (!evaluateOneDecisionPerPass || advanced === false) {
        return result;
      }
      move = result.move;
      continue;
    }

    const selectedBindings = options?.chooseStochastic?.(result.stochasticDecision);
    if (selectedBindings === undefined) {
      return result;
    }

    move = {
      ...result.move,
      params: {
        ...result.move.params,
        ...selectedBindings,
      },
    };
  }
};
