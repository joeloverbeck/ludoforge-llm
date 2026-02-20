import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  ACTION_KEYS,
  END_CONDITION_KEYS,
  PHASE_KEYS,
  TERMINAL_KEYS,
  TURN_STRUCTURE_KEYS,
  isRecord,
  normalizeIdentifier,
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
        suggestion: 'Provide action fields id, actor, executor, phase, and effects.',
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

    if (!('executor' in action) || action.executor === undefined || action.executor === null) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
        path: `${basePath}.executor`,
        severity: 'error',
        message: 'Action field "executor" is required.',
        suggestion: 'Set action.executor to a valid executor selector.',
      });
    }

    const hasValidPhaseArray =
      Array.isArray(action.phase) &&
      action.phase.length > 0 &&
      action.phase.every((phase) => typeof phase === 'string' && phase.trim() !== '');
    if (!hasValidPhaseArray) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
        path: `${basePath}.phase`,
        severity: 'error',
        message: 'Action field "phase" must be a non-empty array of phase ids.',
        suggestion: 'Set action.phase to a non-empty list of phase ids.',
      });
    } else {
      const normalizedSeen = new Set<string>();
      for (const [phaseIndex, phase] of action.phase.entries()) {
        const normalized = normalizeIdentifier(phase);
        if (normalizedSeen.has(normalized)) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_ACTION_PHASE_DUPLICATE',
            path: `${basePath}.phase.${phaseIndex}`,
            severity: 'error',
            message: `Duplicate action phase "${normalized}" after normalization.`,
            suggestion: 'Keep each phase id unique within action.phase.',
          });
          continue;
        }
        normalizedSeen.add(normalized);
      }
    }

    if (action.capabilities !== undefined) {
      if (!Array.isArray(action.capabilities)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_ACTION_CAPABILITIES_INVALID',
          path: `${basePath}.capabilities`,
          severity: 'error',
          message: 'Action field "capabilities" must be an array of non-empty strings when provided.',
          suggestion: 'Set action.capabilities to capability id strings (for example ["cardEvent"]).',
        });
      } else {
        const normalizedSeen = new Set<string>();
        for (const [capabilityIndex, capability] of action.capabilities.entries()) {
          if (typeof capability !== 'string' || capability.trim() === '') {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_CAPABILITIES_INVALID',
              path: `${basePath}.capabilities.${capabilityIndex}`,
              severity: 'error',
              message: 'Action capability ids must be non-empty strings.',
              suggestion: 'Set each capability id to a non-empty string.',
            });
            continue;
          }
          const normalized = capability.normalize('NFC');
          if (normalizedSeen.has(normalized)) {
            diagnostics.push({
              code: 'CNL_VALIDATOR_ACTION_CAPABILITIES_DUPLICATE',
              path: `${basePath}.capabilities.${capabilityIndex}`,
              severity: 'error',
              message: `Duplicate action capability "${normalized}" after NFC normalization.`,
              suggestion: 'Keep each capability id unique within action.capabilities.',
            });
            continue;
          }
          normalizedSeen.add(normalized);
        }
      }
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

