import type { Diagnostic } from './diagnostics.js';
import type { ConditionAST, GameDef, ValueExpr } from './types.js';
import { validateConditionAst, validateValueExpr } from './validate-gamedef-behavior.js';
import { type ValidationContext, checkDuplicateIds, pushMissingReferenceDiagnostic } from './validate-gamedef-structure.js';

export const validateCoupPlan = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (!def.coupPlan) {
    return;
  }

  checkDuplicateIds(
    diagnostics,
    def.coupPlan.phases.map((phase) => phase.id),
    'DUPLICATE_COUP_PLAN_PHASE_ID',
    'coup phase id',
    'coupPlan.phases',
  );

  def.coupPlan.phases.forEach((phase, phaseIndex) => {
    if (phase.steps.length === 0) {
      diagnostics.push({
        code: 'COUP_PLAN_PHASE_STEPS_EMPTY',
        path: `coupPlan.phases[${phaseIndex}].steps`,
        severity: 'error',
        message: `coupPlan phase "${phase.id}" must declare at least one step.`,
        suggestion: 'Add one or more deterministic symbolic step ids.',
      });
    }
  });

  if (
    def.coupPlan.maxConsecutiveRounds !== undefined &&
    (!Number.isInteger(def.coupPlan.maxConsecutiveRounds) || def.coupPlan.maxConsecutiveRounds < 1)
  ) {
    diagnostics.push({
      code: 'COUP_PLAN_MAX_CONSECUTIVE_INVALID',
      path: 'coupPlan.maxConsecutiveRounds',
      severity: 'error',
      message: `coupPlan.maxConsecutiveRounds must be an integer >= 1; received ${def.coupPlan.maxConsecutiveRounds}.`,
      suggestion: 'Set maxConsecutiveRounds to 1 or greater.',
    });
  }

  const declaredPhases = new Set(def.coupPlan.phases.map((phase) => phase.id));
  def.coupPlan.finalRoundOmitPhases?.forEach((phaseId, index) => {
    if (!declaredPhases.has(phaseId)) {
      diagnostics.push({
        code: 'COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE',
        path: `coupPlan.finalRoundOmitPhases[${index}]`,
        severity: 'error',
        message: `Unknown coupPlan phase id "${phaseId}" in finalRoundOmitPhases.`,
        suggestion: 'Reference ids declared in coupPlan.phases.',
      });
    }
  });
};

export const validateVictory = (diagnostics: Diagnostic[], def: GameDef, context: ValidationContext): void => {
  if (!def.victory) {
    return;
  }

  if (def.victory.checkpoints.length === 0) {
    diagnostics.push({
      code: 'VICTORY_CHECKPOINTS_EMPTY',
      path: 'victory.checkpoints',
      severity: 'error',
      message: 'victory.checkpoints must include at least one checkpoint definition.',
      suggestion: 'Define one or more deterministic checkpoint entries.',
    });
  }

  checkDuplicateIds(
    diagnostics,
    def.victory.checkpoints.map((checkpoint) => checkpoint.id),
    'DUPLICATE_VICTORY_CHECKPOINT_ID',
    'victory checkpoint id',
    'victory.checkpoints',
  );

  def.victory.checkpoints.forEach((checkpoint, index) => {
    if (typeof checkpoint.when !== 'object' || checkpoint.when === null || Array.isArray(checkpoint.when)) {
      diagnostics.push({
        code: 'VICTORY_CHECKPOINT_WHEN_INVALID',
        path: `victory.checkpoints[${index}].when`,
        severity: 'error',
        message: 'victory checkpoint "when" must be a condition object.',
        suggestion: 'Set checkpoint.when to a valid Condition AST object.',
      });
      return;
    }
    validateConditionAst(diagnostics, checkpoint.when as ConditionAST, `victory.checkpoints[${index}].when`, context);
  });

  def.victory.margins?.forEach((margin, index) => {
    const isLiteral =
      typeof margin.value === 'number' || typeof margin.value === 'string' || typeof margin.value === 'boolean';
    const isObject = typeof margin.value === 'object' && margin.value !== null && !Array.isArray(margin.value);
    if (!isLiteral && !isObject) {
      diagnostics.push({
        code: 'VICTORY_MARGIN_VALUE_INVALID',
        path: `victory.margins[${index}].value`,
        severity: 'error',
        message: 'victory margin value must be a ValueExpr-compatible literal or object.',
        suggestion: 'Use a literal or ValueExpr object.',
      });
      return;
    }
    validateValueExpr(diagnostics, margin.value as ValueExpr, `victory.margins[${index}].value`, context);
  });
};

export const validateOperationProfiles = (
  diagnostics: Diagnostic[],
  def: GameDef,
  actionCandidates: readonly string[],
): void => {
  const operationActionIdCounts = new Map<string, number>();
  def.operationProfiles?.forEach((operationProfile, operationProfileIndex) => {
    const basePath = `operationProfiles[${operationProfileIndex}]`;

    if (!actionCandidates.includes(operationProfile.actionId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_ACTION_MISSING',
        `${basePath}.actionId`,
        `Unknown action "${operationProfile.actionId}".`,
        operationProfile.actionId,
        actionCandidates,
      );
    }

    operationActionIdCounts.set(operationProfile.actionId, (operationActionIdCounts.get(operationProfile.actionId) ?? 0) + 1);

    if (operationProfile.resolution.length === 0) {
      diagnostics.push({
        code: 'OPERATION_PROFILE_RESOLUTION_EMPTY',
        path: `${basePath}.resolution`,
        severity: 'error',
        message: 'Operation profile resolution must contain at least one stage.',
        suggestion: 'Declare one or more deterministic resolution stages.',
      });
    }

    if (operationProfile.partialExecution.mode !== 'forbid' && operationProfile.partialExecution.mode !== 'allow') {
      diagnostics.push({
        code: 'OPERATION_PROFILE_PARTIAL_EXECUTION_MODE_INVALID',
        path: `${basePath}.partialExecution.mode`,
        severity: 'error',
        message: `Unsupported partial execution mode "${operationProfile.partialExecution.mode}".`,
        suggestion: 'Use "forbid" or "allow".',
      });
    }
  });

  for (const [actionId, count] of operationActionIdCounts) {
    if (count <= 1) {
      continue;
    }
    const profilesForAction = (def.operationProfiles ?? []).filter((profile) => profile.actionId === actionId);
    const missingApplicability = profilesForAction.some((profile) => profile.applicability === undefined);
    if (missingApplicability) {
      diagnostics.push({
        code: 'OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS',
        path: 'operationProfiles',
        severity: 'error',
        message: `Multiple operation profiles map to action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple profiles share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }
};
