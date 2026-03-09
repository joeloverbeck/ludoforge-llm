import type { GameSpecVerbalization } from './game-spec-doc.js';
import type { VerbalizationDef } from '../kernel/verbalization-types.js';

const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});
const EMPTY_ARRAY: readonly string[] = Object.freeze([]);

/**
 * Compiles a raw GameSpecVerbalization (nullable/optional fields from YAML)
 * into a fully-normalized VerbalizationDef (non-nullable defaults).
 *
 * Pure function — does not mutate input.
 */
export function compileVerbalization(raw: GameSpecVerbalization): VerbalizationDef {
  return {
    labels: raw.labels ?? EMPTY_RECORD,
    stages: raw.stages ?? EMPTY_RECORD,
    macros: raw.macros ?? EMPTY_RECORD,
    sentencePlans: raw.sentencePlans ?? EMPTY_RECORD,
    suppressPatterns: raw.suppressPatterns ?? EMPTY_ARRAY,
    stageDescriptions: raw.stageDescriptions ?? EMPTY_RECORD,
    modifierEffects: raw.modifierEffects ?? EMPTY_RECORD,
    ...(raw.modifierClassification != null ? { modifierClassification: raw.modifierClassification } : {}),
  };
}
