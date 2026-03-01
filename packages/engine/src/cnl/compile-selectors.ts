import type { Diagnostic } from '../kernel/diagnostics.js';
import { asPlayerId } from '../kernel/branded.js';
import { getActionSelectorContract, PLAYER_SELECTOR_SUGGESTION, ZONE_OWNER_QUALIFIER_SUGGESTION } from '../contracts/index.js';
import type { ActionExecutorSel, PlayerSel } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

const ACTION_EXECUTOR_SELECTOR_SUGGESTION = getActionSelectorContract('executor').invalidSelectorSuggestion;

export interface SelectorCompileResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

type ZoneOwnerQualifier = 'none' | 'all' | 'actor' | 'active' | 'allOther' | 'left' | 'right' | `${number}` | `$${string}`;

export function normalizePlayerSelector(
  value: unknown,
  path: string,
  seatIds?: readonly string[],
): SelectorCompileResult<PlayerSel> {
  if (typeof value === 'string') {
    return normalizePlayerSelectorFromString(value, path, seatIds);
  }

  if (!isRecord(value)) {
    return invalidPlayerSelector(path, value);
  }

  if ('id' in value) {
    const idValue = value.id;
    if (typeof idValue === 'number' && Number.isInteger(idValue) && idValue >= 0) {
      if (seatIds !== undefined && seatIds.length > 0) {
        return invalidNumericObjectPlayerSelectorWithSeatIds(path, idValue, seatIds);
      }
      return { value: { id: asPlayerId(idValue) }, diagnostics: [] };
    }
    return invalidPlayerSelector(path, value);
  }

  if ('chosen' in value) {
    const chosenValue = value.chosen;
    if (typeof chosenValue === 'string' && isBindingToken(chosenValue)) {
      return { value: { chosen: chosenValue }, diagnostics: [] };
    }
    return invalidPlayerSelector(path, value);
  }

  if ('relative' in value) {
    const relative = value.relative;
    if (relative === 'left' || relative === 'right') {
      return { value: { relative }, diagnostics: [] };
    }
    return invalidPlayerSelector(path, value);
  }

  return invalidPlayerSelector(path, value);
}

export function normalizeActionExecutorSelector(
  value: unknown,
  path: string,
  seatIds?: readonly string[],
): SelectorCompileResult<ActionExecutorSel> {
  const normalized = normalizePlayerSelector(value, path, seatIds);
  if (normalized.value === null) {
    return {
      value: null,
      diagnostics: normalized.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        suggestion: ACTION_EXECUTOR_SELECTOR_SUGGESTION,
      })),
    };
  }

  if (
    getActionSelectorContract('executor').cardinality === 'single' &&
    (normalized.value === 'all' || normalized.value === 'allOther')
  ) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PLAYER_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Action executor selector must resolve to exactly one player.',
          suggestion: ACTION_EXECUTOR_SELECTOR_SUGGESTION,
        },
      ],
    };
  }

  return { value: normalized.value as ActionExecutorSel, diagnostics: [] };
}

export function normalizeZoneOwnerQualifier(
  value: string,
  path: string,
  seatIds?: readonly string[],
): SelectorCompileResult<ZoneOwnerQualifier> {
  if (value === 'none' || value === 'all') {
    return { value, diagnostics: [] };
  }

  const normalizedPlayer = normalizePlayerSelector(value, path, seatIds);
  if (normalizedPlayer.value === null) {
    return {
      value: null,
      diagnostics: normalizedPlayer.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
      })),
    };
  }

  const selector = normalizedPlayer.value;
  if (selector === 'actor' || selector === 'active' || selector === 'allOther') {
    return { value: selector, diagnostics: [] };
  }
  if (typeof selector === 'string') {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: `Zone owner qualifier "${value}" is not supported.`,
          suggestion: ZONE_OWNER_QUALIFIER_SUGGESTION,
        },
      ],
    };
  }
  if ('relative' in selector) {
    return { value: selector.relative, diagnostics: [] };
  }
  if ('id' in selector) {
    return { value: `${Number(selector.id)}`, diagnostics: [] };
  }
  if ('chosen' in selector) {
    return { value: selector.chosen as `$${string}`, diagnostics: [] };
  }

  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
        path,
        severity: 'error',
        message: `Zone owner qualifier "${value}" is not supported.`,
        suggestion: ZONE_OWNER_QUALIFIER_SUGGESTION,
      },
    ],
  };
}

function normalizePlayerSelectorFromString(
  value: string,
  path: string,
  seatIds?: readonly string[],
): SelectorCompileResult<PlayerSel> {
  if (value === 'active') {
    return { value: 'active', diagnostics: [] };
  }
  if (value === 'activePlayer') {
    return nonCanonicalPlayerSelector(path, value, 'active');
  }
  if (value === 'actor' || value === 'all' || value === 'allOther') {
    return { value, diagnostics: [] };
  }
  if (value === 'left' || value === 'right') {
    return { value: { relative: value }, diagnostics: [] };
  }
  if (isUnsignedIntegerString(value)) {
    if (seatIds !== undefined && seatIds.length > 0) {
      return invalidNumericPlayerSelectorWithSeatIds(path, value, seatIds);
    }
    return { value: { id: asPlayerId(Number(value)) }, diagnostics: [] };
  }
  if (isBindingToken(value)) {
    return { value: { chosen: value }, diagnostics: [] };
  }

  if (seatIds !== undefined) {
    const lowerValue = value.toLowerCase();
    const seatIndex = seatIds.findIndex((s) => s.toLowerCase() === lowerValue);
    if (seatIndex >= 0) {
      return { value: { id: asPlayerId(seatIndex) }, diagnostics: [] };
    }
  }

  return invalidPlayerSelector(path, value);
}

function nonCanonicalPlayerSelector(path: string, actual: string, canonical: string): SelectorCompileResult<PlayerSel> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PLAYER_SELECTOR_INVALID,
        path,
        severity: 'error',
        message: `Non-canonical player selector: "${actual}".`,
        suggestion: `Use "${canonical}".`,
      },
    ],
  };
}

function invalidPlayerSelector(path: string, actual: unknown): SelectorCompileResult<PlayerSel> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PLAYER_SELECTOR_INVALID,
        path,
        severity: 'error',
        message: `Invalid player selector: ${formatValue(actual)}.`,
        suggestion: PLAYER_SELECTOR_SUGGESTION,
      },
    ],
  };
}

function invalidNumericPlayerSelectorWithSeatIds(
  path: string,
  actual: string,
  seatIds: readonly string[],
): SelectorCompileResult<PlayerSel> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PLAYER_SELECTOR_INVALID,
        path,
        severity: 'error',
        message: `Numeric player selector "${actual}" is not allowed when canonical seat ids are declared.`,
        suggestion: `Use one of the canonical seat ids: ${seatIds.join(', ')}.`,
      },
    ],
  };
}

function invalidNumericObjectPlayerSelectorWithSeatIds(
  path: string,
  actual: number,
  seatIds: readonly string[],
): SelectorCompileResult<PlayerSel> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PLAYER_SELECTOR_INVALID,
        path,
        severity: 'error',
        message: `Numeric player selector "{ id: ${actual} }" is not allowed when canonical seat ids are declared.`,
        suggestion: `Use one of the canonical seat ids: ${seatIds.join(', ')}.`,
      },
    ],
  };
}

function isUnsignedIntegerString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function isBindingToken(value: string): value is `$${string}` {
  return /^\$.+/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
