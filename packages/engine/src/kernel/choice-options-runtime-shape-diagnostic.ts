import type { Diagnostic } from './diagnostics.js';
import {
  buildChoiceOptionsRuntimeShapeDiagnosticDetails,
  getChoiceOptionsRuntimeShapeViolation,
  type ChoiceOptionsEffectName,
} from './choice-options-runtime-shape-contract.js';
import type { OptionsQuery } from './types.js';
import { renderChoiceOptionsRuntimeShapeDiagnostic } from './choice-options-runtime-shape-diagnostic-rendering.js';

export const CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID =
  'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID';
export const EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID =
  'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID';

export type ChoiceOptionsRuntimeShapeDiagnosticCode =
  | typeof CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID
  | typeof EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID;

export interface BuildChoiceOptionsRuntimeShapeDiagnosticArgs {
  readonly code: ChoiceOptionsRuntimeShapeDiagnosticCode;
  readonly path: string;
  readonly effectName: ChoiceOptionsEffectName;
  readonly query: OptionsQuery;
}

export function buildChoiceOptionsRuntimeShapeDiagnostic(
  args: BuildChoiceOptionsRuntimeShapeDiagnosticArgs,
): Diagnostic | null {
  const violation = getChoiceOptionsRuntimeShapeViolation(args.query);
  if (violation === null) {
    return null;
  }

  const details = buildChoiceOptionsRuntimeShapeDiagnosticDetails(violation);
  const rendered = renderChoiceOptionsRuntimeShapeDiagnostic(args.effectName, details);
  return {
    code: args.code,
    path: args.path,
    severity: 'error',
    message: rendered.message,
    suggestion: rendered.suggestion,
    alternatives: [...details.invalidShapes],
  };
}
