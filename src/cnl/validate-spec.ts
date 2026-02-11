import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap, SourceSpan } from './source-map.js';

const MAX_ALTERNATIVE_DISTANCE = 3;

const METADATA_KEYS = ['id', 'players', 'maxTriggerDepth'] as const;
const PLAYERS_KEYS = ['min', 'max'] as const;
const DATA_ASSET_KEYS = ['id', 'kind', 'payload'] as const;
const VARIABLE_KEYS = ['name', 'type', 'init', 'min', 'max'] as const;
const ZONE_KEYS = ['id', 'owner', 'visibility', 'ordering', 'adjacentTo'] as const;
const ACTION_KEYS = ['id', 'actor', 'phase', 'params', 'pre', 'cost', 'effects', 'limits'] as const;
const TURN_STRUCTURE_KEYS = ['phases', 'activePlayerOrder'] as const;
const TURN_FLOW_KEYS = ['cardLifecycle', 'eligibility', 'optionMatrix', 'passRewards', 'durationWindows'] as const;
const TURN_FLOW_CARD_LIFECYCLE_KEYS = ['played', 'lookahead', 'leader'] as const;
const TURN_FLOW_ELIGIBILITY_KEYS = ['factions', 'overrideWindows'] as const;
const TURN_FLOW_OVERRIDE_WINDOW_KEYS = ['id', 'duration'] as const;
const TURN_FLOW_OPTION_MATRIX_ROW_KEYS = ['first', 'second'] as const;
const TURN_FLOW_PASS_REWARD_KEYS = ['factionClass', 'resource', 'amount'] as const;
const PHASE_KEYS = ['id', 'onEnter', 'onExit'] as const;
const TRIGGER_KEYS = ['id', 'event', 'when', 'match', 'effects'] as const;
const TRIGGER_EVENT_KEYS = ['type', 'phase', 'action', 'zone'] as const;
const END_CONDITION_KEYS = ['when', 'result'] as const;
const TURN_FLOW_DURATION_VALUES: readonly string[] = ['card', 'nextCard', 'coup', 'campaign'];
const TURN_FLOW_ACTION_CLASS_VALUES: readonly string[] = [
  'pass',
  'event',
  'operation',
  'limitedOperation',
  'operationPlusSpecialActivity',
];
const TURN_FLOW_FIRST_ACTION_VALUES: readonly string[] = ['event', 'operation', 'operationPlusSpecialActivity'];

export interface ValidateGameSpecOptions {
  readonly sourceMap?: GameSpecSourceMap;
}

export function validateGameSpec(
  doc: GameSpecDoc,
  options?: ValidateGameSpecOptions,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const dataAssetContext = validateDataAssets(doc, diagnostics);
  validateRequiredSections(doc, diagnostics);
  if (doc.zones === null && dataAssetContext.hasMapAsset) {
    dropZoneMissingDiagnostic(diagnostics);
  }
  validateMetadata(doc, diagnostics);
  validateVariables(doc, diagnostics);

  const zoneIds = validateZones(doc, diagnostics);
  const actionIds = validateActions(doc, diagnostics);
  const phaseIds = validateTurnStructure(doc, diagnostics);
  validateTurnFlow(doc, diagnostics);

  validateCrossReferences(doc, zoneIds, actionIds, phaseIds, diagnostics);
  validateDuplicateIdentifiers(doc, diagnostics);
  validateEndConditions(doc, diagnostics);

  diagnostics.sort((left, right) => compareDiagnostics(left, right, options?.sourceMap));
  return diagnostics;
}

interface DataAssetValidationContext {
  readonly hasMapAsset: boolean;
}

