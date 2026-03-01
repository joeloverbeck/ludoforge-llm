import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  ACTION_PIPELINE_ATOMICITY_VALUES,
  ACTION_PIPELINE_KEYS,
  DATA_ASSET_KEYS,
  TURN_ORDER_KEYS,
  TURN_ORDER_TYPE_VALUES,
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

const DERIVED_METRIC_KEYS = ['id', 'computation', 'zoneFilter', 'requirements'] as const;
const DERIVED_METRIC_ZONE_FILTER_KEYS = ['zoneIds', 'zoneKinds', 'category', 'attributeEquals'] as const;
const DERIVED_METRIC_REQUIREMENT_KEYS = ['key', 'expectedType'] as const;
const DERIVED_METRIC_COMPUTATION_VALUES = ['markerTotal', 'controlledPopulation', 'totalEcon'] as const;
const DERIVED_METRIC_ZONE_KIND_VALUES = ['board', 'aux'] as const;

export function validateDataAssets(doc: GameSpecDoc, diagnostics: Diagnostic[]): DataAssetValidationContext {
  if (doc.dataAssets === null) {
    return { hasMapAsset: false };
  }

  const mapAssetIds = new Set<string>();
  const pieceCatalogAssetIds = new Set<string>();
  const seatCatalogAssetIds = new Set<string>();
  const scenarioRefs: Array<{
    readonly path: string;
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly seatCatalogAssetId?: string;
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

    const validated = validateDataAssetEnvelope(
      {
        id: entry.id,
        kind: entry.kind,
        payload: entry.payload,
      },
      {
      pathPrefix: path,
      },
    );
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
    } else if (asset.kind === 'seatCatalog') {
      const normalizedSeatCatalogId = normalizeIdentifier(asset.id);
      seatCatalogAssetIds.add(normalizedSeatCatalogId);
    } else if (asset.kind === 'scenario') {
      const payload = asset.payload;
      const basePath = `${path}.payload`;
      if (!isRecord(payload)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DATA_ASSET_SCENARIO_PAYLOAD_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Scenario payload must be an object.',
          suggestion: 'Set scenario payload to an object.',
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
      const seatCatalogAssetId =
        typeof payload.seatCatalogAssetId === 'string' && payload.seatCatalogAssetId.trim() !== ''
          ? normalizeIdentifier(payload.seatCatalogAssetId)
          : undefined;

      scenarioRefs.push({
        path: basePath,
        payload,
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
        ...(seatCatalogAssetId === undefined ? {} : { seatCatalogAssetId }),
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
    if (reference.seatCatalogAssetId !== undefined && !seatCatalogAssetIds.has(reference.seatCatalogAssetId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'CNL_VALIDATOR_REFERENCE_MISSING',
        `${reference.path}.seatCatalogAssetId`,
        `Unknown seatCatalog data asset "${reference.seatCatalogAssetId}".`,
        reference.seatCatalogAssetId,
        [...seatCatalogAssetIds],
        'Use one of the declared seatCatalog data asset ids.',
      );
    }
  }

  for (const reference of scenarioRefs) {
    validateScenarioCrossReferences(
      reference.payload,
      reference.path,
      reference.mapAssetId !== undefined ? resolvedMapPayloads.get(reference.mapAssetId) : undefined,
      reference.pieceCatalogAssetId !== undefined ? resolvedPieceCatalogPayloads.get(reference.pieceCatalogAssetId) : undefined,
      doc.globalVars,
      doc.globalMarkerLattices,
      diagnostics,
    );
  }

  return { hasMapAsset };
}

export function validateScoring(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.terminal === null || !isRecord(doc.terminal) || doc.terminal.scoring === undefined || doc.terminal.scoring === null) {
    return;
  }

  if (!isRecord(doc.terminal.scoring)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_SCORING_SHAPE_INVALID',
      path: 'doc.terminal.scoring',
      severity: 'error',
      message: 'scoring must be an object when declared.',
      suggestion: 'Provide scoring.method and scoring.value.',
    });
    return;
  }

  if (doc.terminal.scoring.method !== 'highest' && doc.terminal.scoring.method !== 'lowest') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_SCORING_METHOD_INVALID',
      path: 'doc.terminal.scoring.method',
      severity: 'error',
      message: 'scoring.method must be "highest" or "lowest".',
      suggestion: 'Set scoring.method to one of: highest, lowest.',
    });
  }

  if (doc.terminal.scoring.value === undefined || doc.terminal.scoring.value === null) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_SCORING_VALUE_MISSING',
      path: 'doc.terminal.scoring.value',
      severity: 'error',
      message: 'scoring.value is required.',
      suggestion: 'Provide a ValueExpr-compatible scoring value.',
    });
  }
}

