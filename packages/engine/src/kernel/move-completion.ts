import {
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import { completeMoveDecisionSequence } from './move-decision-completion.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { nextInt } from './prng.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  GameDef,
} from './types.js';

export const MAX_CHOICES = 50;

export type TemplateCompletionResult =
  | { readonly kind: 'completed'; readonly move: Move; readonly rng: Rng }
  | { readonly kind: 'unsatisfiable' }
  | { readonly kind: 'stochasticUnresolved'; readonly move: Move; readonly rng: Rng };

const selectFromChooseOne = (
  options: readonly MoveParamValue[],
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const [index, nextRng] = nextInt(rng, 0, options.length - 1);
  return { selected: options[index]!, rng: nextRng };
};

const selectFromChooseN = (
  options: readonly MoveParamValue[],
  min: number,
  max: number,
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const [count, rng1] = nextInt(rng, min, max);

  // Fisher-Yates partial shuffle to pick `count` items
  const pool = [...options];
  const picked: MoveParamScalar[] = [];
  let cursor: Rng = rng1;
  for (let i = 0; i < count; i += 1) {
    const [idx, nextRng] = nextInt(cursor, i, pool.length - 1);
    cursor = nextRng;
    const temp = pool[idx]!;
    pool[idx] = pool[i]!;
    pool[i] = temp;
    picked.push(temp as MoveParamScalar);
  }
  return { selected: picked, rng: cursor };
};

/**
 * Attempt to complete a template move using the legalChoicesEvaluate() loop with random selections.
 *
 * Returns a discriminated result:
 * - `completed`: all decisions filled, move is ready for `applyMove`
 * - `unsatisfiable`: empty options domain or min > selectable; move is truly unplayable
 * - `stochasticUnresolved`: decisions behind a `rollRandom` gate; move has all pre-stochastic decisions filled
 */
export const completeTemplateMove = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
): TemplateCompletionResult => {
  let cursor = rng;
  let iterations = 0;

  const choose = (request: ChoicePendingRequest): MoveParamValue | undefined => {
    if (++iterations > MAX_CHOICES) {
      throw new Error(
        `Choice loop exceeded ${MAX_CHOICES} iterations for action ${String(templateMove.actionId)}`,
      );
    }

    const options = request.type === 'chooseN'
      ? selectUniqueChoiceOptionValuesByLegalityPrecedence(request)
      : selectChoiceOptionValuesByLegalityPrecedence(request);
    const optionCount = options.length;
    const min = request.min ?? 0;
    if (optionCount === 0) {
      return request.type === 'chooseN' && min === 0 ? [] : undefined;
    }

    const declaredMax = request.type === 'chooseN' ? (request.max ?? optionCount) : optionCount;
    const max = Math.min(declaredMax, optionCount);
    if (request.type === 'chooseN' && (optionCount < min || max < min)) {
      return undefined;
    }

    const selection = request.type === 'chooseN'
      ? selectFromChooseN(options, min, max, cursor)
      : selectFromChooseOne(options, cursor);
    cursor = selection.rng;
    return selection.selected;
  };

  const chooseStochastic = (
    request: ChoiceStochasticPendingRequest,
  ): Readonly<Record<string, MoveParamScalar>> | undefined => {
    if (++iterations > MAX_CHOICES) {
      throw new Error(
        `Choice loop exceeded ${MAX_CHOICES} iterations for action ${String(templateMove.actionId)}`,
      );
    }
    if (request.outcomes.length === 0) {
      return undefined;
    }
    const [index, nextRng] = nextInt(cursor, 0, request.outcomes.length - 1);
    cursor = nextRng;
    return request.outcomes[index]?.bindings;
  };

  const result = completeMoveDecisionSequence(def, state, templateMove, {
    choose,
    chooseStochastic,
  }, runtime);

  if (result.complete) {
    return { kind: 'completed', move: result.move, rng: cursor };
  }
  if (result.illegal !== undefined || result.nextDecision !== undefined) {
    return { kind: 'unsatisfiable' };
  }
  if (result.stochasticDecision !== undefined) {
    return { kind: 'stochasticUnresolved', move: result.move, rng: cursor };
  }
  return { kind: 'unsatisfiable' };
};