function validateDataAssets(doc: GameSpecDoc, diagnostics: Diagnostic[]): DataAssetValidationContext {
  if (doc.dataAssets === null) {
    return { hasMapAsset: false };
  }

  const mapAssetIds = new Set<string>();
  const pieceCatalogAssetIds = new Set<string>();
  const scenarioRefs: Array<{ readonly path: string; readonly mapAssetId?: string; readonly pieceCatalogAssetId?: string }> = [];
  const normalizedIds: string[] = [];
  let hasMapAsset = false;

  for (const [index, entry] of doc.dataAssets.entries()) {
    const path = `doc.dataAssets.${index}`;
    if (!isRecord(entry)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_DATA_ASSET_SHAPE_INVALID',
        path,
        severity: 'error',
        message: 'Data asset entry must be an object.',
        suggestion: 'Provide id, kind, and payload fields.',
      });
      continue;
    }

    validateUnknownKeys(entry, DATA_ASSET_KEYS, path, diagnostics, 'data asset');
    if (typeof entry.id === 'string' && entry.id.trim() !== '') {
      normalizedIds.push(normalizeIdentifier(entry.id));
    }

    const validated = validateDataAssetEnvelope(entry, {
      pathPrefix: path,
      expectedKinds: ['map', 'scenario', 'pieceCatalog'],
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
      continue;
    }

    const asset = validated.asset;
    if (asset.kind === 'map') {
      hasMapAsset = true;
      mapAssetIds.add(normalizeIdentifier(asset.id));
    } else if (asset.kind === 'pieceCatalog') {
      pieceCatalogAssetIds.add(normalizeIdentifier(asset.id));
    } else if (asset.kind === 'scenario') {
      const payload = asset.payload;
      const basePath = `${path}.payload`;
      if (!isRecord(payload)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DATA_ASSET_SCENARIO_PAYLOAD_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Scenario payload must be an object.',
          suggestion: 'Set scenario payload to an object that includes mapAssetId and pieceCatalogAssetId.',
        });
        continue;
      }

      const mapAssetId =
        typeof payload.mapAssetId === 'string' && payload.mapAssetId.trim() !== ''
          ? normalizeIdentifier(payload.mapAssetId)
          : undefined;
      const pieceCatalogAssetId =
        typeof payload.pieceCatalogAssetId === 'string' && payload.pieceCatalogAssetId.trim() !== ''
          ? normalizeIdentifier(payload.pieceCatalogAssetId)
          : undefined;

      if (mapAssetId === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DATA_ASSET_SCENARIO_REF_INVALID',
          path: `${basePath}.mapAssetId`,
          severity: 'error',
          message: 'Scenario payload must declare a non-empty mapAssetId.',
          suggestion: 'Set payload.mapAssetId to the id of a declared map data asset.',
        });
      }
      if (pieceCatalogAssetId === undefined) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DATA_ASSET_SCENARIO_REF_INVALID',
          path: `${basePath}.pieceCatalogAssetId`,
          severity: 'error',
          message: 'Scenario payload must declare a non-empty pieceCatalogAssetId.',
          suggestion: 'Set payload.pieceCatalogAssetId to the id of a declared pieceCatalog data asset.',
        });
      }

      scenarioRefs.push({
        path: basePath,
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
      });
    }
  }

  pushDuplicateNormalizedIdDiagnostics(diagnostics, normalizedIds, 'doc.dataAssets', 'data asset id');

  for (const reference of scenarioRefs) {
    if (reference.mapAssetId !== undefined && !mapAssetIds.has(reference.mapAssetId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'CNL_VALIDATOR_REFERENCE_MISSING',
        `${reference.path}.mapAssetId`,
        `Unknown map data asset "${reference.mapAssetId}".`,
        reference.mapAssetId,
        [...mapAssetIds],
        'Use one of the declared map data asset ids.',
      );
    }
    if (reference.pieceCatalogAssetId !== undefined && !pieceCatalogAssetIds.has(reference.pieceCatalogAssetId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'CNL_VALIDATOR_REFERENCE_MISSING',
        `${reference.path}.pieceCatalogAssetId`,
        `Unknown pieceCatalog data asset "${reference.pieceCatalogAssetId}".`,
        reference.pieceCatalogAssetId,
        [...pieceCatalogAssetIds],
        'Use one of the declared pieceCatalog data asset ids.',
      );
    }
  }

  return { hasMapAsset };
}

