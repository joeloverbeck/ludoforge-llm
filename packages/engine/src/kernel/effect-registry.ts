import type { EffectKind, EffectKindMap, EffectAST } from './types.js';
import type { EffectCursor, EffectEnv, EffectResult } from './effect-context.js';
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

export const registry: EffectRegistry = {
  setVar: applySetVar,
  addVar: applyAddVar,
  setActivePlayer: applySetActivePlayer,
  transferVar: applyTransferVar,
  moveToken: applyMoveToken,
  moveAll: applyMoveAll,
  moveTokenAdjacent: applyMoveTokenAdjacent,
  draw: applyDraw,
  shuffle: applyShuffle,
  createToken: applyCreateToken,
  destroyToken: applyDestroyToken,
  setTokenProp: applySetTokenProp,
  reveal: applyReveal,
  conceal: applyConceal,
  bindValue: applyBindValue,
  chooseOne: applyChooseOne,
  chooseN: applyChooseN,
  setMarker: applySetMarker,
  shiftMarker: applyShiftMarker,
  setGlobalMarker: applySetGlobalMarker,
  flipGlobalMarker: applyFlipGlobalMarker,
  shiftGlobalMarker: applyShiftGlobalMarker,
  grantFreeOperation: applyGrantFreeOperation,
  gotoPhaseExact: applyGotoPhaseExact,
  advancePhase: applyAdvancePhase,
  pushInterruptPhase: applyPushInterruptPhase,
  popInterruptPhase: applyPopInterruptPhase,
  rollRandom: applyRollRandom,
  if: applyIf,
  forEach: applyForEach,
  reduce: applyReduce,
  removeByPriority: applyRemoveByPriority,
  let: applyLet,
  evaluateSubset: applyEvaluateSubset,
};

export function effectKindOf(effect: EffectAST): EffectKind {
  // Avoid Object.keys() array allocation (~300K calls). for-in returns the first own key.
  for (const key in effect) return key as EffectKind;
  return Object.keys(effect)[0] as EffectKind;
}
