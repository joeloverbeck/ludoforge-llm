import type { Diagnostic } from './diagnostics.js';
import { inferQueryRuntimeShapes, isMoveParamEncodableQueryRuntimeShape, type QueryRuntimeShape } from './query-shape-inference.js';
import type { OptionsQuery } from './types.js';

export type ChoiceOptionsEffectName = 'chooseOne' | 'chooseN';
export type ChoiceOptionsRuntimeShapeDiagnosticCode =
  | 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
  | 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID';

export interface ChoiceOptionsRuntimeShapeViolation {
  readonly runtimeShapes: readonly QueryRuntimeShape[];
  readonly invalidShapes: readonly QueryRuntimeShape[];
}

export function getChoiceOptionsRuntimeShapeViolation(
  query: OptionsQuery,
): ChoiceOptionsRuntimeShapeViolation | null {
  const runtimeShapes = inferQueryRuntimeShapes(query).slice().sort();
  const invalidShapes = runtimeShapes.filter((shape) => !isMoveParamEncodableQueryRuntimeShape(shape));
  if (invalidShapes.length === 0) {
    return null;
  }

  return {
    runtimeShapes,
    invalidShapes,
  };
}

export function createChoiceOptionsRuntimeShapeDiagnostic(
  query: OptionsQuery,
  path: string,
  effectName: ChoiceOptionsEffectName,
  code: ChoiceOptionsRuntimeShapeDiagnosticCode,
): Diagnostic | null {
  const violation = getChoiceOptionsRuntimeShapeViolation(query);
  if (violation === null) {
    return null;
  }

  return {
    code,
    path,
    severity: 'error',
    message: `${effectName} options query must produce move-param-encodable values; runtime shape(s) [${violation.runtimeShapes.join(', ')}] are not fully encodable.`,
    suggestion:
      'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.',
    alternatives: [...violation.invalidShapes],
  };
}
