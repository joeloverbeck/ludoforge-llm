import {
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import { completeMoveDecisionSequence } from './move-decision-completion.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
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

export type TemplateCompletionResult =
  | { readonly kind: 'completed'; readonly move: Move; readonly rng: Rng }
  | { readonly kind: 'unsatisfiable' }
  | { readonly kind: 'stochasticUnresolved'; readonly move: Move; readonly rng: Rng };

export interface TemplateMoveCompletionOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
}

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
 * - `unsatisfiable`: empty options domain, min > selectable, or budget exceeded; move is unplayable
 * - `stochasticUnresolved`: decisions behind a `rollRandom` gate; move has all pre-stochastic decisions filled
 */
export const completeTemplateMove = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  options?: TemplateMoveCompletionOptions,
): TemplateCompletionResult => {
  const resolved = resolveMoveEnumerationBudgets(options?.budgets);
  const maxDecisions = resolved.maxCompletionDecisions;
  let cursor = rng;
  let iterations = 0;
  let exceeded = false;

  const chooseAtRandom = (request: ChoicePendingRequest): MoveParamValue | undefined => {
    const options = request.type === 'chooseN'
      ? selectUniqueChoiceOptionValuesByLegalityPrecedence(request)
      : selectChoiceOptionValuesByLegalityPrecedence(request);
    const optionCount = options.length;
    if (request.type === 'chooseOne') {
      if (optionCount === 0) {
        return undefined;
      }
      const selection = selectFromChooseOne(options, cursor);
      cursor = selection.rng;
      return selection.selected;
    }

    const min = request.min ?? 0;
    if (optionCount === 0) {
      return min === 0 ? [] : undefined;
    }

    const declaredMax = request.max ?? optionCount;
    const max = Math.min(declaredMax, optionCount);
    if (optionCount < min || max < min) {
      return undefined;
    }

    const selection = selectFromChooseN(options, min, max, cursor);
    cursor = selection.rng;
    return selection.selected;
  };

  const choose = (request: ChoicePendingRequest): MoveParamValue | undefined => {
    if (++iterations > maxDecisions) {
      exceeded = true;
      return undefined;
    }
    const selected = options?.choose?.(request);
    return selected ?? chooseAtRandom(request);
  };

  const chooseStochastic = (
    request: ChoiceStochasticPendingRequest,
  ): Readonly<Record<string, MoveParamScalar>> | undefined => {
    if (++iterations > maxDecisions) {
      exceeded = true;
      return undefined;
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

  if (exceeded) {
    return { kind: 'unsatisfiable' };
  }
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