export function validateAuthoredMacroOriginBoundary(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  validateEffectArrayForAuthoredMacroOrigin(doc.setup, 'doc.setup', diagnostics);

  if (doc.actions !== null) {
    for (const [index, action] of doc.actions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      validateEffectArrayForAuthoredMacroOrigin(action.cost, `doc.actions.${index}.cost`, diagnostics);
      validateEffectArrayForAuthoredMacroOrigin(action.effects, `doc.actions.${index}.effects`, diagnostics);
    }
  }

  if (doc.triggers !== null) {
    for (const [index, trigger] of doc.triggers.entries()) {
      if (!isRecord(trigger)) {
        continue;
      }
      validateEffectArrayForAuthoredMacroOrigin(trigger.effects, `doc.triggers.${index}.effects`, diagnostics);
    }
  }

  if (isRecord(doc.turnStructure)) {
    const validatePhases = (source: unknown, basePath: string): void => {
      if (!Array.isArray(source)) {
        return;
      }
      for (const [index, phase] of source.entries()) {
        if (!isRecord(phase)) {
          continue;
        }
        validateEffectArrayForAuthoredMacroOrigin(phase.onEnter, `${basePath}.${index}.onEnter`, diagnostics);
        validateEffectArrayForAuthoredMacroOrigin(phase.onExit, `${basePath}.${index}.onExit`, diagnostics);
      }
    };
    validatePhases(doc.turnStructure.phases, 'doc.turnStructure.phases');
    validatePhases(doc.turnStructure.interrupts, 'doc.turnStructure.interrupts');
  }

  if (doc.actionPipelines !== null) {
    for (const [pipelineIndex, pipeline] of doc.actionPipelines.entries()) {
      if (!isRecord(pipeline)) {
        continue;
      }
      validateEffectArrayForAuthoredMacroOrigin(
        pipeline.costEffects,
        `doc.actionPipelines.${pipelineIndex}.costEffects`,
        diagnostics,
      );
      if (!Array.isArray(pipeline.stages)) {
        continue;
      }
      for (const [stageIndex, stage] of pipeline.stages.entries()) {
        if (!isRecord(stage)) {
          continue;
        }
        validateEffectArrayForAuthoredMacroOrigin(
          stage.effects,
          `doc.actionPipelines.${pipelineIndex}.stages.${stageIndex}.effects`,
          diagnostics,
        );
      }
    }
  }
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

  if (turnStructure.interrupts !== undefined) {
    if (!Array.isArray(turnStructure.interrupts)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_TURN_STRUCTURE_INTERRUPTS_INVALID',
        path: 'doc.turnStructure.interrupts',
        severity: 'error',
        message: 'turnStructure.interrupts must be an array when provided.',
        suggestion: 'Define interrupt phases as an array of objects with at least an id field.',
      });
    } else {
      for (const [phaseIndex, phase] of turnStructure.interrupts.entries()) {
        const phasePath = `doc.turnStructure.interrupts.${phaseIndex}`;
        if (!isRecord(phase)) {
          diagnostics.push({
            code: 'CNL_VALIDATOR_TURN_STRUCTURE_PHASE_SHAPE_INVALID',
            path: phasePath,
            severity: 'error',
            message: 'Each turnStructure.interrupts entry must be an object.',
            suggestion: 'Set interrupt entries to objects with at least an id field.',
          });
          continue;
        }

        validateUnknownKeys(phase, PHASE_KEYS, phasePath, diagnostics, 'phase');
        const phaseId = validateIdentifierField(phase, 'id', `${phasePath}.id`, diagnostics, 'interrupt phase id');
        if (phaseId !== undefined) {
          collectedPhaseIds.push(phaseId);
        }
      }
    }
  }

  return uniqueSorted(collectedPhaseIds);
}

export function validateTerminal(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.terminal === null || !isRecord(doc.terminal)) {
    return;
  }

  validateUnknownKeys(doc.terminal, TERMINAL_KEYS, 'doc.terminal', diagnostics, 'terminal');

  if (!Array.isArray(doc.terminal.conditions)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_TERMINAL_CONDITIONS_INVALID',
      path: 'doc.terminal.conditions',
      severity: 'error',
      message: 'terminal.conditions must be an array.',
      suggestion: 'Set terminal.conditions to an array of end-condition objects.',
    });
    return;
  }

  for (const [index, endCondition] of doc.terminal.conditions.entries()) {
    if (!isRecord(endCondition)) {
      continue;
    }
    validateUnknownKeys(endCondition, END_CONDITION_KEYS, `doc.terminal.conditions.${index}`, diagnostics, 'end condition');
  }
}

function validateEffectArrayForAuthoredMacroOrigin(
  effects: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(effects)) {
    return;
  }
  for (const [index, effect] of effects.entries()) {
    validateEffectNodeForAuthoredMacroOrigin(effect, `${path}.${index}`, diagnostics);
  }
}

function validateEffectNodeForAuthoredMacroOrigin(
  node: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (Array.isArray(node)) {
    for (const [index, entry] of node.entries()) {
      validateEffectNodeForAuthoredMacroOrigin(entry, `${path}.${index}`, diagnostics);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }

  if (isRecord(node.forEach) && Object.prototype.hasOwnProperty.call(node.forEach, 'macroOrigin')) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_EFFECT_MACRO_ORIGIN_FORBIDDEN',
      path: `${path}.forEach.macroOrigin`,
      severity: 'error',
      message: 'forEach.macroOrigin is compiler-owned metadata and cannot be authored in GameSpecDoc.',
      suggestion: 'Remove forEach.macroOrigin from authored YAML; compiler expansion emits provenance.',
    });
  }
  if (isRecord(node.reduce) && Object.prototype.hasOwnProperty.call(node.reduce, 'macroOrigin')) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_EFFECT_MACRO_ORIGIN_FORBIDDEN',
      path: `${path}.reduce.macroOrigin`,
      severity: 'error',
      message: 'reduce.macroOrigin is compiler-owned metadata and cannot be authored in GameSpecDoc.',
      suggestion: 'Remove reduce.macroOrigin from authored YAML; compiler expansion emits provenance.',
    });
  }

  for (const [key, value] of Object.entries(node)) {
    validateEffectNodeForAuthoredMacroOrigin(value, `${path}.${key}`, diagnostics);
  }
}
