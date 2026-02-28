import type { Diagnostic } from './diagnostics.js';
import {
  buildChoiceOptionsRuntimeShapeDiagnosticDetails,
  getChoiceOptionsRuntimeShapeViolation,
  type ChoiceOptionsEffectName,
} from './choice-options-runtime-shape-contract.js';
import type { OptionsQuery } from './types.js';
import { renderChoiceOptionsRuntimeShapeDiagnostic } from './choice-options-runtime-shape-diagnostic-rendering.js';

export interface BuildChoiceOptionsRuntimeShapeDiagnosticArgs {
  readonly code: string;
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