function dropZoneMissingDiagnostic(diagnostics: Diagnostic[]): void {
  const index = diagnostics.findIndex(
    (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_REQUIRED_SECTION_MISSING' && diagnostic.path === 'doc.zones',
  );
  if (index >= 0) {
    diagnostics.splice(index, 1);
  }
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

function validateZones(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
  const collectedZoneIds: string[] = [];
  if (doc.zones === null) {
    return collectedZoneIds;
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

    validateUnknownKeys(zone, ZONE_KEYS, basePath, diagnostics, 'zone');
    validateEnumField(zone, 'owner', ['none', 'player'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'visibility', ['public', 'owner', 'hidden'], basePath, diagnostics, 'zone');
    validateEnumField(zone, 'ordering', ['stack', 'queue', 'set'], basePath, diagnostics, 'zone');

    const zoneId = validateIdentifierField(zone, 'id', `${basePath}.id`, diagnostics, 'zone id');
    if (zoneId !== undefined) {
      collectedZoneIds.push(zoneId);
    }
  }

  return uniqueSorted(collectedZoneIds);
}

function validateActions(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
  const collectedActionIds: string[] = [];
  if (doc.actions === null) {
    return collectedActionIds;
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

    validateUnknownKeys(action, ACTION_KEYS, basePath, diagnostics, 'action');

    const actionId = validateIdentifierField(action, 'id', `${basePath}.id`, diagnostics, 'action id');
    if (actionId !== undefined) {
      collectedActionIds.push(actionId);
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

  return uniqueSorted(collectedActionIds);
}

function validateTurnStructure(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
  const collectedPhaseIds: string[] = [];
  const turnStructure = doc.turnStructure;
  if (!isRecord(turnStructure)) {
    return collectedPhaseIds;
  }

  validateUnknownKeys(turnStructure, TURN_STRUCTURE_KEYS, 'doc.turnStructure', diagnostics, 'turnStructure');

  if (!Array.isArray(turnStructure.phases) || turnStructure.phases.length === 0) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_STRUCTURE_PHASES_INVALID',
      path: 'doc.turnStructure.phases',
      severity: 'error',
      message: 'turnStructure.phases must be a non-empty array.',
      suggestion: 'Define at least one phase in turnStructure.phases.',
    });
  } else {
    for (const [phaseIndex, phase] of turnStructure.phases.entries()) {
      const phasePath = `doc.turnStructure.phases.${phaseIndex}`;
      if (!isRecord(phase)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_STRUCTURE_PHASE_SHAPE_INVALID',
          path: phasePath,
          severity: 'error',
          message: 'Each turnStructure.phases entry must be an object.',
          suggestion: 'Set phase entries to objects with at least an id field.',
        });
        continue;
      }

      validateUnknownKeys(phase, PHASE_KEYS, phasePath, diagnostics, 'phase');
      const phaseId = validateIdentifierField(phase, 'id', `${phasePath}.id`, diagnostics, 'phase id');
      if (phaseId !== undefined) {
        collectedPhaseIds.push(phaseId);
      }
    }
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

  return uniqueSorted(collectedPhaseIds);
}

function validateTurnFlow(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.turnFlow === null) {
    return;
  }

  if (!isRecord(doc.turnFlow)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_SHAPE_INVALID',
      path: 'doc.turnFlow',
      severity: 'error',
      message: 'turnFlow must be an object when declared.',
      suggestion: 'Provide turnFlow.cardLifecycle, eligibility, optionMatrix, passRewards, and durationWindows.',
    });
    return;
  }

  validateUnknownKeys(doc.turnFlow, TURN_FLOW_KEYS, 'doc.turnFlow', diagnostics, 'turnFlow');

  const cardLifecycle = doc.turnFlow.cardLifecycle;
  if (!isRecord(cardLifecycle)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_CARD_LIFECYCLE_INVALID',
      path: 'doc.turnFlow.cardLifecycle',
      severity: 'error',
      message: 'turnFlow.cardLifecycle must be an object.',
      suggestion: 'Provide cardLifecycle.played, cardLifecycle.lookahead, and cardLifecycle.leader.',
    });
  } else {
    validateUnknownKeys(cardLifecycle, TURN_FLOW_CARD_LIFECYCLE_KEYS, 'doc.turnFlow.cardLifecycle', diagnostics, 'cardLifecycle');
    for (const key of TURN_FLOW_CARD_LIFECYCLE_KEYS) {
      validateIdentifierField(
        cardLifecycle,
        key,
        `doc.turnFlow.cardLifecycle.${key}`,
        diagnostics,
        `turnFlow.cardLifecycle.${key}`,
      );
    }
  }

  const eligibility = doc.turnFlow.eligibility;
  if (!isRecord(eligibility)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_INVALID',
      path: 'doc.turnFlow.eligibility',
      severity: 'error',
      message: 'turnFlow.eligibility must be an object.',
      suggestion: 'Provide eligibility.factions and eligibility.overrideWindows.',
    });
  } else {
    validateUnknownKeys(eligibility, TURN_FLOW_ELIGIBILITY_KEYS, 'doc.turnFlow.eligibility', diagnostics, 'eligibility');

    if (!Array.isArray(eligibility.factions)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_FACTIONS_INVALID',
        path: 'doc.turnFlow.eligibility.factions',
        severity: 'error',
        message: 'turnFlow.eligibility.factions must be an array of non-empty strings.',
        suggestion: 'Set eligibility.factions to faction identifiers in deterministic order.',
      });
    } else {
      for (const [index, faction] of eligibility.factions.entries()) {
        if (typeof faction !== 'string' || faction.trim() === '') {
          diagnostics.push({
            code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_FACTIONS_INVALID',
            path: `doc.turnFlow.eligibility.factions.${index}`,
            severity: 'error',
            message: 'Each eligibility faction must be a non-empty string.',
            suggestion: 'Replace invalid faction value with a non-empty identifier.',
          });
        }
      }
    }

    if (!Array.isArray(eligibility.overrideWindows)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_FLOW_OVERRIDE_WINDOWS_INVALID',
        path: 'doc.turnFlow.eligibility.overrideWindows',
        severity: 'error',
        message: 'turnFlow.eligibility.overrideWindows must be an array.',
        suggestion: 'Set overrideWindows to an array of { id, duration } objects.',
      });
    } else {
      for (const [index, windowDef] of eligibility.overrideWindows.entries()) {
        const basePath = `doc.turnFlow.eligibility.overrideWindows.${index}`;
        if (!isRecord(windowDef)) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_TURN_FLOW_OVERRIDE_WINDOW_SHAPE_INVALID',
            path: basePath,
            severity: 'error',
            message: 'Each override window must be an object.',
            suggestion: 'Set override window entries to { id, duration } objects.',
          });
          continue;
        }
        validateUnknownKeys(windowDef, TURN_FLOW_OVERRIDE_WINDOW_KEYS, basePath, diagnostics, 'override window');
        validateIdentifierField(windowDef, 'id', `${basePath}.id`, diagnostics, 'override window id');
        validateEnumField(
          windowDef,
          'duration',
          TURN_FLOW_DURATION_VALUES,
          basePath,
          diagnostics,
          'override window',
        );
      }
    }
  }

  if (!Array.isArray(doc.turnFlow.optionMatrix)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_OPTION_MATRIX_INVALID',
      path: 'doc.turnFlow.optionMatrix',
      severity: 'error',
      message: 'turnFlow.optionMatrix must be an array.',
      suggestion: 'Set optionMatrix to rows of { first, second } action classes.',
    });
  } else {
    for (const [index, row] of doc.turnFlow.optionMatrix.entries()) {
      const basePath = `doc.turnFlow.optionMatrix.${index}`;
      if (!isRecord(row)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_OPTION_MATRIX_ROW_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Each optionMatrix row must be an object.',
          suggestion: 'Set optionMatrix rows to { first, second }.',
        });
        continue;
      }
      validateUnknownKeys(row, TURN_FLOW_OPTION_MATRIX_ROW_KEYS, basePath, diagnostics, 'optionMatrix row');
      validateEnumField(row, 'first', TURN_FLOW_FIRST_ACTION_VALUES, basePath, diagnostics, 'optionMatrix row');

      if (!Array.isArray(row.second)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_OPTION_MATRIX_SECOND_INVALID',
          path: `${basePath}.second`,
          severity: 'error',
          message: 'optionMatrix.second must be an array of action classes.',
          suggestion: `Use one or more values from: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
        });
      } else {
        for (const [secondIndex, actionClass] of row.second.entries()) {
          if (typeof actionClass !== 'string' || !TURN_FLOW_ACTION_CLASS_VALUES.includes(actionClass)) {
            diagnostics.push({
              code: 'CNL_VALIDATOR_TURN_FLOW_OPTION_MATRIX_SECOND_INVALID',
              path: `${basePath}.second.${secondIndex}`,
              severity: 'error',
              message: 'optionMatrix.second contains an invalid action class.',
              suggestion: `Use one of: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
            });
          }
        }
      }
    }
  }

  if (!Array.isArray(doc.turnFlow.passRewards)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_PASS_REWARDS_INVALID',
      path: 'doc.turnFlow.passRewards',
      severity: 'error',
      message: 'turnFlow.passRewards must be an array.',
      suggestion: 'Set passRewards to entries of { factionClass, resource, amount }.',
    });
  } else {
    for (const [index, reward] of doc.turnFlow.passRewards.entries()) {
      const basePath = `doc.turnFlow.passRewards.${index}`;
      if (!isRecord(reward)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_PASS_REWARD_SHAPE_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Each pass reward must be an object.',
          suggestion: 'Set pass reward entries to { factionClass, resource, amount }.',
        });
        continue;
      }
      validateUnknownKeys(reward, TURN_FLOW_PASS_REWARD_KEYS, basePath, diagnostics, 'pass reward');
      validateIdentifierField(reward, 'factionClass', `${basePath}.factionClass`, diagnostics, 'pass reward factionClass');
      validateIdentifierField(reward, 'resource', `${basePath}.resource`, diagnostics, 'pass reward resource');
      if (!isFiniteNumber(reward.amount)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_PASS_REWARD_AMOUNT_INVALID',
          path: `${basePath}.amount`,
          severity: 'error',
          message: 'pass reward amount must be a finite number.',
          suggestion: 'Set amount to a finite numeric value.',
        });
      }
    }
  }

  if (!Array.isArray(doc.turnFlow.durationWindows)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_DURATION_WINDOWS_INVALID',
      path: 'doc.turnFlow.durationWindows',
      severity: 'error',
      message: 'turnFlow.durationWindows must be an array of duration values.',
      suggestion: `Use values from: ${TURN_FLOW_DURATION_VALUES.join(', ')}.`,
    });
  } else {
    for (const [index, duration] of doc.turnFlow.durationWindows.entries()) {
      if (typeof duration !== 'string' || !TURN_FLOW_DURATION_VALUES.includes(duration)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_DURATION_WINDOWS_INVALID',
          path: `doc.turnFlow.durationWindows.${index}`,
          severity: 'error',
          message: 'durationWindows contains an invalid duration value.',
          suggestion: `Use one of: ${TURN_FLOW_DURATION_VALUES.join(', ')}.`,
        });
      }
    }
  }
}

