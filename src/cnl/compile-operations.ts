import type { Diagnostic } from '../kernel/diagnostics.js';
import { asActionId } from '../kernel/branded.js';
import type {
  ConditionAST,
  ActionPipelineDef,
  ActionResolutionStageDef,
  ActionTargetingDef,
} from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  isRecord,
  lowerEffectsWithDiagnostics,
  lowerOptionalCondition,
  missingCapabilityDiagnostic,
  normalizeIdentifier,
} from './compile-lowering.js';

/** Bindings injected at runtime by the kernel into every action pipeline. */
const ACTION_PIPELINE_RUNTIME_BINDINGS: readonly string[] = ['__actionClass', '__freeOperation'];

export function lowerActionPipelines(
  rawPipelines: GameSpecDoc['actionPipelines'],
  rawActions: GameSpecDoc['actions'],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly ActionPipelineDef[] | undefined {
  if (rawPipelines === null) {
    return undefined;
  }

  const knownActionIds = new Set<string>();
  for (const action of rawActions ?? []) {
    if (isRecord(action) && typeof action.id === 'string' && action.id.trim() !== '') {
      knownActionIds.add(normalizeIdentifier(action.id));
    }
  }

  const lowered: ActionPipelineDef[] = [];
  const seenPipelineIds = new Set<string>();
  const actionIdCounts = new Map<string, number>();

  for (const [index, rawPipeline] of rawPipelines.entries()) {
    const basePath = `doc.actionPipelines.${index}`;
    if (!isRecord(rawPipeline)) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'action pipeline must be an object.',
        suggestion: 'Provide id/actionId/accompanyingOps/compoundParamConstraints/legality/costValidation/costEffects/targeting/stages/atomicity for each action pipeline.',
      });
      continue;
    }

    const id = typeof rawPipeline.id === 'string' ? normalizeIdentifier(rawPipeline.id) : '';
    if (id.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.id`,
        severity: 'error',
        message: 'action pipeline id is required and must be a non-empty string.',
        suggestion: 'Set actionPipelines[].id to a non-empty identifier.',
      });
      continue;
    }
    if (seenPipelineIds.has(id)) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_DUPLICATE_ID',
        path: `${basePath}.id`,
        severity: 'error',
        message: `Duplicate action pipeline id "${id}" creates ambiguous pipeline lookup.`,
        suggestion: 'Use a unique id per action pipeline.',
      });
      continue;
    }
    seenPipelineIds.add(id);

    const actionId = typeof rawPipeline.actionId === 'string' ? normalizeIdentifier(rawPipeline.actionId) : '';
    if (actionId.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.actionId`,
        severity: 'error',
        message: 'action pipeline actionId is required and must be a non-empty string.',
        suggestion: 'Map each action pipeline to a declared action id.',
      });
      continue;
    }
    if (!knownActionIds.has(actionId)) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_UNKNOWN_ACTION',
        path: `${basePath}.actionId`,
        severity: 'error',
        message: `action pipeline references unknown action "${actionId}".`,
        suggestion: 'Use an action id declared under doc.actions.',
      });
      continue;
    }
    actionIdCounts.set(actionId, (actionIdCounts.get(actionId) ?? 0) + 1);

    if (!isRecord(rawPipeline.targeting)) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${basePath}.targeting`, 'action pipeline targeting object', rawPipeline.targeting, ['object']),
      );
      continue;
    }
    if (!Array.isArray(rawPipeline.stages) || rawPipeline.stages.length === 0) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${basePath}.stages`, 'action pipeline ordered stages', rawPipeline.stages, ['non-empty array']),
      );
      continue;
    }
    if (!rawPipeline.stages.every((stage) => isRecord(stage))) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${basePath}.stages`, 'action pipeline ordered stages', rawPipeline.stages, ['array of objects']),
      );
      continue;
    }

    if (rawPipeline.atomicity !== 'atomic' && rawPipeline.atomicity !== 'partial') {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.atomicity`,
        severity: 'error',
        message: 'action pipeline atomicity is required and must be "atomic" or "partial".',
        suggestion: 'Set atomicity to "atomic" or "partial".',
      });
      continue;
    }

    if (!Array.isArray(rawPipeline.costEffects)) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${basePath}.costEffects`, 'action pipeline cost effects array', rawPipeline.costEffects, ['array']),
      );
      continue;
    }

    let linkedWindows: readonly string[] | undefined;
    if (rawPipeline.linkedWindows !== undefined) {
      if (
        !Array.isArray(rawPipeline.linkedWindows) ||
        rawPipeline.linkedWindows.some((entry) => typeof entry !== 'string' || entry.trim() === '')
      ) {
        diagnostics.push({
          code: 'CNL_COMPILER_ACTION_PIPELINE_LINKED_WINDOWS_INVALID',
          path: `${basePath}.linkedWindows`,
          severity: 'error',
          message: 'linkedWindows must be an array of non-empty strings when provided.',
          suggestion: 'Set linkedWindows to string ids or omit the field.',
        });
        continue;
      }
      linkedWindows = rawPipeline.linkedWindows.map((entry) => normalizeIdentifier(entry));
    }

    let applicability: ConditionAST | undefined;
    const runtimeBindings = [...ACTION_PIPELINE_RUNTIME_BINDINGS];
    if (rawPipeline.applicability !== undefined) {
      const loweredApplicability = lowerOptionalCondition(
        rawPipeline.applicability,
        ownershipByBase,
        runtimeBindings,
        diagnostics,
        `${basePath}.applicability`,
      );
      if (loweredApplicability !== undefined && loweredApplicability !== null) {
        applicability = loweredApplicability;
      }
    }

    let legality: ConditionAST | null = null;
    if (rawPipeline.legality !== undefined) {
      const loweredLegality = lowerOptionalCondition(
        rawPipeline.legality,
        ownershipByBase,
        runtimeBindings,
        diagnostics,
        `${basePath}.legality`,
      );
      if (loweredLegality !== undefined) {
        legality = loweredLegality;
      }
    }

    let costValidation: ConditionAST | null = null;
    if (rawPipeline.costValidation !== undefined) {
      const loweredValidate = lowerOptionalCondition(
        rawPipeline.costValidation,
        ownershipByBase,
        runtimeBindings,
        diagnostics,
        `${basePath}.costValidation`,
      );
      if (loweredValidate !== undefined) {
        costValidation = loweredValidate;
      }
    }

    let accompanyingOps: 'any' | readonly string[] | undefined;
    if (rawPipeline.accompanyingOps !== undefined) {
      if (rawPipeline.accompanyingOps === 'any') {
        accompanyingOps = 'any';
      } else if (
        Array.isArray(rawPipeline.accompanyingOps)
        && rawPipeline.accompanyingOps.every((entry) => typeof entry === 'string' && entry.trim() !== '')
      ) {
        accompanyingOps = rawPipeline.accompanyingOps.map((entry) => normalizeIdentifier(entry));
      } else {
        diagnostics.push({
          code: 'CNL_COMPILER_ACTION_PIPELINE_REQUIRED_FIELD_MISSING',
          path: `${basePath}.accompanyingOps`,
          severity: 'error',
          message: 'action pipeline accompanyingOps must be "any" or an array of non-empty operation ids.',
          suggestion: 'Set accompanyingOps to "any" or [operationId, ...].',
        });
        continue;
      }
    }

    let compoundParamConstraints:
      | readonly {
        readonly relation: 'disjoint';
        readonly operationParam: string;
        readonly specialActivityParam: string;
      }[]
      | undefined;
    if (rawPipeline.compoundParamConstraints !== undefined) {
      if (
        !Array.isArray(rawPipeline.compoundParamConstraints)
        || rawPipeline.compoundParamConstraints.some(
          (entry) =>
            !isRecord(entry)
            || entry.relation !== 'disjoint'
            || typeof entry.operationParam !== 'string'
            || entry.operationParam.trim() === ''
            || typeof entry.specialActivityParam !== 'string'
            || entry.specialActivityParam.trim() === '',
        )
      ) {
        diagnostics.push({
          code: 'CNL_COMPILER_ACTION_PIPELINE_REQUIRED_FIELD_MISSING',
          path: `${basePath}.compoundParamConstraints`,
          severity: 'error',
          message: 'action pipeline compoundParamConstraints must be an array of { relation:\"disjoint\", operationParam, specialActivityParam }.',
          suggestion: 'Provide valid compoundParamConstraints entries or omit the field.',
        });
        continue;
      }
      compoundParamConstraints = rawPipeline.compoundParamConstraints.map((entry) => ({
        relation: 'disjoint',
        operationParam: String(entry.operationParam).trim(),
        specialActivityParam: String(entry.specialActivityParam).trim(),
      }));
    }

    const costEffects = lowerEffectsWithDiagnostics(
      rawPipeline.costEffects,
      ownershipByBase,
      diagnostics,
      `${basePath}.costEffects`,
      runtimeBindings,
    );

    const rawTargeting = rawPipeline.targeting;
    let targetingFilter: ConditionAST | undefined;
    if (rawTargeting.filter !== undefined) {
      const loweredFilter = lowerOptionalCondition(
        rawTargeting.filter,
        ownershipByBase,
        runtimeBindings,
        diagnostics,
        `${basePath}.targeting.filter`,
      );
      if (loweredFilter !== undefined && loweredFilter !== null) {
        targetingFilter = loweredFilter;
      }
    }
    const targeting: ActionTargetingDef = {
      ...(typeof rawTargeting.select === 'string' ? { select: rawTargeting.select as 'upToN' | 'allEligible' | 'exactN' } : {}),
      ...(typeof rawTargeting.max === 'number' ? { max: rawTargeting.max } : {}),
      ...(targetingFilter !== undefined ? { filter: targetingFilter } : {}),
      ...(typeof rawTargeting.order === 'string' ? { order: rawTargeting.order } : {}),
      ...(typeof rawTargeting.tieBreak === 'string' ? { tieBreak: rawTargeting.tieBreak } : {}),
    };

    const stages: ActionResolutionStageDef[] = [];
    let accumulatedBindings: readonly string[] = ACTION_PIPELINE_RUNTIME_BINDINGS;
    for (const [stageIdx, rawStage] of (rawPipeline.stages as Record<string, unknown>[]).entries()) {
      const stagePath = `${basePath}.stages[${stageIdx}]`;
      const loweredEffects = lowerEffectsWithDiagnostics(
        rawStage.effects ?? [],
        ownershipByBase,
        diagnostics,
        `${stagePath}.effects`,
        accumulatedBindings,
      );
      const stageBindings: string[] = [];
      for (const eff of loweredEffects) {
        if ('chooseOne' in eff && typeof eff.chooseOne === 'object' && eff.chooseOne !== null && 'bind' in eff.chooseOne) {
          stageBindings.push((eff.chooseOne as { bind: string }).bind);
        }
        if ('forEach' in eff && typeof eff.forEach === 'object' && eff.forEach !== null && 'bind' in eff.forEach) {
          stageBindings.push((eff.forEach as { bind: string }).bind);
        }
      }
      accumulatedBindings = [...accumulatedBindings, ...stageBindings];
      stages.push({
        ...(typeof rawStage.stage === 'string' ? { stage: rawStage.stage } : {}),
        effects: loweredEffects,
      });
    }

    lowered.push({
      id,
      actionId: asActionId(actionId),
      ...(applicability !== undefined ? { applicability } : {}),
      ...(accompanyingOps === undefined ? {} : { accompanyingOps }),
      ...(compoundParamConstraints === undefined ? {} : { compoundParamConstraints }),
      legality,
      costValidation,
      costEffects,
      targeting,
      stages,
      atomicity: rawPipeline.atomicity,
      ...(linkedWindows === undefined ? {} : { linkedWindows }),
    });
  }

  for (const [actionId, count] of actionIdCounts) {
    if (count <= 1) {
      continue;
    }
    const pipelinesForAction = lowered.filter((pipeline) => String(pipeline.actionId) === actionId);
    const missingApplicability = pipelinesForAction.some((pipeline) => pipeline.applicability === undefined);
    if (missingApplicability) {
      diagnostics.push({
        code: 'CNL_COMPILER_ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS',
        path: 'doc.actionPipelines',
        severity: 'error',
        message: `Multiple action pipelines map to action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple pipelines share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }

  return lowered;
}