export function validateDerivedMetrics(
  doc: GameSpecDoc,
  zoneIds: readonly string[],
  diagnostics: Diagnostic[],
): void {
  if (doc.derivedMetrics === null) {
    return;
  }

  const derivedMetricIds: string[] = [];
  const zoneIdSet = new Set(zoneIds.map((zoneId) => normalizeIdentifier(zoneId)));

  for (const [metricIndex, metric] of doc.derivedMetrics.entries()) {
    const metricPath = `doc.derivedMetrics.${metricIndex}`;
    if (!isRecord(metric)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_DERIVED_METRIC_SHAPE_INVALID',
        path: metricPath,
        severity: 'error',
        message: 'derivedMetrics entry must be an object.',
        suggestion: 'Provide id, computation, optional zoneFilter, and requirements.',
      });
      continue;
    }

    validateUnknownKeys(metric, DERIVED_METRIC_KEYS, metricPath, diagnostics, 'derived metric');

    const metricId = validateIdentifierField(metric, 'id', `${metricPath}.id`, diagnostics, 'derived metric id');
    if (metricId !== undefined) {
      derivedMetricIds.push(metricId);
    }

    validateEnumField(metric, 'computation', DERIVED_METRIC_COMPUTATION_VALUES, metricPath, diagnostics, 'derived metric');

    if (!Array.isArray(metric.requirements) || metric.requirements.length === 0) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_DERIVED_METRIC_REQUIREMENTS_INVALID',
        path: `${metricPath}.requirements`,
        severity: 'error',
        message: 'derivedMetrics.requirements must be a non-empty array.',
        suggestion: 'Add one or more requirements with key and expectedType.',
      });
    } else {
      for (const [requirementIndex, requirement] of metric.requirements.entries()) {
        const requirementPath = `${metricPath}.requirements.${requirementIndex}`;
        if (!isRecord(requirement)) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_DERIVED_METRIC_REQUIREMENT_SHAPE_INVALID',
            path: requirementPath,
            severity: 'error',
            message: 'Requirement must be an object.',
            suggestion: 'Set requirement fields { key, expectedType }.',
          });
          continue;
        }
        validateUnknownKeys(requirement, DERIVED_METRIC_REQUIREMENT_KEYS, requirementPath, diagnostics, 'derived metric requirement');
        validateIdentifierField(requirement, 'key', `${requirementPath}.key`, diagnostics, 'derived metric attribute key');
        validateEnumField(requirement, 'expectedType', ['number'], requirementPath, diagnostics, 'derived metric requirement');
      }
    }

    if (metric.zoneFilter === undefined) {
      continue;
    }
    if (!isRecord(metric.zoneFilter)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_DERIVED_METRIC_ZONE_FILTER_SHAPE_INVALID',
        path: `${metricPath}.zoneFilter`,
        severity: 'error',
        message: 'zoneFilter must be an object when declared.',
        suggestion: 'Set zoneFilter to an object with zoneIds/zoneKinds/category/attributeEquals fields.',
      });
      continue;
    }

    const zoneFilter = metric.zoneFilter;
    const zoneFilterPath = `${metricPath}.zoneFilter`;
    validateUnknownKeys(zoneFilter, DERIVED_METRIC_ZONE_FILTER_KEYS, zoneFilterPath, diagnostics, 'derived metric zoneFilter');

    if (zoneFilter.zoneIds !== undefined) {
      if (!Array.isArray(zoneFilter.zoneIds)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DERIVED_METRIC_ZONE_IDS_INVALID',
          path: `${zoneFilterPath}.zoneIds`,
          severity: 'error',
          message: 'zoneFilter.zoneIds must be an array of zone ids.',
          suggestion: 'Provide zone ids as an array of strings.',
        });
      } else {
        for (const [zoneIndex, zoneId] of zoneFilter.zoneIds.entries()) {
          if (typeof zoneId !== 'string' || zoneId.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_DERIVED_METRIC_ZONE_IDS_INVALID',
              path: `${zoneFilterPath}.zoneIds.${zoneIndex}`,
              severity: 'error',
              message: 'zoneFilter.zoneIds entries must be non-empty strings.',
              suggestion: 'Replace invalid entries with declared zone ids.',
            });
            continue;
          }
          const normalizedZoneId = normalizeIdentifier(zoneId);
          if (normalizedZoneId.length > 0 && !zoneIdSet.has(normalizedZoneId)) {
            pushMissingReferenceDiagnostic(
              diagnostics,
              'CNL_VALIDATOR_REFERENCE_MISSING',
              `${zoneFilterPath}.zoneIds.${zoneIndex}`,
              `Unknown zone "${zoneId}".`,
              normalizedZoneId,
              zoneIds,
              'Use one of the declared zone ids.',
            );
          }
        }
      }
    }

    if (zoneFilter.zoneKinds !== undefined) {
      if (!Array.isArray(zoneFilter.zoneKinds)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DERIVED_METRIC_ZONE_KINDS_INVALID',
          path: `${zoneFilterPath}.zoneKinds`,
          severity: 'error',
          message: 'zoneFilter.zoneKinds must be an array.',
          suggestion: 'Use one or more values from: board, aux.',
        });
      } else {
        for (const [zoneKindIndex, zoneKind] of zoneFilter.zoneKinds.entries()) {
          if (zoneKind !== 'board' && zoneKind !== 'aux') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_DERIVED_METRIC_ZONE_KINDS_INVALID',
              path: `${zoneFilterPath}.zoneKinds.${zoneKindIndex}`,
              severity: 'error',
              message: `Unknown zone kind "${String(zoneKind)}".`,
              suggestion: `Use one of: ${DERIVED_METRIC_ZONE_KIND_VALUES.join(', ')}.`,
            });
          }
        }
      }
    }

    if (zoneFilter.category !== undefined) {
      if (!Array.isArray(zoneFilter.category)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_DERIVED_METRIC_CATEGORY_INVALID',
          path: `${zoneFilterPath}.category`,
          severity: 'error',
          message: 'zoneFilter.category must be an array.',
          suggestion: 'Provide one or more category strings.',
        });
      } else {
        for (const [categoryIndex, category] of zoneFilter.category.entries()) {
          if (typeof category !== 'string' || category.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_DERIVED_METRIC_CATEGORY_INVALID',
              path: `${zoneFilterPath}.category.${categoryIndex}`,
              severity: 'error',
              message: 'zoneFilter.category entries must be non-empty strings.',
              suggestion: 'Replace invalid category entries with non-empty strings.',
            });
          }
        }
      }
    }

    if (zoneFilter.attributeEquals !== undefined && !isRecord(zoneFilter.attributeEquals)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_DERIVED_METRIC_ATTRIBUTE_EQUALS_INVALID',
        path: `${zoneFilterPath}.attributeEquals`,
        severity: 'error',
        message: 'zoneFilter.attributeEquals must be an object.',
        suggestion: 'Set attributeEquals to a key/value object.',
      });
    }
  }

  pushDuplicateNormalizedIdDiagnostics(diagnostics, derivedMetricIds, 'doc.derivedMetrics', 'derived metric id');
}

