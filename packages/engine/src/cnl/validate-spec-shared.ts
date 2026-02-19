import type { Diagnostic } from '../kernel/diagnostics.js';
import { compareSourceSpans, resolveSpanForDiagnosticPath } from './diagnostic-source-map.js';
import type { GameSpecSourceMap } from './source-map.js';

const MAX_ALTERNATIVE_DISTANCE = 3;

export const METADATA_KEYS = ['id', 'players', 'maxTriggerDepth', 'defaultScenarioAssetId', 'namedSets', 'cardAnimation'] as const;
export const PLAYERS_KEYS = ['min', 'max'] as const;
export const CARD_ANIMATION_KEYS = ['cardTokenTypes', 'zoneRoles'] as const;
export const CARD_TOKEN_TYPES_KEYS = ['ids', 'idPrefixes'] as const;
export const CARD_ANIMATION_ZONE_ROLES_KEYS = ['draw', 'hand', 'shared', 'burn', 'discard'] as const;
export const DATA_ASSET_KEYS = ['id', 'kind', 'payload', 'tableContracts'] as const;
export const VARIABLE_KEYS = ['name', 'type', 'init', 'min', 'max'] as const;
export const ZONE_KEYS = ['id', 'zoneKind', 'owner', 'visibility', 'ordering', 'adjacentTo'] as const;
export const ACTION_KEYS = ['id', 'actor', 'executor', 'phase', 'capabilities', 'params', 'pre', 'cost', 'effects', 'limits'] as const;
export const TURN_STRUCTURE_KEYS = ['phases', 'interrupts'] as const;
export const TURN_ORDER_KEYS = ['type', 'order', 'config'] as const;
export const TURN_FLOW_KEYS = ['cardLifecycle', 'eligibility', 'optionMatrix', 'passRewards', 'freeOperationActionIds', 'durationWindows', 'monsoon', 'pivotal'] as const;
export const TURN_FLOW_CARD_LIFECYCLE_KEYS = ['played', 'lookahead', 'leader'] as const;
export const TURN_FLOW_ELIGIBILITY_KEYS = ['factions', 'overrideWindows'] as const;
export const TURN_FLOW_OVERRIDE_WINDOW_KEYS = ['id', 'duration'] as const;
export const TURN_FLOW_OPTION_MATRIX_ROW_KEYS = ['first', 'second'] as const;
export const TURN_FLOW_PASS_REWARD_KEYS = ['factionClass', 'resource', 'amount'] as const;
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
export const ACTION_PIPELINE_ATOMICITY_VALUES: readonly string[] = ['atomic', 'partial'];
export const PHASE_KEYS = ['id', 'onEnter', 'onExit'] as const;
export const TRIGGER_KEYS = ['id', 'event', 'when', 'match', 'effects'] as const;
export const TRIGGER_EVENT_KEYS = ['type', 'phase', 'action', 'zone', 'scope', 'var', 'player'] as const;
export const END_CONDITION_KEYS = ['when', 'result'] as const;
export const TERMINAL_KEYS = ['conditions', 'checkpoints', 'margins', 'ranking', 'scoring'] as const;
export const TURN_FLOW_DURATION_VALUES: readonly string[] = ['turn', 'nextTurn', 'round', 'cycle'];
export const TURN_FLOW_ACTION_CLASS_VALUES: readonly string[] = [
  'pass',
  'event',
  'operation',
  'limitedOperation',
  'operationPlusSpecialActivity',
];
export const TURN_FLOW_FIRST_ACTION_VALUES: readonly string[] = ['event', 'operation', 'operationPlusSpecialActivity'];
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
    const alternatives = getAlternatives(unknownKey, allowedKeys);
    const suggestion =
      alternatives.length > 0
        ? `Did you mean "${alternatives[0]}"?`
        : `Use one of the supported ${objectLabel} keys: ${allowedKeys.join(', ')}.`;

    diagnostics.push({
      code: 'CNL_VALIDATOR_UNKNOWN_KEY',
      path: `${basePath}.${unknownKey}`,
      severity: 'warning',
      message: `Unknown key "${unknownKey}" in ${objectLabel}.`,
      suggestion,
      ...(alternatives.length > 0 ? { alternatives } : {}),
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
  if (typeof raw !== 'string' || raw.trim() === '') {
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
  const alternatives = getAlternatives(value, validValues);
  const suggestion = alternatives.length > 0 ? `Did you mean "${alternatives[0]}"?` : fallbackSuggestion;
  diagnostics.push({
    code,
    path,
    severity: 'error',
    message,
    suggestion,
    ...(alternatives.length > 0 ? { alternatives } : {}),
  });
}

function getAlternatives(value: string, validValues: readonly string[]): readonly string[] {
  if (validValues.length === 0) {
    return [];
  }

  const scored = validValues
    .map((candidate) => ({
      candidate,
      distance: levenshteinDistance(value, candidate),
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.candidate.localeCompare(right.candidate);
    });

  const bestDistance = scored[0]?.distance;
  if (bestDistance === undefined || bestDistance > MAX_ALTERNATIVE_DISTANCE) {
    return [];
  }

  return scored.filter((entry) => entry.distance === bestDistance).map((entry) => entry.candidate);
}

function levenshteinDistance(left: string, right: string): number {
  const cols = right.length + 1;
  let previousRow: number[] = Array.from({ length: cols }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const currentRow: number[] = new Array<number>(cols).fill(0);
    currentRow[0] = row;

    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const insertCost = (currentRow[col - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const deleteCost = (previousRow[col] ?? Number.POSITIVE_INFINITY) + 1;
      const replaceCost = (previousRow[col - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost;
      currentRow[col] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? 0;
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

export function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
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
