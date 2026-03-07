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
  readonly lines: readonly RealizedLine[];
  readonly collapsedCount?: number;
  readonly subSteps?: readonly ContentStep[];
}

export interface ContentModifier {
  readonly condition: string;
  readonly description: string;
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

export interface RuleState {
  readonly available: boolean;
  readonly blockers: readonly BlockerDetail[];
  readonly activeModifierIndices: readonly number[];
  readonly limitUsage?: { readonly used: number; readonly max: number };
}

export interface ActionTooltipPayload {
  readonly ruleCard: RuleCard;
  readonly ruleState: RuleState;
}
