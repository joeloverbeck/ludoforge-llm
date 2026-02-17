import type { Diagnostic } from '../kernel/diagnostics.js';
import type { CoupPlanDef, TerminalEvaluationDef } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord } from './compile-lowering.js';

export function lowerCoupPlan(
  rawCoupPlan: unknown,
  diagnostics: Diagnostic[],
  pathPrefix = 'doc.coupPlan',
): CoupPlanDef | undefined {
  if (rawCoupPlan === null) {
    return undefined;
  }

  if (!isRecord(rawCoupPlan)) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_INVALID',
      path: pathPrefix,
      severity: 'error',
      message: 'coupPlan must be an object when declared.',
      suggestion: 'Provide coupPlan.phases and optional finalRoundOmitPhases/maxConsecutiveRounds.',
    });
    return undefined;
  }

  if (!Array.isArray(rawCoupPlan.phases)) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_REQUIRED_FIELD_MISSING',
      path: `${pathPrefix}.phases`,
      severity: 'error',
      message: 'coupPlan.phases is required and must be an array.',
      suggestion: 'Define coupPlan.phases as an ordered list of phase objects.',
    });
    return undefined;
  }

  if (rawCoupPlan.phases.length === 0) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_PHASES_EMPTY',
      path: `${pathPrefix}.phases`,
      severity: 'error',
      message: 'coupPlan.phases must include at least one phase definition.',
      suggestion: 'Define one or more coup phases with stable id/steps entries.',
    });
    return undefined;
  }

  const seenPhaseIds = new Set<string>();
  for (const [index, phase] of rawCoupPlan.phases.entries()) {
    const phasePath = `${pathPrefix}.phases.${index}`;
    if (!isRecord(phase)) {
      diagnostics.push({
        code: 'CNL_COMPILER_COUP_PLAN_PHASE_INVALID',
        path: phasePath,
        severity: 'error',
        message: 'coupPlan phase entries must be objects.',
        suggestion: 'Provide phase.id and phase.steps.',
      });
      continue;
    }

    if (typeof phase.id !== 'string' || phase.id.trim() === '') {
      diagnostics.push({
        code: 'CNL_COMPILER_COUP_PLAN_PHASE_ID_INVALID',
        path: `${phasePath}.id`,
        severity: 'error',
        message: 'coupPlan phase id must be a non-empty string.',
        suggestion: 'Set phase.id to a stable identifier.',
      });
    } else if (seenPhaseIds.has(phase.id)) {
      diagnostics.push({
        code: 'CNL_COMPILER_COUP_PLAN_PHASE_DUPLICATE',
        path: `${phasePath}.id`,
        severity: 'error',
        message: `Duplicate coupPlan phase id "${phase.id}".`,
        suggestion: 'Declare each coup phase id exactly once.',
      });
    } else {
      seenPhaseIds.add(phase.id);
    }

    if (
      !Array.isArray(phase.steps) ||
      phase.steps.length === 0 ||
      phase.steps.some((step) => typeof step !== 'string' || step.trim() === '')
    ) {
      diagnostics.push({
        code: 'CNL_COMPILER_COUP_PLAN_PHASE_STEPS_INVALID',
        path: `${phasePath}.steps`,
        severity: 'error',
        message: 'coupPlan phase steps must be a non-empty array of non-empty strings.',
        suggestion: 'Provide ordered symbolic step ids for each phase.',
      });
    }
  }

  const maxConsecutiveRounds = rawCoupPlan.maxConsecutiveRounds;
  if (
    maxConsecutiveRounds !== undefined &&
    (typeof maxConsecutiveRounds !== 'number' || !Number.isInteger(maxConsecutiveRounds) || maxConsecutiveRounds < 1)
  ) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_MAX_CONSECUTIVE_INVALID',
      path: `${pathPrefix}.maxConsecutiveRounds`,
      severity: 'error',
      message: 'coupPlan.maxConsecutiveRounds must be an integer >= 1 when declared.',
      suggestion: 'Set maxConsecutiveRounds to 1 or greater.',
    });
  }

  const declaredPhaseIds = new Set(
    rawCoupPlan.phases
      .filter((phase): phase is { readonly id: string } => isRecord(phase) && typeof phase.id === 'string' && phase.id.trim() !== '')
      .map((phase) => phase.id),
  );

  if (rawCoupPlan.finalRoundOmitPhases !== undefined) {
    if (!Array.isArray(rawCoupPlan.finalRoundOmitPhases)) {
      diagnostics.push({
        code: 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_INVALID',
        path: `${pathPrefix}.finalRoundOmitPhases`,
        severity: 'error',
        message: 'coupPlan.finalRoundOmitPhases must be an array of phase ids when declared.',
        suggestion: 'Set finalRoundOmitPhases to an array of coupPlan phase ids.',
      });
    } else {
      for (const [index, phaseId] of rawCoupPlan.finalRoundOmitPhases.entries()) {
        if (typeof phaseId !== 'string' || phaseId.trim() === '') {
          diagnostics.push({
            code: 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_INVALID',
            path: `${pathPrefix}.finalRoundOmitPhases.${index}`,
            severity: 'error',
            message: 'finalRoundOmitPhases entries must be non-empty strings.',
            suggestion: 'Use coupPlan phase ids.',
          });
          continue;
        }

        if (!declaredPhaseIds.has(phaseId)) {
          diagnostics.push({
            code: 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE',
            path: `${pathPrefix}.finalRoundOmitPhases.${index}`,
            severity: 'error',
            message: `Unknown coupPlan phase id "${phaseId}" in finalRoundOmitPhases.`,
            suggestion: 'Reference ids declared in coupPlan.phases.',
          });
        }
      }
    }
  }

  return rawCoupPlan as unknown as CoupPlanDef;
}

