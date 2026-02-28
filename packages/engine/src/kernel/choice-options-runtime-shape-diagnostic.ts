import type { Diagnostic } from './diagnostics.js';
import {
  buildChoiceOptionsRuntimeShapeDiagnosticDetails,
  getChoiceOptionsRuntimeShapeViolation,
  type ChoiceOptionsEffectName,
} from './choice-options-runtime-shape-contract.js';
import type { OptionsQuery } from './types.js';
import { renderChoiceOptionsRuntimeShapeDiagnostic } from './choice-options-runtime-shape-diagnostic-rendering.js';

export const CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES = Object.freeze({
  compiler: 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
  validator: 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
} as const);

export type ChoiceOptionsRuntimeShapeDiagnosticCode =
  (typeof CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES)[keyof typeof CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES];

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
