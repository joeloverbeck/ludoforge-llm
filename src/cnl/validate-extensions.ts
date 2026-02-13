import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  ACTION_PIPELINE_ATOMICITY_VALUES,
  ACTION_PIPELINE_KEYS,
  DATA_ASSET_KEYS,
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_CARD_LIFECYCLE_KEYS,
  TURN_FLOW_DURATION_VALUES,
  TURN_FLOW_ELIGIBILITY_KEYS,
  TURN_FLOW_FIRST_ACTION_VALUES,
  TURN_FLOW_KEYS,
  TURN_FLOW_OPTION_MATRIX_ROW_KEYS,
  TURN_FLOW_OVERRIDE_WINDOW_KEYS,
  TURN_FLOW_PASS_REWARD_KEYS,
  isFiniteNumber,
  isRecord,
  normalizeIdentifier,
  pushDuplicateNormalizedIdDiagnostics,
  pushMissingReferenceDiagnostic,
  validateEnumField,
  validateIdentifierField,
  validateUnknownKeys,
} from './validate-spec-shared.js';
import { validateScenarioCrossReferences } from './validate-zones.js';

interface DataAssetValidationContext {
  readonly hasMapAsset: boolean;
}

export function validateDataAssets(doc: GameSpecDoc, diagnostics: Diagnostic[]): DataAssetValidationContext {
  if (doc.dataAssets === null) {
    return { hasMapAsset: false };
  }

  const mapAssetIds = new Set<string>();
  const pieceCatalogAssetIds = new Set<string>();
  const scenarioRefs: Array<{
    readonly path: string;
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly payload: Record<string, unknown>;
  }> = [];
  const resolvedMapPayloads = new Map<string, Record<string, unknown>>();
  const resolvedPieceCatalogPayloads = new Map<string, Record<string, unknown>>();
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
      expectedKinds: ['map', 'scenario', 'pieceCatalog', 'eventCardSet'],
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
      continue;
    }

    const asset = validated.asset;
    if (asset.kind === 'map') {
      hasMapAsset = true;
      const normalizedMapId = normalizeIdentifier(asset.id);
      mapAssetIds.add(normalizedMapId);
      if (isRecord(asset.payload)) {
        resolvedMapPayloads.set(normalizedMapId, asset.payload);
      }
    } else if (asset.kind === 'pieceCatalog') {
      const normalizedPcId = normalizeIdentifier(asset.id);
      pieceCatalogAssetIds.add(normalizedPcId);
      if (isRecord(asset.payload)) {
        resolvedPieceCatalogPayloads.set(normalizedPcId, asset.payload);
      }
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
        payload,
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

  for (const reference of scenarioRefs) {
    validateScenarioCrossReferences(
      reference.payload,
      reference.path,
      reference.mapAssetId !== undefined ? resolvedMapPayloads.get(reference.mapAssetId) : undefined,
      reference.pieceCatalogAssetId !== undefined ? resolvedPieceCatalogPayloads.get(reference.pieceCatalogAssetId) : undefined,
      diagnostics,
    );
  }

  return { hasMapAsset };
}