export function lowerVictory(
  rawTerminal: GameSpecDoc['terminal'],
  diagnostics: Diagnostic[],
): Pick<TerminalEvaluationDef, 'checkpoints' | 'margins' | 'ranking'> | undefined {
  if (rawTerminal === null) {
    return undefined;
  }

  const rawVictory = {
    checkpoints: rawTerminal.checkpoints,
    margins: rawTerminal.margins,
    ranking: rawTerminal.ranking,
  };

  if (rawVictory.checkpoints === undefined) {
    return undefined;
  }

  if (!isRecord(rawVictory)) {
    return undefined;
  }

  if (!Array.isArray(rawVictory.checkpoints)) {
    diagnostics.push({
      code: 'CNL_COMPILER_VICTORY_REQUIRED_FIELD_MISSING',
      path: 'doc.terminal.checkpoints',
      severity: 'error',
      message: 'terminal.checkpoints must be an array when declared.',
      suggestion: 'Declare one or more terminal checkpoint definitions.',
    });
    return undefined;
  }

  const seenCheckpointIds = new Set<string>();
  for (const [index, checkpoint] of rawVictory.checkpoints.entries()) {
    const checkpointPath = `doc.terminal.checkpoints.${index}`;
    if (!isRecord(checkpoint)) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_INVALID',
        path: checkpointPath,
        severity: 'error',
        message: 'victory checkpoint entries must be objects.',
        suggestion: 'Provide checkpoint id/faction/timing/when fields.',
      });
      continue;
    }

    if (typeof checkpoint.id !== 'string' || checkpoint.id.trim() === '') {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_ID_INVALID',
        path: `${checkpointPath}.id`,
        severity: 'error',
        message: 'victory checkpoint id must be a non-empty string.',
        suggestion: 'Set checkpoint.id to a stable identifier.',
      });
    } else if (seenCheckpointIds.has(checkpoint.id)) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_DUPLICATE',
        path: `${checkpointPath}.id`,
        severity: 'error',
        message: `Duplicate victory checkpoint id "${checkpoint.id}".`,
        suggestion: 'Declare each checkpoint id exactly once.',
      });
    } else {
      seenCheckpointIds.add(checkpoint.id);
    }

    if (typeof checkpoint.faction !== 'string' || checkpoint.faction.trim() === '') {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_FACTION_INVALID',
        path: `${checkpointPath}.faction`,
        severity: 'error',
        message: 'victory checkpoint faction must be a non-empty string.',
        suggestion: 'Set checkpoint.faction to a declared faction id.',
      });
    }

    if (checkpoint.timing !== 'duringCoup' && checkpoint.timing !== 'finalCoup') {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_TIMING_INVALID',
        path: `${checkpointPath}.timing`,
        severity: 'error',
        message: 'victory checkpoint timing must be "duringCoup" or "finalCoup".',
        suggestion: 'Use one of the supported victory checkpoint timings.',
      });
    }

    if (!isRecord(checkpoint.when)) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_CHECKPOINT_WHEN_INVALID',
        path: `${checkpointPath}.when`,
        severity: 'error',
        message: 'victory checkpoint when must be a condition object.',
        suggestion: 'Set checkpoint.when to a Condition AST object.',
      });
    }
  }

  if (rawVictory.margins !== undefined) {
    if (!Array.isArray(rawVictory.margins)) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_MARGINS_INVALID',
        path: 'doc.terminal.margins',
        severity: 'error',
        message: 'victory.margins must be an array when declared.',
        suggestion: 'Set margins to an array of faction/value definitions.',
      });
    } else {
      for (const [index, margin] of rawVictory.margins.entries()) {
        const marginPath = `doc.terminal.margins.${index}`;
        if (!isRecord(margin)) {
          diagnostics.push({
            code: 'CNL_COMPILER_VICTORY_MARGIN_INVALID',
            path: marginPath,
            severity: 'error',
            message: 'victory margin entries must be objects.',
            suggestion: 'Provide margin.faction and margin.value.',
          });
          continue;
        }

        if (typeof margin.faction !== 'string' || margin.faction.trim() === '') {
          diagnostics.push({
            code: 'CNL_COMPILER_VICTORY_MARGIN_FACTION_INVALID',
            path: `${marginPath}.faction`,
            severity: 'error',
            message: 'victory margin faction must be a non-empty string.',
            suggestion: 'Set margin.faction to a declared faction id.',
          });
        }

        const valueType = typeof margin.value;
        if (
          margin.value === undefined ||
          margin.value === null ||
          (valueType !== 'number' && valueType !== 'boolean' && valueType !== 'string' && !isRecord(margin.value))
        ) {
          diagnostics.push({
            code: 'CNL_COMPILER_VICTORY_MARGIN_VALUE_INVALID',
            path: `${marginPath}.value`,
            severity: 'error',
            message: 'victory margin value must be a ValueExpr-compatible literal or object.',
            suggestion: 'Use a literal or ValueExpr object for margin.value.',
          });
        }
      }
    }
  }

  if (rawVictory.ranking !== undefined) {
    if (!isRecord(rawVictory.ranking)) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_RANKING_INVALID',
        path: 'doc.terminal.ranking',
        severity: 'error',
        message: 'victory.ranking must be an object when declared.',
        suggestion: 'Set ranking.order to "desc" or "asc", with optional ranking.tieBreakOrder.',
      });
    } else if (rawVictory.ranking.order !== 'desc' && rawVictory.ranking.order !== 'asc') {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_RANKING_ORDER_INVALID',
        path: 'doc.terminal.ranking.order',
        severity: 'error',
        message: 'victory.ranking.order must be "desc" or "asc".',
        suggestion: 'Use "desc" for high-to-low or "asc" for low-to-high ranking.',
      });
    } else if (
      rawVictory.ranking.tieBreakOrder !== undefined &&
      (!Array.isArray(rawVictory.ranking.tieBreakOrder) ||
        !rawVictory.ranking.tieBreakOrder.every((value) => typeof value === 'string' && value.trim().length > 0))
    ) {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_RANKING_TIEBREAK_ORDER_INVALID',
        path: 'doc.terminal.ranking.tieBreakOrder',
        severity: 'error',
        message: 'victory.ranking.tieBreakOrder must be an array of non-empty faction ids when declared.',
        suggestion: 'Set ranking.tieBreakOrder to faction ids ordered from highest to lowest tie-break priority.',
      });
    }
  }

  return rawVictory as Pick<TerminalEvaluationDef, 'checkpoints' | 'margins' | 'ranking'>;
}
