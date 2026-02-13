import type { ActionId } from './branded.js';
import type { ConditionAST, EffectAST } from './types-ast.js';

export interface OperationProfilePartialExecutionDef {
  readonly mode: 'forbid' | 'allow';
}

export interface OperationLegalityDef {
  readonly when?: ConditionAST;
}

export interface OperationCostDef {
  readonly validate?: ConditionAST;
  readonly spend?: readonly EffectAST[];
}

export interface OperationTargetingDef {
  readonly select?: 'upToN' | 'allEligible' | 'exactN';
  readonly max?: number;
  readonly filter?: ConditionAST;
  readonly order?: string;
  readonly tieBreak?: string;
}

export interface OperationResolutionStageDef {
  readonly stage?: string;
  readonly effects: readonly EffectAST[];
}

export interface OperationProfileDef {
  readonly id: string;
  readonly actionId: ActionId;
  readonly applicability?: ConditionAST;
  readonly legality: OperationLegalityDef;
  readonly cost: OperationCostDef;
  readonly targeting: OperationTargetingDef;
  readonly resolution: readonly OperationResolutionStageDef[];
  readonly partialExecution: OperationProfilePartialExecutionDef;
  readonly linkedSpecialActivityWindows?: readonly string[];
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