export function dropZoneMissingDiagnostic(diagnostics: Diagnostic[]): void {
  const index = diagnostics.findIndex(
    (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_REQUIRED_SECTION_MISSING' && diagnostic.path === 'doc.zones',
  );
  if (index >= 0) {
    diagnostics.splice(index, 1);
  }
}

export function validateTurnFlow(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
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

export function validateActionPipelines(
  doc: GameSpecDoc,
  actionIds: readonly string[],
  diagnostics: Diagnostic[],
): void {
  if (doc.actionPipelines === null) {
    return;
  }

  const actionIdSet = new Set(actionIds);
  const actionIdCounts = new Map<string, number>();

  for (const [index, profile] of doc.actionPipelines.entries()) {
    const basePath = `doc.actionPipelines.${index}`;
    if (!isRecord(profile)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_SHAPE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'Action pipeline entry must be an object.',
        suggestion: 'Set action pipeline entries to objects with id/actionId/legality/costValidation/costEffects/targeting/stages/atomicity.',
      });
      continue;
    }

    validateUnknownKeys(profile, ACTION_PIPELINE_KEYS, basePath, diagnostics, 'action pipeline');
    validateIdentifierField(profile, 'id', `${basePath}.id`, diagnostics, 'action pipeline id');
    validateIdentifierField(profile, 'actionId', `${basePath}.actionId`, diagnostics, 'action pipeline actionId');

    if (typeof profile.actionId === 'string' && profile.actionId.trim() !== '') {
      const normalizedActionId = normalizeIdentifier(profile.actionId);
      actionIdCounts.set(normalizedActionId, (actionIdCounts.get(normalizedActionId) ?? 0) + 1);
      if (!actionIdSet.has(normalizedActionId)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'CNL_VALIDATOR_REFERENCE_MISSING',
          `${basePath}.actionId`,
          `Unknown action "${profile.actionId}".`,
          normalizedActionId,
          actionIds,
          'Use one of the declared action ids.',
        );
      }
    }

    if (profile.legality !== null && !isRecord(profile.legality) && typeof profile.legality !== 'boolean') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.legality`,
        severity: 'error',
        message: 'action pipeline legality must be a Condition AST object, boolean, or null.',
        suggestion: 'Provide a Condition AST, boolean literal, or null.',
      });
    }
    if (profile.costValidation !== null && profile.costValidation !== undefined
      && !isRecord(profile.costValidation) && typeof profile.costValidation !== 'boolean') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.costValidation`,
        severity: 'error',
        message: 'action pipeline costValidation must be a Condition AST object, boolean, or null.',
        suggestion: 'Provide a Condition AST, boolean literal, or null.',
      });
    }
    if (!Array.isArray(profile.costEffects)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.costEffects`,
        severity: 'error',
        message: 'action pipeline costEffects must be an array.',
        suggestion: 'Provide an array of Effect AST entries (empty array means no explicit pipeline cost).',
      });
    }
    if (!isRecord(profile.targeting)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.targeting`,
        severity: 'error',
        message: 'action pipeline targeting must be an object.',
        suggestion: 'Provide a targeting object (explicitly encode no-target behavior if applicable).',
      });
    }
    if (!Array.isArray(profile.stages) || profile.stages.length === 0) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.stages`,
        severity: 'error',
        message: 'action pipeline stages must be a non-empty array of stage objects.',
        suggestion: 'Declare one or more ordered stages.',
      });
    } else {
      for (const [stageIndex, stage] of profile.stages.entries()) {
        if (!isRecord(stage)) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
            path: `${basePath}.stages.${stageIndex}`,
            severity: 'error',
            message: 'Each stages stage must be an object.',
            suggestion: 'Replace non-object stages with explicit stage objects.',
          });
        }
      }
    }

    if (typeof profile.atomicity !== 'string') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
        path: `${basePath}.atomicity`,
        severity: 'error',
        message: 'action pipeline atomicity must be a string.',
        suggestion: 'Set atomicity to "atomic" or "partial".',
      });
    } else {
      validateEnumField(
        profile,
        'atomicity',
        ACTION_PIPELINE_ATOMICITY_VALUES,
        basePath,
        diagnostics,
        'action pipeline atomicity',
      );
    }

    if (profile.linkedWindows !== undefined) {
      if (!Array.isArray(profile.linkedWindows)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_ACTION_PIPELINE_LINKED_WINDOWS_INVALID',
          path: `${basePath}.linkedWindows`,
          severity: 'error',
          message: 'linkedWindows must be an array of non-empty strings when provided.',
          suggestion: 'Set linkedWindows to string ids or omit the field.',
        });
      } else {
        for (const [windowIndex, windowId] of profile.linkedWindows.entries()) {
          if (typeof windowId !== 'string' || windowId.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_LINKED_WINDOWS_INVALID',
              path: `${basePath}.linkedWindows.${windowIndex}`,
              severity: 'error',
              message: 'linkedWindows entries must be non-empty strings.',
              suggestion: 'Replace invalid entry with a non-empty window id.',
            });
          }
        }
      }
    }
  }

  const ambiguousActionBindings = [...actionIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([actionId]) => actionId);
  for (const actionId of ambiguousActionBindings) {
    const profilesForAction = doc.actionPipelines
      .filter((p) => normalizeIdentifier(String(p.actionId ?? '')) === actionId);
    const missingApplicability = profilesForAction.some((p) => p.applicability === undefined || p.applicability === null);
    if (missingApplicability) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS',
        path: 'doc.actionPipelines',
        severity: 'error',
        message: `Multiple action pipelines target action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple pipelines share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }
}
