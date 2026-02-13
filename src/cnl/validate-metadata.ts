import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  METADATA_KEYS,
  PLAYERS_KEYS,
  VARIABLE_KEYS,
  isFiniteNumber,
  isRecord,
  validateIdentifierField,
  validateUnknownKeys,
} from './validate-spec-shared.js';

export function validateMetadata(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  const metadata = doc.metadata;
  if (!isRecord(metadata)) {
    return;
  }

  validateUnknownKeys(metadata, METADATA_KEYS, 'doc.metadata', diagnostics, 'metadata');
  validateIdentifierField(metadata, 'id', 'doc.metadata.id', diagnostics, 'metadata id');

  const players = metadata.players;
  if (!isRecord(players)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_METADATA_PLAYERS_INVALID',
      path: 'doc.metadata.players',
      severity: 'error',
      message: 'metadata.players must be an object with numeric min and max.',
      suggestion: 'Set metadata.players to { min: number, max: number }.',
    });
    return;
  }

  validateUnknownKeys(players, PLAYERS_KEYS, 'doc.metadata.players', diagnostics, 'metadata.players');

  const min = players.min;
  const max = players.max;
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_METADATA_PLAYERS_RANGE_INVALID',
      path: 'doc.metadata.players',
      severity: 'error',
      message: 'metadata.players.min and metadata.players.max must be finite numbers.',
      suggestion: 'Set numeric player bounds such as { min: 2, max: 4 }.',
    });
    return;
  }

  if (min < 1) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_METADATA_PLAYERS_MIN_TOO_LOW',
      path: 'doc.metadata.players.min',
      severity: 'error',
      message: 'metadata.players.min must be >= 1.',
      suggestion: 'Set players.min to 1 or greater.',
    });
  }

  if (min > max) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_METADATA_PLAYERS_MIN_GT_MAX',
      path: 'doc.metadata.players',
      severity: 'error',
      message: 'metadata.players.min must be <= metadata.players.max.',
      suggestion: 'Adjust player bounds so min is not greater than max.',
    });
  }
}

export function validateVariables(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  validateVariableSection(doc.globalVars, 'globalVars', diagnostics);
  validateVariableSection(doc.perPlayerVars, 'perPlayerVars', diagnostics);
}

function validateVariableSection(
  section: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'],
  sectionName: 'globalVars' | 'perPlayerVars',
  diagnostics: Diagnostic[],
): void {
  if (section === null) {
    return;
  }

  for (const [index, variable] of section.entries()) {
    const basePath = `doc.${sectionName}.${index}`;
    if (!isRecord(variable)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_VARIABLE_SHAPE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Variable definition must be an object.',
        suggestion: 'Provide variable fields name, type, init, min, and max.',
      });
      continue;
    }

    validateUnknownKeys(variable, VARIABLE_KEYS, basePath, diagnostics, 'variable');

    const requiredStringFields: readonly ('name' | 'type')[] = ['name', 'type'];
    for (const field of requiredStringFields) {
      const value = variable[field];
      if (typeof value !== 'string' || value.trim() === '') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_VARIABLE_REQUIRED_FIELD_MISSING',
          path: `${basePath}.${field}`,
          severity: 'error',
          message: `Variable field "${field}" must be a non-empty string.`,
          suggestion: `Set ${field} to a non-empty string.`,
        });
      }
    }

    const min = variable.min;
    const max = variable.max;
    const init = variable.init;
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || !isFiniteNumber(init)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_VARIABLE_RANGE_FIELDS_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Variable fields init, min, and max must be finite numbers.',
        suggestion: 'Set numeric init/min/max values for the variable.',
      });
      continue;
    }

    if (min > max) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_VARIABLE_MIN_GT_MAX',
        path: `${basePath}.min`,
        severity: 'error',
        message: 'Variable min must be <= max.',
        suggestion: 'Adjust min/max to satisfy min <= max.',
      });
    }
    if (init < min || init > max) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_VARIABLE_INIT_OUT_OF_RANGE',
        path: `${basePath}.init`,
        severity: 'error',
        message: 'Variable init must satisfy min <= init <= max.',
        suggestion: 'Adjust init to be within variable bounds.',
      });
    }
  }
}
