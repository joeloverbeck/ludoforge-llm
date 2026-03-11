import type { EffectKind, EffectKindMap, EffectAST } from './types.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';

import { applySetVar, applyAddVar, applySetActivePlayer } from './effects-var.js';
import { applyTransferVar } from './effects-resource.js';
import {
  applyMoveToken,
  applyMoveAll,
  applyMoveTokenAdjacent,
  applyDraw,
  applyShuffle,
  applyCreateToken,
  applyDestroyToken,
  applySetTokenProp,
} from './effects-token.js';
import { applyReveal, applyConceal } from './effects-reveal.js';
import { applyBindValue } from './effects-binding.js';
import {
  applyChooseOne,
  applyChooseN,
  applyRollRandom,
  applySetMarker,
  applyShiftMarker,
  applySetGlobalMarker,
  applyFlipGlobalMarker,
  applyShiftGlobalMarker,
} from './effects-choice.js';
import {
  applyGrantFreeOperation,
  applyGotoPhaseExact,
  applyAdvancePhase,
  applyPushInterruptPhase,
  applyPopInterruptPhase,
} from './effects-turn-flow.js';
import { applyIf, applyForEach, applyReduce, applyRemoveByPriority, applyLet } from './effects-control.js';
import { applyEvaluateSubset } from './effects-subset.js';

type ApplyEffectsWithBudget = (
  effects: readonly EffectAST[],
  ctx: EffectContext,
  budget: EffectBudgetState,
) => EffectResult;

type EffectHandler<K extends EffectKind> = (
  effect: EffectKindMap[K],
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffects: ApplyEffectsWithBudget,
) => EffectResult;

type EffectRegistry = { readonly [K in EffectKind]: EffectHandler<K> };

const simple = <K extends EffectKind>(
  fn: (effect: EffectKindMap[K], ctx: EffectContext) => EffectResult,
): EffectHandler<K> =>
  (effect, ctx, _budget, _apply) => fn(effect, ctx);

export const registry: EffectRegistry = {
  setVar: simple(applySetVar),
  addVar: simple(applyAddVar),
  setActivePlayer: simple(applySetActivePlayer),
  transferVar: simple(applyTransferVar),
  moveToken: simple(applyMoveToken),
  moveAll: simple(applyMoveAll),
  moveTokenAdjacent: simple(applyMoveTokenAdjacent),
  draw: simple(applyDraw),
  shuffle: simple(applyShuffle),
  createToken: simple(applyCreateToken),
  destroyToken: simple(applyDestroyToken),
  setTokenProp: simple(applySetTokenProp),
  reveal: simple(applyReveal),
  conceal: simple(applyConceal),
  bindValue: simple(applyBindValue),
  chooseOne: simple(applyChooseOne),
  chooseN: simple(applyChooseN),
  setMarker: simple(applySetMarker),
  shiftMarker: simple(applyShiftMarker),
  setGlobalMarker: simple(applySetGlobalMarker),
  flipGlobalMarker: simple(applyFlipGlobalMarker),
  shiftGlobalMarker: simple(applyShiftGlobalMarker),
  grantFreeOperation: simple(applyGrantFreeOperation),
  gotoPhaseExact: simple(applyGotoPhaseExact),
  advancePhase: simple(applyAdvancePhase),
  pushInterruptPhase: simple(applyPushInterruptPhase),
  popInterruptPhase: simple(applyPopInterruptPhase),
  rollRandom: applyRollRandom,
  if: applyIf,
  forEach: applyForEach,
  reduce: applyReduce,
  removeByPriority: applyRemoveByPriority,
  let: applyLet,
  evaluateSubset: applyEvaluateSubset,
};

export function effectKindOf(effect: EffectAST): EffectKind {
  const keys = Object.keys(effect);
  return keys[0] as EffectKind;
}