export function validateEventDecks(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.eventDecks === null) {
    return;
  }

  const deckIds: string[] = [];
  for (const [deckIndex, deck] of doc.eventDecks.entries()) {
    const deckPath = `doc.eventDecks.${deckIndex}`;
    if (!isRecord(deck)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_EVENT_DECK_SHAPE_INVALID',
        path: deckPath,
        severity: 'error',
        message: 'Event deck must be an object.',
        suggestion: 'Provide event deck id and cards fields.',
      });
      continue;
    }

    const deckId = validateIdentifierField(deck, 'id', `${deckPath}.id`, diagnostics, 'event deck id');
    if (deckId !== undefined) {
      deckIds.push(deckId);
    }

    if (!Array.isArray(deck.cards)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_EVENT_DECK_CARDS_INVALID',
        path: `${deckPath}.cards`,
        severity: 'error',
        message: 'eventDeck.cards must be an array.',
        suggestion: 'Provide one or more event card definitions.',
      });
      continue;
    }

    const cardIds: string[] = [];
    for (const [cardIndex, card] of deck.cards.entries()) {
      if (!isRecord(card)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_EVENT_CARD_SHAPE_INVALID',
          path: `${deckPath}.cards.${cardIndex}`,
          severity: 'error',
          message: 'Event card must be an object.',
          suggestion: 'Provide card id/title/sideMode fields.',
        });
        continue;
      }
      const cardId = validateIdentifierField(card, 'id', `${deckPath}.cards.${cardIndex}.id`, diagnostics, 'event card id');
      if (cardId !== undefined) {
        cardIds.push(cardId);
      }
    }

    pushDuplicateNormalizedIdDiagnostics(diagnostics, cardIds, `${deckPath}.cards`, 'event card id');
  }

  pushDuplicateNormalizedIdDiagnostics(diagnostics, deckIds, 'doc.eventDecks', 'event deck id');
}

