import { inferQueryRuntimeShapes, isMoveParamEncodableQueryRuntimeShape, type QueryRuntimeShape } from './query-shape-inference.js';
import type { OptionsQuery } from './types.js';

export type ChoiceOptionsEffectName = 'chooseOne' | 'chooseN';

export interface ChoiceOptionsRuntimeShapeViolation {
  readonly runtimeShapes: readonly QueryRuntimeShape[];
  readonly invalidShapes: readonly QueryRuntimeShape[];
}

export interface ChoiceOptionsRuntimeShapeDiagnosticDetails {
  readonly reason: 'nonMoveParamEncodableRuntimeShapes';
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

export function buildChoiceOptionsRuntimeShapeDiagnosticDetails(
  violation: ChoiceOptionsRuntimeShapeViolation,
): ChoiceOptionsRuntimeShapeDiagnosticDetails {
  return {
    reason: 'nonMoveParamEncodableRuntimeShapes',
    runtimeShapes: [...violation.runtimeShapes],
    invalidShapes: [...violation.invalidShapes],
  };
}