function validateCrossReferences(
  doc: GameSpecDoc,
  zoneIds: readonly string[],
  actionIds: readonly string[],
  phaseIds: readonly string[],
  diagnostics: Diagnostic[],
): void {
  const phaseIdSet = new Set<string>(phaseIds);
  const actionIdSet = new Set<string>(actionIds);
  const zoneIdSet = new Set<string>(zoneIds);

  if (doc.actions !== null) {
    for (const [index, action] of doc.actions.entries()) {
      const basePath = `doc.actions.${index}`;
      if (!isRecord(action) || typeof action.phase !== 'string' || action.phase.trim() === '') {
        continue;
      }

      const normalizedPhase = normalizeIdentifier(action.phase);
      if (!phaseIdSet.has(normalizedPhase)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'CNL_VALIDATOR_REFERENCE_MISSING',
          `${basePath}.phase`,
          `Unknown phase "${action.phase}".`,
          normalizedPhase,
          phaseIds,
          'Use one of the declared phase ids.',
        );
      }
    }
  }

  if (doc.triggers !== null) {
    const triggerIds: string[] = [];

    for (const [index, trigger] of doc.triggers.entries()) {
      const basePath = `doc.triggers.${index}`;
      if (!isRecord(trigger)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TRIGGER_SHAPE_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Trigger definition must be an object.',
          suggestion: 'Set trigger to an object with event/when/match/effects fields.',
        });
        continue;
      }

      validateUnknownKeys(trigger, TRIGGER_KEYS, basePath, diagnostics, 'trigger');
      const triggerId = optionalIdentifierField(trigger, 'id', `${basePath}.id`, diagnostics, 'trigger id');
      if (triggerId !== undefined) {
        triggerIds.push(triggerId);
      }

      const event = trigger.event;
      if (!isRecord(event)) {
        continue;
      }

      validateUnknownKeys(event, TRIGGER_EVENT_KEYS, `${basePath}.event`, diagnostics, 'trigger event');

      if ((event.type === 'phaseEnter' || event.type === 'phaseExit') && typeof event.phase === 'string') {
        const normalizedPhase = normalizeIdentifier(event.phase);
        if (normalizedPhase.length > 0 && !phaseIdSet.has(normalizedPhase)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'CNL_VALIDATOR_REFERENCE_MISSING',
            `${basePath}.event.phase`,
            `Unknown phase "${event.phase}".`,
            normalizedPhase,
            phaseIds,
            'Use one of the declared phase ids.',
          );
        }
      }

      if (event.type === 'actionResolved' && typeof event.action === 'string') {
        const normalizedAction = normalizeIdentifier(event.action);
        if (normalizedAction.length > 0 && !actionIdSet.has(normalizedAction)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'CNL_VALIDATOR_REFERENCE_MISSING',
            `${basePath}.event.action`,
            `Unknown action "${event.action}".`,
            normalizedAction,
            actionIds,
            'Use one of the declared action ids.',
          );
        }
      }
    }

    pushDuplicateNormalizedIdDiagnostics(diagnostics, triggerIds, 'doc.triggers', 'trigger id');
  }

  if (doc.zones !== null) {
    for (const [zoneIndex, zone] of doc.zones.entries()) {
      if (!isRecord(zone) || !Array.isArray(zone.adjacentTo)) {
        continue;
      }

      for (const [adjacentIndex, adjacent] of zone.adjacentTo.entries()) {
        if (typeof adjacent !== 'string') {
          continue;
        }
        const normalizedZoneId = normalizeIdentifier(adjacent);
        if (normalizedZoneId.length === 0 || zoneIdSet.has(normalizedZoneId)) {
          continue;
        }
        pushMissingReferenceDiagnostic(
          diagnostics,
          'CNL_VALIDATOR_REFERENCE_MISSING',
          `doc.zones.${zoneIndex}.adjacentTo.${adjacentIndex}`,
          `Unknown adjacent zone "${adjacent}".`,
          normalizedZoneId,
          zoneIds,
          'Use one of the declared zone ids.',
        );
      }
    }
  }
}