export function dropZoneMissingDiagnostic(diagnostics: Diagnostic[]): void {
  const index = diagnostics.findIndex(
    (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_REQUIRED_SECTION_MISSING' && diagnostic.path === 'doc.zones',
  );
  if (index >= 0) {
    diagnostics.splice(index, 1);
  }
}

export function validateTurnOrder(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.turnOrder === null) {
    return;
  }

  if (!isRecord(doc.turnOrder)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_ORDER_SHAPE_INVALID',
      path: 'doc.turnOrder',
      severity: 'error',
      message: 'turnOrder must be an object when declared.',
      suggestion: 'Provide turnOrder.type and strategy-specific fields.',
    });
    return;
  }

  validateUnknownKeys(doc.turnOrder, TURN_ORDER_KEYS, 'doc.turnOrder', diagnostics, 'turnOrder');
  validateEnumField(doc.turnOrder, 'type', TURN_ORDER_TYPE_VALUES, 'doc.turnOrder', diagnostics, 'turnOrder');

  if (doc.turnOrder.type === 'roundRobin' || doc.turnOrder.type === 'simultaneous') {
    return;
  }

  if (doc.turnOrder.type === 'fixedOrder') {
    if (!Array.isArray(doc.turnOrder.order) || doc.turnOrder.order.length === 0) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_FIXED_ORDER_INVALID',
        path: 'doc.turnOrder.order',
        severity: 'error',
        message: 'fixedOrder requires a non-empty order array.',
        suggestion: 'Declare one or more player ids in turnOrder.order.',
      });
      return;
    }
    for (const [index, playerId] of doc.turnOrder.order.entries()) {
      if (typeof playerId !== 'string' || playerId.trim() === '') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_FIXED_ORDER_INVALID',
          path: `doc.turnOrder.order.${index}`,
          severity: 'error',
          message: 'fixedOrder entries must be non-empty strings.',
          suggestion: 'Replace invalid order entries with player ids.',
        });
      }
    }
    return;
  }

  if (!isRecord(doc.turnOrder.config)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_ORDER_CARD_DRIVEN_CONFIG_INVALID',
      path: 'doc.turnOrder.config',
      severity: 'error',
      message: 'cardDriven turnOrder requires a config object.',
      suggestion: 'Provide turnOrder.config.turnFlow and optional turnOrder.config.coupPlan.',
    });
    return;
  }

  const turnFlow = doc.turnOrder.config.turnFlow;
  if (!isRecord(turnFlow)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_SHAPE_INVALID',
      path: 'doc.turnOrder.config.turnFlow',
      severity: 'error',
      message: 'turnOrder.config.turnFlow must be an object.',
      suggestion: 'Provide turnFlow.cardLifecycle, eligibility, actionClassByActionId, optionMatrix, passRewards, and durationWindows.',
    });
    return;
  }

  validateUnknownKeys(turnFlow, TURN_FLOW_KEYS, 'doc.turnOrder.config.turnFlow', diagnostics, 'turnFlow');

  const cardLifecycle = turnFlow.cardLifecycle;
  if (!isRecord(cardLifecycle)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_CARD_LIFECYCLE_INVALID',
      path: 'doc.turnOrder.config.turnFlow.cardLifecycle',
      severity: 'error',
      message: 'turnFlow.cardLifecycle must be an object.',
      suggestion: 'Provide cardLifecycle.played, cardLifecycle.lookahead, and cardLifecycle.leader.',
    });
  } else {
    validateUnknownKeys(cardLifecycle, TURN_FLOW_CARD_LIFECYCLE_KEYS, 'doc.turnOrder.config.turnFlow.cardLifecycle', diagnostics, 'cardLifecycle');
    for (const key of TURN_FLOW_CARD_LIFECYCLE_KEYS) {
      validateIdentifierField(
        cardLifecycle,
        key,
        `doc.turnOrder.config.turnFlow.cardLifecycle.${key}`,
        diagnostics,
        `turnFlow.cardLifecycle.${key}`,
      );
    }
  }

  const eligibility = turnFlow.eligibility;
  if (!isRecord(eligibility)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_INVALID',
      path: 'doc.turnOrder.config.turnFlow.eligibility',
      severity: 'error',
      message: 'turnFlow.eligibility must be an object.',
      suggestion: 'Provide eligibility.seats and eligibility.overrideWindows.',
    });
  } else {
    validateUnknownKeys(eligibility, TURN_FLOW_ELIGIBILITY_KEYS, 'doc.turnOrder.config.turnFlow.eligibility', diagnostics, 'eligibility');

    if (!Array.isArray(eligibility.seats)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_SEATS_INVALID',
        path: 'doc.turnOrder.config.turnFlow.eligibility.seats',
        severity: 'error',
        message: 'turnFlow.eligibility.seats must be an array of non-empty strings.',
        suggestion: 'Set eligibility.seats to seat identifiers in deterministic order.',
      });
    } else {
      for (const [index, seat] of eligibility.seats.entries()) {
        if (typeof seat !== 'string' || seat.trim() === '') {
          diagnostics.push({
            code: 'CNL_VALIDATOR_TURN_FLOW_ELIGIBILITY_SEATS_INVALID',
            path: `doc.turnOrder.config.turnFlow.eligibility.seats.${index}`,
            severity: 'error',
            message: 'Each eligibility seat must be a non-empty string.',
            suggestion: 'Replace invalid seat value with a non-empty identifier.',
          });
        }
      }
    }

    if (!Array.isArray(eligibility.overrideWindows)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_FLOW_OVERRIDE_WINDOWS_INVALID',
        path: 'doc.turnOrder.config.turnFlow.eligibility.overrideWindows',
        severity: 'error',
        message: 'turnFlow.eligibility.overrideWindows must be an array.',
        suggestion: 'Set overrideWindows to an array of { id, duration } objects.',
      });
    } else {
      for (const [index, windowDef] of eligibility.overrideWindows.entries()) {
        const basePath = `doc.turnOrder.config.turnFlow.eligibility.overrideWindows.${index}`;
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

  if (!isRecord(turnFlow.actionClassByActionId)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_ACTION_CLASS_MAP_INVALID',
      path: 'doc.turnOrder.config.turnFlow.actionClassByActionId',
      severity: 'error',
      message: 'turnFlow.actionClassByActionId must be an object mapping action ids to action classes.',
      suggestion: `Set actionClassByActionId to entries with values from: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
    });
  } else {
    for (const [actionId, actionClass] of Object.entries(turnFlow.actionClassByActionId)) {
      if (actionId.trim() === '') {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_ACTION_CLASS_MAP_INVALID',
          path: 'doc.turnOrder.config.turnFlow.actionClassByActionId',
          severity: 'error',
          message: 'actionClassByActionId keys must be non-empty action ids.',
          suggestion: 'Replace empty keys with declared action ids.',
        });
      }
      if (typeof actionClass !== 'string' || !TURN_FLOW_ACTION_CLASS_VALUES.includes(actionClass)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_ACTION_CLASS_MAP_INVALID',
          path: `doc.turnOrder.config.turnFlow.actionClassByActionId.${actionId}`,
          severity: 'error',
          message: 'actionClassByActionId contains an invalid action class.',
          suggestion: `Use one of: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
        });
      }
    }
  }

  if (!Array.isArray(turnFlow.optionMatrix)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_OPTION_MATRIX_INVALID',
      path: 'doc.turnOrder.config.turnFlow.optionMatrix',
      severity: 'error',
      message: 'turnFlow.optionMatrix must be an array.',
      suggestion: 'Set optionMatrix to rows of { first, second } action classes.',
    });
  } else {
    for (const [index, row] of turnFlow.optionMatrix.entries()) {
      const basePath = `doc.turnOrder.config.turnFlow.optionMatrix.${index}`;
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
          if (typeof actionClass !== 'string' || !(TURN_FLOW_ACTION_CLASS_VALUES as readonly string[]).includes(actionClass)) {
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

  if (!Array.isArray(turnFlow.passRewards)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_PASS_REWARDS_INVALID',
      path: 'doc.turnOrder.config.turnFlow.passRewards',
      severity: 'error',
      message: 'turnFlow.passRewards must be an array.',
      suggestion: 'Set passRewards to entries of { seat, resource, amount }.',
    });
  } else {
    for (const [index, reward] of turnFlow.passRewards.entries()) {
      const basePath = `doc.turnOrder.config.turnFlow.passRewards.${index}`;
      if (!isRecord(reward)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_PASS_REWARD_SHAPE_INVALID',
          path: basePath,
          severity: 'error',
          message: 'Each pass reward must be an object.',
          suggestion: 'Set pass reward entries to { seat, resource, amount }.',
        });
        continue;
      }
      validateUnknownKeys(reward, TURN_FLOW_PASS_REWARD_KEYS, basePath, diagnostics, 'pass reward');
      validateIdentifierField(reward, 'seat', `${basePath}.seat`, diagnostics, 'pass reward seat');
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

  if (turnFlow.freeOperationActionIds !== undefined) {
    if (!Array.isArray(turnFlow.freeOperationActionIds)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_FLOW_FREE_OPERATION_ACTION_IDS_INVALID',
        path: 'doc.turnOrder.config.turnFlow.freeOperationActionIds',
        severity: 'error',
        message: 'turnFlow.freeOperationActionIds must be an array of non-empty action ids.',
        suggestion: 'Set freeOperationActionIds to action id strings that may be emitted as free-operation moves.',
      });
    } else {
      for (const [index, actionId] of turnFlow.freeOperationActionIds.entries()) {
        if (typeof actionId !== 'string' || actionId.trim() === '') {
          diagnostics.push({
            code: 'CNL_VALIDATOR_TURN_FLOW_FREE_OPERATION_ACTION_IDS_INVALID',
            path: `doc.turnOrder.config.turnFlow.freeOperationActionIds.${index}`,
            severity: 'error',
            message: 'freeOperationActionIds entries must be non-empty strings.',
            suggestion: 'Replace invalid entry with a declared action id.',
          });
        }
      }
    }
  }

  if (!Array.isArray(turnFlow.durationWindows)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_FLOW_DURATION_WINDOWS_INVALID',
      path: 'doc.turnOrder.config.turnFlow.durationWindows',
      severity: 'error',
      message: 'turnFlow.durationWindows must be an array of duration values.',
      suggestion: `Use values from: ${TURN_FLOW_DURATION_VALUES.join(', ')}.`,
    });
  } else {
    for (const [index, duration] of turnFlow.durationWindows.entries()) {
      if (typeof duration !== 'string' || !(TURN_FLOW_DURATION_VALUES as readonly string[]).includes(duration)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_TURN_FLOW_DURATION_WINDOWS_INVALID',
          path: `doc.turnOrder.config.turnFlow.durationWindows.${index}`,
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
        suggestion: 'Set action pipeline entries to objects with id/actionId/accompanyingOps/compoundParamConstraints/legality/costValidation/costEffects/targeting/stages/atomicity.',
      });
      continue;
    }

    validateUnknownKeys(profile, ACTION_PIPELINE_KEYS, basePath, diagnostics, 'action pipeline');
    validateIdentifierField(profile, 'id', `${basePath}.id`, diagnostics, 'action pipeline id');
    validateIdentifierField(profile, 'actionId', `${basePath}.actionId`, diagnostics, 'action pipeline actionId');
    if (profile.accompanyingOps !== undefined) {
      if (profile.accompanyingOps !== 'any' && !Array.isArray(profile.accompanyingOps)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
          path: `${basePath}.accompanyingOps`,
          severity: 'error',
          message: 'action pipeline accompanyingOps must be "any" or an array of non-empty operation ids.',
          suggestion: 'Set accompanyingOps to "any" or [operationId, ...].',
        });
      } else if (Array.isArray(profile.accompanyingOps)) {
        for (const [opIndex, opId] of profile.accompanyingOps.entries()) {
          if (typeof opId !== 'string' || opId.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
              path: `${basePath}.accompanyingOps.${opIndex}`,
              severity: 'error',
              message: 'accompanyingOps entries must be non-empty strings.',
              suggestion: 'Replace invalid entry with a non-empty operation id string.',
            });
          }
        }
      }
    }
    if (profile.compoundParamConstraints !== undefined) {
      if (!Array.isArray(profile.compoundParamConstraints)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
          path: `${basePath}.compoundParamConstraints`,
          severity: 'error',
          message: 'action pipeline compoundParamConstraints must be an array when provided.',
          suggestion: 'Set compoundParamConstraints to an array of { relation, operationParam, specialActivityParam } entries.',
        });
      } else {
        for (const [constraintIndex, constraint] of profile.compoundParamConstraints.entries()) {
          if (!isRecord(constraint)) {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
              path: `${basePath}.compoundParamConstraints.${constraintIndex}`,
              severity: 'error',
              message: 'compoundParamConstraints entries must be objects.',
              suggestion: 'Replace invalid entries with objects.',
            });
            continue;
          }
          if (constraint.relation !== 'disjoint' && constraint.relation !== 'subset') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
              path: `${basePath}.compoundParamConstraints.${constraintIndex}.relation`,
              severity: 'error',
              message: 'compoundParamConstraints relation must be "disjoint" or "subset".',
              suggestion: 'Set relation to "disjoint" or "subset".',
            });
          }
          if (typeof constraint.operationParam !== 'string' || constraint.operationParam.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
              path: `${basePath}.compoundParamConstraints.${constraintIndex}.operationParam`,
              severity: 'error',
              message: 'compoundParamConstraints operationParam must be a non-empty string.',
              suggestion: 'Set operationParam to an operation move param name.',
            });
          }
          if (typeof constraint.specialActivityParam !== 'string' || constraint.specialActivityParam.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_PIPELINE_REQUIRED_FIELD_INVALID',
              path: `${basePath}.compoundParamConstraints.${constraintIndex}.specialActivityParam`,
              severity: 'error',
              message: 'compoundParamConstraints specialActivityParam must be a non-empty string.',
              suggestion: 'Set specialActivityParam to a special-activity move param name.',
            });
          }
        }
      }
    }

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
