import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  TURN_FLOW_ACTION_CLASS_VALUES,
  buildMissingReferenceSuggestion,
  TURN_FLOW_DURATION_VALUES,
  TURN_FLOW_FIRST_ACTION_VALUES,
  TURN_FLOW_OPTIONAL_KEYS,
  TURN_FLOW_REQUIRED_KEYS,
} from '../contracts/index.js';
import { compareSourceSpans, resolveSpanForDiagnosticPath } from './diagnostic-source-map.js';
import type { GameSpecPhaseTemplateDef } from './game-spec-doc.js';
import { normalizeIdentifier } from './identifier-utils.js';
import type { GameSpecSourceMap } from './source-map.js';

export {
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_DURATION_VALUES,
  TURN_FLOW_FIRST_ACTION_VALUES,
  TURN_FLOW_REQUIRED_KEYS,
};

export const METADATA_KEYS = ['id', 'name', 'description', 'players', 'maxTriggerDepth', 'defaultScenarioAssetId', 'namedSets'] as const;
export const PLAYERS_KEYS = ['min', 'max'] as const;
export const DATA_ASSET_KEYS = ['id', 'kind', 'payload', 'tableContracts'] as const;
export const VARIABLE_KEYS = ['name', 'type', 'init', 'min', 'max', 'material'] as const;
export const ZONE_KEYS = ['id', 'zoneKind', 'isInternal', 'owner', 'visibility', 'ordering', 'adjacentTo', 'behavior'] as const;
export const ACTION_KEYS = ['id', 'actor', 'executor', 'phase', 'capabilities', 'params', 'pre', 'cost', 'effects', 'limits'] as const;
export const TURN_STRUCTURE_KEYS = ['phases', 'interrupts'] as const;
export const TURN_ORDER_KEYS = ['type', 'order', 'config'] as const;
export const TURN_FLOW_KEYS = [...TURN_FLOW_REQUIRED_KEYS, ...TURN_FLOW_OPTIONAL_KEYS] as const;
export const TURN_FLOW_CARD_LIFECYCLE_KEYS = ['played', 'lookahead', 'leader'] as const;
export const TURN_FLOW_ELIGIBILITY_KEYS = ['seats', 'overrideWindows'] as const;
export const TURN_FLOW_OVERRIDE_WINDOW_KEYS = ['id', 'duration'] as const;
export const TURN_FLOW_OPTION_MATRIX_ROW_KEYS = ['first', 'second'] as const;
export const TURN_FLOW_PASS_REWARD_KEYS = ['seat', 'resource', 'amount'] as const;
export const ACTION_PIPELINE_KEYS = [
  'id',
  'actionId',
  'applicability',
  'accompanyingOps',
  'compoundParamConstraints',
  'legality',
  'costValidation',
  'costEffects',
  'targeting',
  'stages',
  'atomicity',
  'linkedWindows',
] as const;
export const ACTION_PIPELINE_STAGE_KEYS = ['stage', 'legality', 'costValidation', 'effects'] as const;
export const ACTION_PIPELINE_ATOMICITY_VALUES: readonly string[] = ['atomic', 'partial'];
export const PHASE_KEYS = ['id', 'onEnter', 'onExit', 'actionDefaults'] as const;
export const FROM_TEMPLATE_PHASE_KEYS = ['fromTemplate', 'args'] as const;
export const TRIGGER_KEYS = ['id', 'event', 'when', 'match', 'effects'] as const;
export const TRIGGER_EVENT_KEYS = ['type', 'phase', 'action', 'zone', 'scope', 'var', 'player'] as const;
export const END_CONDITION_KEYS = ['when', 'result'] as const;
export const TERMINAL_KEYS = ['conditions', 'checkpoints', 'margins', 'ranking', 'scoring'] as const;
export const TURN_ORDER_TYPE_VALUES: readonly string[] = ['roundRobin', 'fixedOrder', 'cardDriven', 'simultaneous'];

export function validateEnumField(
  record: Record<string, unknown>,
  field: string,
  allowedValues: readonly string[],
  basePath: string,
  diagnostics: Diagnostic[],
  label: string,
): void {
  const value = record[field];
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_ENUM_VALUE_INVALID',
      path: `${basePath}.${field}`,
      severity: 'error',
      message: `${label} field "${field}" must be one of: ${allowedValues.join(', ')}.`,
      suggestion: `Set ${field} to one of: ${allowedValues.join(', ')}.`,
    });
  }
}