function validateDuplicateIdentifiers(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.zones !== null) {
    const zoneIds = doc.zones
      .map((zone) => (isRecord(zone) && typeof zone.id === 'string' ? normalizeIdentifier(zone.id) : undefined))
      .filter((value): value is string => value !== undefined && value.length > 0);
    pushDuplicateNormalizedIdDiagnostics(diagnostics, zoneIds, 'doc.zones', 'zone id');
  }

  if (doc.actions !== null) {
    const actionIds = doc.actions
      .map((action) => (isRecord(action) && typeof action.id === 'string' ? normalizeIdentifier(action.id) : undefined))
      .filter((value): value is string => value !== undefined && value.length > 0);
    pushDuplicateNormalizedIdDiagnostics(diagnostics, actionIds, 'doc.actions', 'action id');
  }

  const phases = isRecord(doc.turnStructure) && Array.isArray(doc.turnStructure.phases) ? doc.turnStructure.phases : [];
  const phaseIds = phases
    .map((phase) => (isRecord(phase) && typeof phase.id === 'string' ? normalizeIdentifier(phase.id) : undefined))
    .filter((value): value is string => value !== undefined && value.length > 0);
  pushDuplicateNormalizedIdDiagnostics(diagnostics, phaseIds, 'doc.turnStructure.phases', 'phase id');
}

