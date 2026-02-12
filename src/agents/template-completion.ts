import { legalChoices } from '../kernel/legal-choices.js';
import { nextInt } from '../kernel/prng.js';
import type {
  ChoiceRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
} from '../kernel/types.js';

export const MAX_CHOICES = 50;

export const isTemplateMoveForProfile = (def: GameDef, move: Move): boolean =>
  def.operationProfiles?.some((p) => p.actionId === move.actionId) === true
  && Object.keys(move.params).length === 0;

const selectFromChooseOne = (
  choices: ChoiceRequest,
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const options = choices.options!;
  const [index, nextRng] = nextInt(rng, 0, options.length - 1);
  return { selected: options[index]!, rng: nextRng };
};

const selectFromChooseN = (
  choices: ChoiceRequest,
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const options = choices.options!;
  const min = choices.min ?? 0;
  const max = choices.max ?? options.length;
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
 * Attempt to complete a template move using the legalChoices() loop with random selections.
 * Returns null if the template is unplayable (empty options domain).
 */
export const completeTemplateMove = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
): { readonly move: Move; readonly rng: Rng } | null => {
  let current = templateMove;
  let choices = legalChoices(def, state, current);
  let cursor = rng;
  let iterations = 0;

  while (!choices.complete) {
    if (++iterations > MAX_CHOICES) {
      throw new Error(
        `Choice loop exceeded ${MAX_CHOICES} iterations for action ${String(current.actionId)}`,
      );
    }

    if (choices.options !== undefined && choices.options.length === 0) {
      return null;
    }

    const { selected, rng: nextRng } =
      choices.type === 'chooseN'
        ? selectFromChooseN(choices, cursor)
        : selectFromChooseOne(choices, cursor);

    cursor = nextRng;
    current = { ...current, params: { ...current.params, [choices.name!]: selected } };
    choices = legalChoices(def, state, current);
  }

  return { move: current, rng: cursor };
};
