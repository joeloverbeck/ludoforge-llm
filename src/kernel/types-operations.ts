import type { ActionId } from './branded.js';
import type { ConditionAST, EffectAST } from './types-ast.js';

export interface ActionTargetingDef {
  readonly select?: 'upToN' | 'allEligible' | 'exactN';
  readonly max?: number;
  readonly filter?: ConditionAST;
  readonly order?: string;
  readonly tieBreak?: string;
}

export interface ActionResolutionStageDef {
  readonly stage?: string;
  readonly effects: readonly EffectAST[];
}

export interface CompoundParamConstraintDef {
  readonly relation: 'disjoint';
  readonly operationParam: string;
  readonly specialActivityParam: string;
}

export interface ActionPipelineDef {
  readonly id: string;
  readonly actionId: ActionId;
  readonly applicability?: ConditionAST;
  readonly accompanyingOps?: 'any' | readonly string[];
  readonly compoundParamConstraints?: readonly CompoundParamConstraintDef[];
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costEffects: readonly EffectAST[];
  readonly targeting: ActionTargetingDef;
  readonly stages: readonly ActionResolutionStageDef[];
  readonly atomicity: 'atomic' | 'partial';
  readonly linkedWindows?: readonly string[];
}

export interface OperationPartialTraceEntry {
  readonly kind: 'operationPartial';
  readonly actionId: ActionId;
  readonly profileId: string;
  readonly step: 'costSpendSkipped';
  readonly reason: 'costValidationFailed';
}

export interface OperationFreeTraceEntry {
  readonly kind: 'operationFree';
  readonly actionId: ActionId;
  readonly step: 'costSpendSkipped';
}
