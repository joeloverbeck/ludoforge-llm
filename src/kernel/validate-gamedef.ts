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