function validateEndConditions(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.endConditions === null) {
    return;
  }

  for (const [index, endCondition] of doc.endConditions.entries()) {
    if (!isRecord(endCondition)) {
      continue;
    }
    validateUnknownKeys(endCondition, END_CONDITION_KEYS, `doc.endConditions.${index}`, diagnostics, 'end condition');
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

function validateUnknownKeys(
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

function validateIdentifierField(
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

function optionalIdentifierField(
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

function pushDuplicateNormalizedIdDiagnostics(
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

function pushMissingReferenceDiagnostic(
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

function compareDiagnostics(left: Diagnostic, right: Diagnostic, sourceMap?: GameSpecSourceMap): number {
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

function resolveSpanForDiagnosticPath(path: string, sourceMap?: GameSpecSourceMap): SourceSpan | undefined {
  if (sourceMap === undefined) {
    return undefined;
  }

  const direct = sourceMap.byPath[path];
  if (direct !== undefined) {
    return direct;
  }

  const withoutDocPrefix = path.startsWith('doc.') ? path.slice(4) : path;
  const bracketPath = withoutDocPrefix.replace(/\.([0-9]+)(?=\.|$)/g, '[$1]');
  return sourceMap.byPath[bracketPath];
}

function compareSourceSpans(left?: SourceSpan, right?: SourceSpan): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }

  if (left.blockIndex !== right.blockIndex) {
    return left.blockIndex - right.blockIndex;
  }
  if (left.markdownLineStart !== right.markdownLineStart) {
    return left.markdownLineStart - right.markdownLineStart;
  }
  if (left.markdownColStart !== right.markdownColStart) {
    return left.markdownColStart - right.markdownColStart;
  }
  if (left.markdownLineEnd !== right.markdownLineEnd) {
    return left.markdownLineEnd - right.markdownLineEnd;
  }
  return left.markdownColEnd - right.markdownColEnd;
}

function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
