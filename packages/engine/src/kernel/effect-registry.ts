import type { EffectKind, EffectAST, EffectKindTag, WithKindTag } from './types.js';
import { EFFECT_KIND_TAG } from './types.js';
import type { EffectCursor, EffectEnv, PartialEffectResult } from './effect-context.js';
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
) => PartialEffectResult;

export type EffectHandler<K extends EffectKind> = (
  effect: WithKindTag<K>,
  env: EffectEnv,
  cursor: EffectCursor,
  budget: EffectBudgetState,
  applyBatch: ApplyEffectsWithBudget,
) => PartialEffectResult;

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

/** Reverse lookup: tag number → string kind name. Derived from EFFECT_KIND_TAG. */
export const TAG_TO_KIND: readonly EffectKind[] = Object.entries(EFFECT_KIND_TAG)
  .sort(([, a], [, b]) => a - b)
  .map(([k]) => k as EffectKind);

export function effectKindOf(effect: EffectAST): EffectKind {
  return TAG_TO_KIND[(effect as { readonly _k: EffectKindTag })._k]!;
}
