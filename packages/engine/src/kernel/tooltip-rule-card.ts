/**
 * Types for the static RuleCard (cached per action per GameDef)
 * and dynamic RuleState (recomputed per call).
 */

export interface RealizedLine {
  readonly text: string;
  readonly astPath: string;
}

export interface ContentStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly description?: string;
  readonly lines: readonly RealizedLine[];
  readonly subSteps?: readonly ContentStep[];
}

export interface ContentModifier {
  readonly condition: string;
  readonly description: string;
  /** Original AST for runtime evaluation of active/inactive state */
  readonly conditionAST?: import('./types-ast.js').ConditionAST;
}

export interface RuleCard {
  readonly synopsis: string;
  readonly steps: readonly ContentStep[];
  readonly modifiers: readonly ContentModifier[];
}

export interface BlockerDetail {
  readonly astPath: string;
  readonly description: string;
  readonly currentValue?: string;
  readonly requiredValue?: string;
}

export interface BlockerInfo {
  readonly satisfied: boolean;
  readonly blockers: readonly BlockerDetail[];
}

export interface RuleStateLimitUsage {
  readonly id: string;
  readonly scope: 'turn' | 'phase' | 'game';
  readonly used: number;
  readonly max: number;
}

export interface RuleState {
  readonly available: boolean;
  readonly blockers: readonly BlockerDetail[];
  readonly activeModifierIndices: readonly number[];
  readonly limitUsage?: readonly RuleStateLimitUsage[];
}

export interface ActionTooltipPayload {
  readonly ruleCard: RuleCard;
  readonly ruleState: RuleState;
}
