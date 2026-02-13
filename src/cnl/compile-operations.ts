import type { Diagnostic } from '../kernel/diagnostics.js';
import { asActionId } from '../kernel/branded.js';
import type {
  ConditionAST,
  EffectAST,
  OperationCostDef,
  OperationLegalityDef,
  OperationProfileDef,
  OperationResolutionStageDef,
  OperationTargetingDef,
} from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  isRecord,
  lowerEffectsWithDiagnostics,
  lowerOptionalCondition,
  missingCapabilityDiagnostic,
  normalizeIdentifier,
} from './compile-lowering.js';

/** Bindings injected at runtime by the kernel into every operation profile. */
const OPERATION_PROFILE_RUNTIME_BINDINGS: readonly string[] = ['__actionClass', '__freeOperation'];

export function lowerOperationProfiles(
  rawProfiles: GameSpecDoc['operationProfiles'],
  rawActions: GameSpecDoc['actions'],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly OperationProfileDef[] | undefined {
  if (rawProfiles === null) {
    return undefined;
  }

  const knownActionIds = new Set<string>();
  for (const action of rawActions ?? []) {
    if (isRecord(action) && typeof action.id === 'string' && action.id.trim() !== '') {
      knownActionIds.add(normalizeIdentifier(action.id));
    }
  }

  const lowered: OperationProfileDef[] = [];
  const seenProfileIds = new Set<string>();
  const actionIdCounts = new Map<string, number>();

  for (const [index, rawProfile] of rawProfiles.entries()) {
    const basePath = `doc.operationProfiles.${index}`;
    if (!isRecord(rawProfile)) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_INVALID',
        path: basePath,
        severity: 'error',
        message: 'operation profile must be an object.',
        suggestion: 'Provide id/actionId/legality/cost/targeting/resolution/partialExecution for each operation profile.',
      });
      continue;
    }

    const id = typeof rawProfile.id === 'string' ? normalizeIdentifier(rawProfile.id) : '';
    if (id.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.id`,
        severity: 'error',
        message: 'operation profile id is required and must be a non-empty string.',
        suggestion: 'Set operationProfiles[].id to a non-empty identifier.',
      });
      continue;
    }
    if (seenProfileIds.has(id)) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_DUPLICATE_ID',
        path: `${basePath}.id`,
        severity: 'error',
        message: `Duplicate operation profile id "${id}" creates ambiguous profile lookup.`,
        suggestion: 'Use a unique id per operation profile.',
      });
      continue;
    }
    seenProfileIds.add(id);

    const actionId = typeof rawProfile.actionId === 'string' ? normalizeIdentifier(rawProfile.actionId) : '';
    if (actionId.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.actionId`,
        severity: 'error',
        message: 'operation profile actionId is required and must be a non-empty string.',
        suggestion: 'Map each operation profile to a declared action id.',
      });
      continue;
    }
    if (!knownActionIds.has(actionId)) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_UNKNOWN_ACTION',
        path: `${basePath}.actionId`,
        severity: 'error',
        message: `operation profile references unknown action "${actionId}".`,
        suggestion: 'Use an action id declared under doc.actions.',
      });
      continue;
    }
    actionIdCounts.set(actionId, (actionIdCounts.get(actionId) ?? 0) + 1);

    if (!isRecord(rawProfile.legality)) {
      diagnostics.push(missingCapabilityDiagnostic(`${basePath}.legality`, 'operation profile legality object', rawProfile.legality, ['object']));
      continue;
    }
    if (!isRecord(rawProfile.cost)) {
      diagnostics.push(missingCapabilityDiagnostic(`${basePath}.cost`, 'operation profile cost object', rawProfile.cost, ['object']));
      continue;
    }
    if (!isRecord(rawProfile.targeting)) {
      diagnostics.push(missingCapabilityDiagnostic(`${basePath}.targeting`, 'operation profile targeting object', rawProfile.targeting, ['object']));
      continue;
    }
    if (!Array.isArray(rawProfile.resolution) || rawProfile.resolution.length === 0) {
      diagnostics.push(
        missingCapabilityDiagnostic(
          `${basePath}.resolution`,
          'operation profile ordered resolution stages',
          rawProfile.resolution,
          ['non-empty array'],
        ),
      );
      continue;
    }
    if (!rawProfile.resolution.every((stage) => isRecord(stage))) {
      diagnostics.push(
        missingCapabilityDiagnostic(
          `${basePath}.resolution`,
          'operation profile ordered resolution stages',
          rawProfile.resolution,
          ['array of objects'],
        ),
      );
      continue;
    }

    const partialExecution = rawProfile.partialExecution;
    if (!isRecord(partialExecution) || (partialExecution.mode !== 'forbid' && partialExecution.mode !== 'allow')) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_REQUIRED_FIELD_MISSING',
        path: `${basePath}.partialExecution.mode`,
        severity: 'error',
        message: 'operation profile partialExecution.mode is required and must be "forbid" or "allow".',
        suggestion: 'Set partialExecution.mode to "forbid" or "allow".',
      });
      continue;
    }

    let linkedSpecialActivityWindows: readonly string[] | undefined;
    if (rawProfile.linkedSpecialActivityWindows !== undefined) {
      if (
        !Array.isArray(rawProfile.linkedSpecialActivityWindows) ||
        rawProfile.linkedSpecialActivityWindows.some((entry) => typeof entry !== 'string' || entry.trim() === '')
      ) {
        diagnostics.push({
          code: 'CNL_COMPILER_OPERATION_PROFILE_LINKED_WINDOWS_INVALID',
          path: `${basePath}.linkedSpecialActivityWindows`,
          severity: 'error',
          message: 'linkedSpecialActivityWindows must be an array of non-empty strings when provided.',
          suggestion: 'Set linkedSpecialActivityWindows to string ids or omit the field.',
        });
        continue;
      }
      linkedSpecialActivityWindows = rawProfile.linkedSpecialActivityWindows.map((entry) => normalizeIdentifier(entry));
    }

    // Lower applicability (optional — required when multiple profiles share an actionId)
    let applicability: ConditionAST | undefined;
    const runtimeBindings = [...OPERATION_PROFILE_RUNTIME_BINDINGS];
    if (rawProfile.applicability !== undefined) {
      const loweredApplicability = lowerOptionalCondition(rawProfile.applicability, ownershipByBase, runtimeBindings, diagnostics, `${basePath}.applicability`);
      if (loweredApplicability !== undefined && loweredApplicability !== null) {
        applicability = loweredApplicability;
      }
    }

    // Lower legality
    const rawLegality = rawProfile.legality;
    let legalityWhen: ConditionAST | undefined;
    if (rawLegality.when !== undefined) {
      const loweredWhen = lowerOptionalCondition(rawLegality.when, ownershipByBase, runtimeBindings, diagnostics, `${basePath}.legality.when`);
      if (loweredWhen !== undefined && loweredWhen !== null) {
        legalityWhen = loweredWhen;
      }
    }
    const legality: OperationLegalityDef = {
      ...(legalityWhen !== undefined ? { when: legalityWhen } : {}),
    };

    // Lower cost
    const rawCost = rawProfile.cost;
    let costValidate: ConditionAST | undefined;
    let costSpend: readonly EffectAST[] | undefined;
    if (rawCost.validate !== undefined) {
      const loweredValidate = lowerOptionalCondition(rawCost.validate, ownershipByBase, runtimeBindings, diagnostics, `${basePath}.cost.validate`);
      if (loweredValidate !== undefined && loweredValidate !== null) {
        costValidate = loweredValidate;
      }
    }
    if (rawCost.spend !== undefined) {
      const loweredSpend = lowerEffectsWithDiagnostics(rawCost.spend, ownershipByBase, diagnostics, `${basePath}.cost.spend`, runtimeBindings);
      if (loweredSpend.length > 0) {
        costSpend = loweredSpend;
      }
    }
    const cost: OperationCostDef = {
      ...(costValidate !== undefined ? { validate: costValidate } : {}),
      ...(costSpend !== undefined ? { spend: costSpend } : {}),
    };

    // Lower targeting
    const rawTargeting = rawProfile.targeting;
    let targetingFilter: ConditionAST | undefined;
    if (rawTargeting.filter !== undefined) {
      const loweredFilter = lowerOptionalCondition(rawTargeting.filter, ownershipByBase, runtimeBindings, diagnostics, `${basePath}.targeting.filter`);
      if (loweredFilter !== undefined && loweredFilter !== null) {
        targetingFilter = loweredFilter;
      }
    }
    const targeting: OperationTargetingDef = {
      ...(typeof rawTargeting.select === 'string' ? { select: rawTargeting.select as 'upToN' | 'allEligible' | 'exactN' } : {}),
      ...(typeof rawTargeting.max === 'number' ? { max: rawTargeting.max } : {}),
      ...(targetingFilter !== undefined ? { filter: targetingFilter } : {}),
      ...(typeof rawTargeting.order === 'string' ? { order: rawTargeting.order } : {}),
      ...(typeof rawTargeting.tieBreak === 'string' ? { tieBreak: rawTargeting.tieBreak } : {}),
    };

    // Lower resolution stages — bindings from chooseOne/forEach in
    // earlier stages flow forward so later stages can reference them.
    // Seed with runtime-injected bindings available to all operation profiles.
    const resolution: OperationResolutionStageDef[] = [];
    let accumulatedBindings: readonly string[] = OPERATION_PROFILE_RUNTIME_BINDINGS;
    for (const [stageIdx, rawStage] of (rawProfile.resolution as Record<string, unknown>[]).entries()) {
      const stagePath = `${basePath}.resolution[${stageIdx}]`;
      const loweredEffects = lowerEffectsWithDiagnostics(
        rawStage.effects ?? [],
        ownershipByBase,
        diagnostics,
        `${stagePath}.effects`,
        accumulatedBindings,
      );
      // Collect top-level bindings introduced by this stage.
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
      const stage: OperationResolutionStageDef = {
        ...(typeof rawStage.stage === 'string' ? { stage: rawStage.stage } : {}),
        effects: loweredEffects,
      };
      resolution.push(stage);
    }

    lowered.push({
      id,
      actionId: asActionId(actionId),
      ...(applicability !== undefined ? { applicability } : {}),
      legality,
      cost,
      targeting,
      resolution,
      partialExecution: { mode: partialExecution.mode },
      ...(linkedSpecialActivityWindows === undefined ? {} : { linkedSpecialActivityWindows }),
    });
  }

  // Post-loop: when multiple profiles share an actionId, all must have applicability
  for (const [actionId, count] of actionIdCounts) {
    if (count <= 1) {
      continue;
    }
    const profilesForAction = lowered.filter((p) => String(p.actionId) === actionId);
    const missingApplicability = profilesForAction.some((p) => p.applicability === undefined);
    if (missingApplicability) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS',
        path: 'doc.operationProfiles',
        severity: 'error',
        message: `Multiple operation profiles map to action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple profiles share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }

  return lowered;
}
