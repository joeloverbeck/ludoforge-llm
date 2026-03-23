import type { EffectKind, EffectKindMap, EffectAST } from './types.js';
import type { EffectContext, EffectCursor, EffectEnv, EffectResult } from './effect-context.js';
import { fromEnvAndCursor, toEffectEnv, toEffectCursor } from './effect-context.js';
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

export type ApplyEffectsWithBudget = (
  effects: readonly EffectAST[],
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
) => EffectResult;

export type EffectHandler<K extends EffectKind> = (
  effect: EffectKindMap[K],
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
  applyBatch: ApplyEffectsWithBudget,
) => EffectResult;

type EffectRegistry = { readonly [K in EffectKind]: EffectHandler<K> };

/**
 * Wrap a simple handler `(effect, ctx) => result` into the env+cursor handler signature.
 * Reconstructs EffectContext from env+cursor for compatibility with handlers that
 * haven't been migrated yet to the split signature.
 */
const simple = <K extends EffectKind>(
  fn: (effect: EffectKindMap[K], ctx: EffectContext) => EffectResult,
): EffectHandler<K> =>
  (effect, env, cursor, _budget, _apply) => fn(effect, fromEnvAndCursor(env, cursor));

/**
 * Wrap a complex handler `(effect, ctx, budget, applyEffects)` into env+cursor signature.
 * Temporary compatibility bridge until complex handlers are migrated to native env+cursor.
 */
type OldApplyEffectsWithBudget = (
  effects: readonly EffectAST[],
  ctx: EffectContext,
  budget: EffectBudgetState,
) => EffectResult;
const compat = <K extends EffectKind>(
  fn: (effect: EffectKindMap[K], ctx: EffectContext, budget: EffectBudgetState, applyBatch: OldApplyEffectsWithBudget) => EffectResult,
): EffectHandler<K> =>
  (effect, env, cursor, budget, applyBatch) => {
    const ctx = fromEnvAndCursor(env, cursor);
    const oldApply: OldApplyEffectsWithBudget = (effects, innerCtx, b) => {
      const innerEnv = toEffectEnv(innerCtx);
      const innerCursor = toEffectCursor(innerCtx);
      return applyBatch(effects, innerEnv, innerCursor, b);
    };
    return fn(effect, ctx, budget, oldApply);
  };

export const registry: EffectRegistry = {
  setVar: applySetVar,
  addVar: applyAddVar,
  setActivePlayer: applySetActivePlayer,
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
  rollRandom: compat(applyRollRandom),
  if: applyIf,
  forEach: applyForEach,
  reduce: applyReduce,
  removeByPriority: applyRemoveByPriority,
  let: applyLet,
  evaluateSubset: compat(applyEvaluateSubset),
};

export function effectKindOf(effect: EffectAST): EffectKind {
  // Avoid Object.keys() array allocation (~300K calls). for-in returns the first own key.
  for (const key in effect) return key as EffectKind;
  return Object.keys(effect)[0] as EffectKind;
}
