import { inferQueryRuntimeShapes, isMoveParamEncodableQueryRuntimeShape, type QueryRuntimeShape } from './query-shape-inference.js';
import type { OptionsQuery } from './types.js';

export type ChoiceOptionsEffectName = 'chooseOne' | 'chooseN';

export interface ChoiceOptionsRuntimeShapeViolation {
  readonly runtimeShapes: readonly QueryRuntimeShape[];
  readonly invalidShapes: readonly QueryRuntimeShape[];
}

export interface ChoiceOptionsRuntimeShapeDiagnosticDetails {
  readonly message: string;
  readonly suggestion: string;
  readonly alternatives: readonly QueryRuntimeShape[];
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

export function buildChoiceOptionsRuntimeShapeDiagnosticDetails(
  effectName: ChoiceOptionsEffectName,
  violation: ChoiceOptionsRuntimeShapeViolation,
): ChoiceOptionsRuntimeShapeDiagnosticDetails {
  return {
    message: `${effectName} options query must produce move-param-encodable values; runtime shape(s) [${violation.runtimeShapes.join(', ')}] are not fully encodable.`,
    suggestion:
      'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.',
    alternatives: [...violation.invalidShapes],
  };
}
