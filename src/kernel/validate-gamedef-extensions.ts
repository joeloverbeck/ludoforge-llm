import type { Diagnostic } from './diagnostics.js';
import type { ConditionAST, GameDef, ValueExpr } from './types.js';
import { validateConditionAst, validateValueExpr } from './validate-gamedef-behavior.js';
import { type ValidationContext, checkDuplicateIds, pushMissingReferenceDiagnostic } from './validate-gamedef-structure.js';

export const validateCoupPlan = (diagnostics: Diagnostic[], def: GameDef): void => {
  const coupPlan = def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config.coupPlan : undefined;
  if (!coupPlan) {
    return;
  }

  if (coupPlan.phases.length === 0) {
    diagnostics.push({
      code: 'COUP_PLAN_PHASES_EMPTY',
      path: 'turnOrder.config.coupPlan.phases',
      severity: 'error',
      message: 'coupPlan.phases must include at least one phase definition.',
      suggestion: 'Declare one or more deterministic coup phases.',
    });
    return;
  }

  checkDuplicateIds(
    diagnostics,
    coupPlan.phases.map((phase) => phase.id),
    'DUPLICATE_COUP_PLAN_PHASE_ID',
    'coup phase id',
    'turnOrder.config.coupPlan.phases',
  );

  coupPlan.phases.forEach((phase, phaseIndex) => {
    if (phase.steps.length === 0) {
      diagnostics.push({
        code: 'COUP_PLAN_PHASE_STEPS_EMPTY',
        path: `turnOrder.config.coupPlan.phases[${phaseIndex}].steps`,
        severity: 'error',
        message: `coupPlan phase "${phase.id}" must declare at least one step.`,
        suggestion: 'Add one or more deterministic symbolic step ids.',
      });
    }
  });

  if (
    coupPlan.maxConsecutiveRounds !== undefined &&
    (!Number.isInteger(coupPlan.maxConsecutiveRounds) || coupPlan.maxConsecutiveRounds < 1)
  ) {
    diagnostics.push({
      code: 'COUP_PLAN_MAX_CONSECUTIVE_INVALID',
      path: 'turnOrder.config.coupPlan.maxConsecutiveRounds',
      severity: 'error',
      message: `coupPlan.maxConsecutiveRounds must be an integer >= 1; received ${coupPlan.maxConsecutiveRounds}.`,
      suggestion: 'Set maxConsecutiveRounds to 1 or greater.',
    });
  }

  const declaredPhases = new Set(coupPlan.phases.map((phase) => phase.id));
  coupPlan.finalRoundOmitPhases?.forEach((phaseId, index) => {
    if (!declaredPhases.has(phaseId)) {
      diagnostics.push({
        code: 'COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE',
        path: `turnOrder.config.coupPlan.finalRoundOmitPhases[${index}]`,
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

export const validateActionPipelines = (
  diagnostics: Diagnostic[],
  def: GameDef,
  actionCandidates: readonly string[],
): void => {
  const operationActionIdCounts = new Map<string, number>();
  def.actionPipelines?.forEach((actionPipeline, actionPipelineIndex) => {
    const basePath = `actionPipelines[${actionPipelineIndex}]`;

    if (!actionCandidates.includes(actionPipeline.actionId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_ACTION_MISSING',
        `${basePath}.actionId`,
        `Unknown action "${actionPipeline.actionId}".`,
        actionPipeline.actionId,
        actionCandidates,
      );
    }

    operationActionIdCounts.set(actionPipeline.actionId, (operationActionIdCounts.get(actionPipeline.actionId) ?? 0) + 1);

    if (actionPipeline.stages.length === 0) {
      diagnostics.push({
        code: 'ACTION_PIPELINE_STAGES_EMPTY',
        path: `${basePath}.stages`,
        severity: 'error',
        message: 'Action pipeline stages must contain at least one stage.',
        suggestion: 'Declare one or more deterministic stages.',
      });
    }

    if (actionPipeline.atomicity !== 'atomic' && actionPipeline.atomicity !== 'partial') {
      diagnostics.push({
        code: 'ACTION_PIPELINE_ATOMICITY_INVALID',
        path: `${basePath}.atomicity`,
        severity: 'error',
        message: `Unsupported action pipeline atomicity "${actionPipeline.atomicity}".`,
        suggestion: 'Use "atomic" or "partial".',
      });
    }
  });

  for (const [actionId, count] of operationActionIdCounts) {
    if (count <= 1) {
      continue;
    }
    const profilesForAction = (def.actionPipelines ?? []).filter((profile) => profile.actionId === actionId);
    const missingApplicability = profilesForAction.some((profile) => profile.applicability === undefined);
    if (missingApplicability) {
      diagnostics.push({
        code: 'ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS',
        path: 'actionPipelines',
        severity: 'error',
        message: `Multiple action pipelines map to action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple pipelines share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }
};
