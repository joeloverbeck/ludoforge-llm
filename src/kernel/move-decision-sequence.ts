import { legalChoices } from './legal-choices.js';
import type {
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
} from './types.js';

const DEFAULT_MAX_STEPS = 128;

export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly maxSteps?: number;
}

export interface ResolveMoveDecisionSequenceResult {
  readonly complete: boolean;
  readonly move: Move;
  readonly nextDecision?: ChoicePendingRequest;
  readonly illegal?: ChoiceIllegalRequest;
}

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  const options = request.options ?? [];
  if (request.type === 'chooseOne') {
    const selected = options[0];
    return selected === undefined ? undefined : (selected as MoveParamScalar);
  }

  if (request.type === 'chooseN') {
    const min = request.min ?? 0;
    if (options.length < min) {
      return undefined;
    }
    return options.slice(0, min) as MoveParamScalar[];
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
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  let move = baseMove;

  for (let step = 0; step < maxSteps; step += 1) {
    const request = legalChoices(def, state, move);
    if (request.kind === 'complete') {
      return { complete: true, move };
    }
    if (request.kind === 'illegal') {
      return { complete: false, move, illegal: request };
    }

    const name = request.name;

    const selected = choose(request);
    if (selected === undefined) {
      return { complete: false, move, nextDecision: request };
    }

    move = {
      ...move,
      params: {
        ...move.params,
        [name]: selected,
      },
    };
  }

  throw new Error(`resolveMoveDecisionSequence: exceeded maxSteps=${String(maxSteps)}`);
};

export const isMoveDecisionSequenceSatisfiable = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
): boolean => {
  try {
    return resolveMoveDecisionSequence(def, state, baseMove).complete;
  } catch {
    return false;
  }
};