export function validateUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  basePath: string,
  diagnostics: Diagnostic[],
  objectLabel: string,
): void {
  const unknownKeys = Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .sort((left, right) => left.localeCompare(right));

  for (const unknownKey of unknownKeys) {
    const { suggestion, alternatives } = buildMissingReferenceSuggestion(
      unknownKey,
      allowedKeys,
      `Use one of the supported ${objectLabel} keys: ${allowedKeys.join(', ')}.`,
    );

    diagnostics.push({
      code: 'CNL_VALIDATOR_UNKNOWN_KEY',
      path: `${basePath}.${unknownKey}`,
      severity: 'warning',
      message: `Unknown key "${unknownKey}" in ${objectLabel}.`,
      suggestion,
      ...(alternatives !== undefined ? { alternatives } : {}),
    });
  }
}

export function validateIdentifierField(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
  label: string,
): string | undefined {
  const raw = value[key];
  if (!isNonEmptyString(raw)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_IDENTIFIER_INVALID',
      path,
      severity: 'error',
      message: `${label} must be a non-empty string.`,
      suggestion: `Set ${key} to a non-empty identifier string.`,
    });
    return undefined;
  }

  if (raw.trim() !== raw) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_IDENTIFIER_WHITESPACE',
      path,
      severity: 'error',
      message: `${label} must not contain leading or trailing whitespace.`,
      suggestion: `Trim whitespace from ${key}.`,
    });
  }

  return normalizeIdentifier(raw);
}

export function optionalIdentifierField(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
  label: string,
): string | undefined {
  if (!(key in value) || value[key] === undefined || value[key] === null) {
    return undefined;
  }
  return validateIdentifierField(value, key, path, diagnostics, label);
}

export function pushDuplicateNormalizedIdDiagnostics(
  diagnostics: Diagnostic[],
  values: readonly string[],
  pathPrefix: string,
  label: string,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!seen.has(value)) {
      seen.add(value);
      return;
    }
    diagnostics.push({
      code: 'CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED',
      path: `${pathPrefix}.${index}`,
      severity: 'error',
      message: `Duplicate ${label} "${value}" after NFC normalization.`,
      suggestion: `Use unique ${label} values after normalization.`,
    });
  });
}

export function pushMissingReferenceDiagnostic(
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  value: string,
  validValues: readonly string[],
  fallbackSuggestion: string,
): void {
  const { suggestion, alternatives } = buildMissingReferenceSuggestion(value, validValues, fallbackSuggestion);
  diagnostics.push({
    code,
    path,
    severity: 'error',
    message,
    suggestion,
    ...(alternatives !== undefined ? { alternatives } : {}),
  });
}

export function compareDiagnostics(left: Diagnostic, right: Diagnostic, sourceMap?: GameSpecSourceMap): number {
  const leftSpan = resolveSpanForDiagnosticPath(left.path, sourceMap);
  const rightSpan = resolveSpanForDiagnosticPath(right.path, sourceMap);
  const spanComparison = compareSourceSpans(leftSpan, rightSpan);
  if (spanComparison !== 0) {
    return spanComparison;
  }

  const pathComparison = left.path.localeCompare(right.path);
  if (pathComparison !== 0) {
    return pathComparison;
  }

  return left.code.localeCompare(right.code);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isNonEmptyTrimmedString(value: unknown): value is string {
  return isNonEmptyString(value) && value === value.trim();
}

export function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Resolve a phase ID from a `fromTemplate` entry by substituting args into
 * the template's `phase.id` field.
 *
 * This is the single canonical implementation of the "entire-string match →
 * direct value; else replaceAll" algorithm used for phase-ID resolution.
 * See also `substituteParams` in `expand-phase-templates.ts` for the deep
 * object/array variant.
 */
export function resolvePhaseIdFromTemplate(
  entry: { readonly fromTemplate: string; readonly args: Readonly<Record<string, unknown>> },
  phaseTemplates: readonly GameSpecPhaseTemplateDef[] | null | undefined,
): string | undefined {
  if (phaseTemplates === null || phaseTemplates === undefined) {
    return undefined;
  }

  const template = phaseTemplates.find((t) => t.id === entry.fromTemplate);
  if (template === undefined) {
    return undefined;
  }

  const rawPhaseId = template.phase.id;
  if (typeof rawPhaseId !== 'string') {
    return undefined;
  }

  let resolvedId = rawPhaseId;
  for (const [paramName, argValue] of Object.entries(entry.args)) {
    if (resolvedId === `{${paramName}}`) {
      resolvedId = String(argValue);
      break;
    }
    resolvedId = resolvedId.replaceAll(`{${paramName}}`, String(argValue));
  }

  return normalizeIdentifier(resolvedId);
}
