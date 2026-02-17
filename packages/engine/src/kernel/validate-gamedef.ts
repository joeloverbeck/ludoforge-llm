import type { Diagnostic } from './diagnostics.js';
import type { GameDef } from './types.js';
import { validateGameDef as validateGameDefCore } from './validate-gamedef-core.js';

export { validateInitialPlacementsAgainstStackingConstraints } from './validate-gamedef-core.js';

declare const VALIDATED_GAMEDEF_BRAND: unique symbol;

export type ValidatedGameDef = GameDef & { readonly [VALIDATED_GAMEDEF_BRAND]: true };

const validatedGameDefs = new WeakSet<GameDef>();

const hasErrorDiagnostics = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

const summarizeDiagnostics = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics
    .slice(0, 5)
    .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
    .join(', ');

export const validateGameDef = (def: GameDef): Diagnostic[] => validateGameDefCore(def);

export const isValidatedGameDef = (def: GameDef): def is ValidatedGameDef => validatedGameDefs.has(def);

export interface ValidatedGameDefBoundaryResult {
  readonly gameDef: ValidatedGameDef | null;
  readonly diagnostics: readonly Diagnostic[];
}

export interface GameDefInputValidationErrorDetails {
  readonly source: string;
  readonly receivedType: string;
  readonly diagnostics?: readonly Diagnostic[];
  readonly cause?: unknown;
}

export interface GameDefInputValidationError {
  readonly code: 'GAMEDEF_INPUT_INVALID';
  readonly message: string;
  readonly details: GameDefInputValidationErrorDetails;
}

const formatReceivedType = (input: unknown): string => {
  if (input === null) {
    return 'null';
  }

  if (Array.isArray(input)) {
    return 'array';
  }

  return typeof input;
};

const createInputValidationError = (
  source: string,
  message: string,
  receivedType: string,
  extras?: Omit<GameDefInputValidationErrorDetails, 'source' | 'receivedType'>,
): GameDefInputValidationError => {
  return {
    code: 'GAMEDEF_INPUT_INVALID',
    message,
    details: {
      source,
      receivedType,
      ...extras,
    },
  };
};

export const isGameDefInputValidationError = (value: unknown): value is GameDefInputValidationError => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const details = Reflect.get(value, 'details');
  if (typeof details !== 'object' || details === null) {
    return false;
  }

  return Reflect.get(value, 'code') === 'GAMEDEF_INPUT_INVALID'
    && typeof Reflect.get(value, 'message') === 'string'
    && typeof Reflect.get(details, 'source') === 'string'
    && typeof Reflect.get(details, 'receivedType') === 'string';
};

export const assertValidatedGameDefInput = (input: unknown, source: string): ValidatedGameDef => {
  const receivedType = formatReceivedType(input);
  if (receivedType !== 'object') {
    throw createInputValidationError(
      source,
      `Invalid GameDef input from ${source}: expected object payload.`,
      receivedType,
    );
  }

  const candidate = input as GameDef;

  try {
    const validation = validateGameDefBoundary(candidate);
    if (validation.gameDef === null) {
      const errorDiagnostics = validation.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
      throw createInputValidationError(
        source,
        `Invalid GameDef input from ${source}: ${errorDiagnostics.length} validation error(s).`,
        receivedType,
        { diagnostics: errorDiagnostics },
      );
    }

    return validation.gameDef;
  } catch (error) {
    if (isGameDefInputValidationError(error)) {
      throw error;
    }

    throw createInputValidationError(
      source,
      `Invalid GameDef input from ${source}: validation threw unexpectedly.`,
      receivedType,
      { cause: error },
    );
  }
};

export const validateGameDefBoundary = (def: GameDef): ValidatedGameDefBoundaryResult => {
  if (isValidatedGameDef(def)) {
    return {
      gameDef: def,
      diagnostics: [],
    };
  }

  const diagnostics = validateGameDefCore(def);
  if (hasErrorDiagnostics(diagnostics)) {
    return {
      gameDef: null,
      diagnostics,
    };
  }

  validatedGameDefs.add(def);
  return {
    gameDef: def as ValidatedGameDef,
    diagnostics,
  };
};

export const assertValidatedGameDef = (def: GameDef): ValidatedGameDef => {
  if (isValidatedGameDef(def)) {
    return def;
  }

  const validated = validateGameDefBoundary(def);
  if (validated.gameDef === null) {
    const summary = summarizeDiagnostics(validated.diagnostics);
    throw new Error(
      summary.length === 0
        ? 'Invalid GameDef: validation failed with at least one error diagnostic.'
        : `Invalid GameDef: validation failed (${summary}).`,
    );
  }

  return validated.gameDef;
};
