import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  CARD_ANIMATION_KEYS,
  CARD_ANIMATION_ZONE_ROLES_KEYS,
  CARD_TOKEN_TYPES_KEYS,
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

  const defaultScenarioAssetId = metadata.defaultScenarioAssetId;
  if (
    defaultScenarioAssetId !== undefined &&
    (typeof defaultScenarioAssetId !== 'string' ||
      defaultScenarioAssetId.trim() === '' ||
      defaultScenarioAssetId !== defaultScenarioAssetId.trim())
  ) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_METADATA_DEFAULT_SCENARIO_INVALID',
      path: 'doc.metadata.defaultScenarioAssetId',
      severity: 'error',
      message: 'metadata.defaultScenarioAssetId must be a non-empty trimmed string when provided.',
      suggestion: 'Set defaultScenarioAssetId to an existing scenario data-asset id, for example "scenario-foundation".',
    });
  }

  const namedSets = metadata.namedSets;
  if (namedSets !== undefined) {
    if (!isRecord(namedSets)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_METADATA_NAMED_SETS_INVALID',
        path: 'doc.metadata.namedSets',
        severity: 'error',
        message: 'metadata.namedSets must be an object that maps set ids to string arrays.',
        suggestion: 'Set namedSets to an object like { coalitionA: [factionA, factionB] }.',
      });
      return;
    }

    for (const [setName, rawValues] of Object.entries(namedSets)) {
      const setPath = `doc.metadata.namedSets.${setName}`;
      if (setName.trim() === '') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_METADATA_NAMED_SET_ID_INVALID',
          path: setPath,
          severity: 'error',
          message: 'Named set ids must be non-empty strings.',
          suggestion: 'Use non-empty set ids such as "COIN" or "Insurgent".',
        });
      }
      if (!Array.isArray(rawValues) || rawValues.some((value) => typeof value !== 'string' || value.trim() === '')) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_METADATA_NAMED_SET_VALUES_INVALID',
          path: setPath,
          severity: 'error',
          message: `metadata.namedSets.${setName} must be an array of non-empty strings.`,
          suggestion: `Set metadata.namedSets.${setName} to [valueA, valueB, ...].`,
        });
        continue;
      }

      const normalized = rawValues.map((value) => value.trim().normalize('NFC'));
      const duplicates = new Set<string>();
      const seen = new Set<string>();
      for (const value of normalized) {
        if (seen.has(value)) {
          duplicates.add(value);
        } else {
          seen.add(value);
        }
      }
      if (duplicates.size > 0) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_METADATA_NAMED_SET_DUPLICATE_VALUE',
          path: setPath,
          severity: 'error',
          message: `metadata.namedSets.${setName} contains duplicate values after normalization: ${[...duplicates].join(', ')}.`,
          suggestion: 'Remove duplicate entries from the named set.',
        });
      }
    }
  }

  const cardAnimation = metadata.cardAnimation;
  if (cardAnimation !== undefined) {
    if (!isRecord(cardAnimation)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_CARD_ANIMATION_INVALID',
        path: 'doc.metadata.cardAnimation',
        severity: 'error',
        message: 'metadata.cardAnimation must be an object.',
        suggestion: 'Set cardAnimation to an object with cardTokenTypes and zoneRoles.',
      });
      return;
    }

    validateUnknownKeys(cardAnimation, CARD_ANIMATION_KEYS, 'doc.metadata.cardAnimation', diagnostics, 'cardAnimation');

    const cardTokenTypes = cardAnimation.cardTokenTypes;
    if (!isRecord(cardTokenTypes)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_CARD_ANIMATION_TOKEN_SELECTORS_INVALID',
        path: 'doc.metadata.cardAnimation.cardTokenTypes',
        severity: 'error',
        message: 'metadata.cardAnimation.cardTokenTypes must be an object.',
        suggestion: 'Set cardTokenTypes to an object with optional ids and/or idPrefixes arrays.',
      });
    } else {
      validateUnknownKeys(
        cardTokenTypes,
        CARD_TOKEN_TYPES_KEYS,
        'doc.metadata.cardAnimation.cardTokenTypes',
        diagnostics,
        'cardTokenTypes',
      );

      if (cardTokenTypes.ids !== undefined && !isStringArray(cardTokenTypes.ids)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_CARD_ANIMATION_TOKEN_IDS_INVALID',
          path: 'doc.metadata.cardAnimation.cardTokenTypes.ids',
          severity: 'error',
          message: 'metadata.cardAnimation.cardTokenTypes.ids must be an array of non-empty strings.',
          suggestion: 'Set ids to token type ids such as ["card-2S", "card-AS"].',
        });
      }
      if (cardTokenTypes.idPrefixes !== undefined && !isStringArray(cardTokenTypes.idPrefixes)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_CARD_ANIMATION_TOKEN_PREFIXES_INVALID',
          path: 'doc.metadata.cardAnimation.cardTokenTypes.idPrefixes',
          severity: 'error',
          message: 'metadata.cardAnimation.cardTokenTypes.idPrefixes must be an array of non-empty strings.',
          suggestion: 'Set idPrefixes to prefixes such as ["card-"].',
        });
      }
    }

    const zoneRoles = cardAnimation.zoneRoles;
    if (!isRecord(zoneRoles)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_CARD_ANIMATION_ZONE_ROLES_INVALID',
        path: 'doc.metadata.cardAnimation.zoneRoles',
        severity: 'error',
        message: 'metadata.cardAnimation.zoneRoles must be an object.',
        suggestion: 'Provide zone role arrays for draw, hand, shared, burn, and discard.',
      });
    } else {
      validateUnknownKeys(
        zoneRoles,
        CARD_ANIMATION_ZONE_ROLES_KEYS,
        'doc.metadata.cardAnimation.zoneRoles',
        diagnostics,
        'cardAnimation.zoneRoles',
      );

      for (const role of CARD_ANIMATION_ZONE_ROLES_KEYS) {
        if (!isStringArray(zoneRoles[role])) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_CARD_ANIMATION_ZONE_ROLE_LIST_INVALID',
            path: `doc.metadata.cardAnimation.zoneRoles.${role}`,
            severity: 'error',
            message: `metadata.cardAnimation.zoneRoles.${role} must be an array of non-empty strings.`,
            suggestion: `Set zoneRoles.${role} to a zone base/id list such as ["${role}"].`,
          });
        }
      }
    }
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
        suggestion: 'Provide variable fields name/type/init and bounds min/max for int variables.',
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

    const type = variable.type;
    if (type === 'int') {
      const min = variable.min;
      const max = variable.max;
      const init = variable.init;
      if (!isFiniteNumber(min) || !isFiniteNumber(max) || !isFiniteNumber(init)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_VARIABLE_RANGE_FIELDS_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Int variable fields init, min, and max must be finite numbers.',
          suggestion: 'Set numeric init/min/max values for int variables.',
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
      continue;
    }

    if (type === 'boolean') {
      if (typeof variable.init !== 'boolean') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_VARIABLE_BOOLEAN_INIT_INVALID',
          path: `${basePath}.init`,
          severity: 'error',
          message: 'Boolean variable init must be true or false.',
          suggestion: 'Set boolean variable init to true or false.',
        });
      }
      continue;
    }

    diagnostics.push({
      code: 'CNL_VALIDATOR_VARIABLE_TYPE_INVALID',
      path: `${basePath}.type`,
      severity: 'error',
      message: 'Variable type must be either "int" or "boolean".',
      suggestion: 'Set variable.type to "int" or "boolean".',
    });
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
}
