/**
 * Compiled verbalization data stored in GameDef.
 * Uses Readonly<Record<...>> (not ReadonlyMap) for JSON serializability.
 */

export interface VerbalizationLabelEntry {
  readonly singular: string;
  readonly plural: string;
}

export interface VerbalizationMacroEntry {
  readonly class: string;
  readonly summary: string;
  readonly slots?: Readonly<Record<string, string>>;
}

export interface VerbalizationStageDescription {
  readonly label: string;
  readonly description?: string;
}

export interface VerbalizationModifierEffect {
  readonly condition: string;
  readonly effect: string;
}

export interface VerbalizationModifierClassification {
  readonly choiceFlowPatterns: readonly string[];
  readonly leaderPatterns: readonly string[];
}

export interface VerbalizationDef {
  readonly labels: Readonly<Record<string, string | VerbalizationLabelEntry>>;
  readonly stages: Readonly<Record<string, string>>;
  readonly actionSummaries?: Readonly<Record<string, string>>;
  readonly macros: Readonly<Record<string, VerbalizationMacroEntry>>;
  readonly sentencePlans: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
  readonly suppressPatterns: readonly string[];
  readonly stageDescriptions: Readonly<Record<string, Readonly<Record<string, VerbalizationStageDescription>>>>;
  readonly modifierEffects: Readonly<Record<string, readonly VerbalizationModifierEffect[]>>;
  readonly modifierClassification?: VerbalizationModifierClassification;
}
