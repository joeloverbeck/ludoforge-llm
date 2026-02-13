import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  ACTION_KEYS,
  END_CONDITION_KEYS,
  PHASE_KEYS,
  TURN_STRUCTURE_KEYS,
  isRecord,
  uniqueSorted,
  validateIdentifierField,
  validateUnknownKeys,
} from './validate-spec-shared.js';

export function validateActions(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
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

export function validateTurnStructure(doc: GameSpecDoc, diagnostics: Diagnostic[]): readonly string[] {
  const collectedPhaseIds: string[] = [];
  const turnStructure = doc.turnStructure;
  if (!isRecord(turnStructure)) {
    return collectedPhaseIds;
  }

  validateUnknownKeys(turnStructure, TURN_STRUCTURE_KEYS, 'doc.turnStructure', diagnostics, 'turnStructure');
  if ('activePlayerOrder' in turnStructure) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED',
      path: 'doc.turnStructure.activePlayerOrder',
      severity: 'error',
      message: 'turnStructure.activePlayerOrder is no longer supported.',
      suggestion: 'Move sequencing to doc.turnOrder and remove activePlayerOrder.',
    });
  }

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

  return uniqueSorted(collectedPhaseIds);
}

export function validateEndConditions(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
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
