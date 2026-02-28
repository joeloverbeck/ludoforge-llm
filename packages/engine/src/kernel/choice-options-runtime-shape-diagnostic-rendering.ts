import type { ChoiceOptionsEffectName, ChoiceOptionsRuntimeShapeDiagnosticDetails } from './choice-options-runtime-shape-contract.js';

export interface ChoiceOptionsRuntimeShapeRenderedDiagnostic {
  readonly message: string;
  readonly suggestion: string;
}

export function renderChoiceOptionsRuntimeShapeDiagnostic(
  effectName: ChoiceOptionsEffectName,
  details: ChoiceOptionsRuntimeShapeDiagnosticDetails,
): ChoiceOptionsRuntimeShapeRenderedDiagnostic {
  return {
    message: `${effectName} options query must produce move-param-encodable values; runtime shape(s) [${details.runtimeShapes.join(', ')}] are not fully encodable.`,
    suggestion: renderChoiceOptionsRuntimeShapeSuggestion(details.reason),
  };
}

function renderChoiceOptionsRuntimeShapeSuggestion(
  reason: ChoiceOptionsRuntimeShapeDiagnosticDetails['reason'],
): string {
  if (reason === 'nonMoveParamEncodableRuntimeShapes') {
    return 'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.';
  }

  const _never: never = reason;
  return _never;
}
