import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { validateActions, validateTerminal, validateTurnStructure } from './validate-actions.js';
import {
  validateActionPipelines,
  validateDataAssets,
  validateEventDecks,
  validateScoring,
  validateTurnOrder,
  dropZoneMissingDiagnostic,
} from './validate-extensions.js';
import { validateMetadata, validateVariables } from './validate-metadata.js';
import {
  TRIGGER_EVENT_KEYS,
  TRIGGER_KEYS,
  compareDiagnostics,
  isRecord,
  normalizeIdentifier,
  optionalIdentifierField,
  pushDuplicateNormalizedIdDiagnostics,
  pushMissingReferenceDiagnostic,
  validateUnknownKeys,
} from './validate-spec-shared.js';
import { validateZones } from './validate-zones.js';

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
  validateTurnOrder(doc, diagnostics);
  validateActionPipelines(doc, actionIds, diagnostics);
  validateEventDecks(doc, diagnostics);
  validateScoring(doc, diagnostics);

  validateCrossReferences(doc, zoneIds, actionIds, phaseIds, diagnostics);
  validateDuplicateIdentifiers(doc, diagnostics);
  validateTerminal(doc, diagnostics);

  diagnostics.sort((left, right) => compareDiagnostics(left, right, options?.sourceMap));
  return diagnostics;
}

function validateRequiredSections(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  const requiredSections: ReadonlyArray<keyof Pick<
    GameSpecDoc,
    'metadata' | 'zones' | 'turnStructure' | 'actions' | 'terminal'
  >> = ['metadata', 'zones', 'turnStructure', 'actions', 'terminal'];

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
      if (!isRecord(action)) {
        continue;
      }

      const phaseValues: string[] =
        typeof action.phase === 'string'
          ? (action.phase.trim() === '' ? [] : [action.phase])
          : Array.isArray(action.phase)
            ? action.phase.filter((phase): phase is string => typeof phase === 'string' && phase.trim() !== '')
            : [];

      for (const [phaseIndex, phase] of phaseValues.entries()) {
        const normalizedPhase = normalizeIdentifier(phase);
        if (phaseIdSet.has(normalizedPhase)) {
          continue;
        }
        const path = Array.isArray(action.phase) ? `${basePath}.phase.${phaseIndex}` : `${basePath}.phase`;
        pushMissingReferenceDiagnostic(
          diagnostics,
          'CNL_VALIDATOR_REFERENCE_MISSING',
          path,
          `Unknown phase "${phase}".`,
          normalizedPhase,
          phaseIds,
          'Use one of the declared phase ids.',
        );
      }
    }
  }

  if (doc.actionPipelines !== null) {
    const actionPipelineIds = doc.actionPipelines
      .map((profile) => (isRecord(profile) && typeof profile.id === 'string' ? normalizeIdentifier(profile.id) : undefined))
      .filter((value): value is string => value !== undefined && value.length > 0);
    pushDuplicateNormalizedIdDiagnostics(diagnostics, actionPipelineIds, 'doc.actionPipelines', 'action pipeline id');
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
