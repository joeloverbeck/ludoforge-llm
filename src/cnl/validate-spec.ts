import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';

export interface ValidateGameSpecOptions {
  readonly sourceMap?: GameSpecSourceMap;
}

export function validateGameSpec(
  doc: GameSpecDoc,
  _options?: ValidateGameSpecOptions,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  validateRequiredSections(doc, diagnostics);
  validateMetadata(doc, diagnostics);
  validateVariables(doc, diagnostics);
  validateZones(doc, diagnostics);
  validateActions(doc, diagnostics);
  validateTurnStructure(doc, diagnostics);

  return diagnostics;
}

function validateRequiredSections(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  const requiredSections: ReadonlyArray<keyof Pick<
    GameSpecDoc,
    'metadata' | 'zones' | 'turnStructure' | 'actions' | 'endConditions'
  >> = ['metadata', 'zones', 'turnStructure', 'actions', 'endConditions'];

  for (const section of requiredSections) {
    if (doc[section] === null) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_REQUIRED_SECTION_MISSING',
        path: `doc.${section}`,
        severity: 'error',
        message: `Missing required section "${section}".`,
        suggestion: `Add the "${section}" section to the Game Spec.`,
      });
    }
  }
}

function validateMetadata(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  const metadata = doc.metadata;
  if (!isRecord(metadata)) {
    return;
  }

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

function validateVariables(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
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

function validateZones(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.zones === null) {
    return;
  }

  for (const [index, zone] of doc.zones.entries()) {
    const basePath = `doc.zones.${index}`;
    if (!isRecord(zone)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ZONE_SHAPE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Zone definition must be an object.',
        suggestion: 'Provide zone fields id, owner, visibility, and ordering.',
      });
      continue;
    }

    validateEnumField(zone, 'owner', ['none', 'player'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'visibility', ['public', 'owner', 'hidden'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'ordering', ['stack', 'queue', 'set'], basePath, diagnostics, 'zone');
  }
}

function validateActions(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.actions === null) {
    return;
  }

  for (const [index, action] of doc.actions.entries()) {
    const basePath = `doc.actions.${index}`;
    if (!isRecord(action)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_SHAPE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Action definition must be an object.',
        suggestion: 'Provide action fields id, actor, phase, and effects.',
      });
      continue;
    }

    if (typeof action.id !== 'string' || action.id.trim() === '') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
        path: `${basePath}.id`,
        severity: 'error',
        message: 'Action field "id" must be a non-empty string.',
        suggestion: 'Set action.id to a non-empty string.',
      });
    }

    if (!('actor' in action) || action.actor === undefined || action.actor === null) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
        path: `${basePath}.actor`,
        severity: 'error',
        message: 'Action field "actor" is required.',
        suggestion: 'Set action.actor to a valid actor selector.',
      });
    }

    if (typeof action.phase !== 'string' || action.phase.trim() === '') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
        path: `${basePath}.phase`,
        severity: 'error',
        message: 'Action field "phase" must be a non-empty string.',
        suggestion: 'Set action.phase to a phase id.',
      });
    }

    if (!Array.isArray(action.effects)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_EFFECTS_SHAPE_INVALID',
        path: `${basePath}.effects`,
        severity: 'error',
        message: 'Action field "effects" must be an array.',
        suggestion: 'Set action.effects to an array of effect objects.',
      });
    }
  }
}

function validateTurnStructure(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  const turnStructure = doc.turnStructure;
  if (!isRecord(turnStructure)) {
    return;
  }

  if (!Array.isArray(turnStructure.phases) || turnStructure.phases.length === 0) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_STRUCTURE_PHASES_INVALID',
      path: 'doc.turnStructure.phases',
      severity: 'error',
      message: 'turnStructure.phases must be a non-empty array.',
      suggestion: 'Define at least one phase in turnStructure.phases.',
    });
  }

  const activePlayerOrder = turnStructure.activePlayerOrder;
  if (activePlayerOrder !== 'roundRobin' && activePlayerOrder !== 'fixed') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_STRUCTURE_ORDER_INVALID',
      path: 'doc.turnStructure.activePlayerOrder',
      severity: 'error',
      message: 'turnStructure.activePlayerOrder must be "roundRobin" or "fixed".',
      suggestion: 'Set activePlayerOrder to "roundRobin" or "fixed".',
    });
  }
}

function validateEnumField(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
