import type { Diagnostic } from '../kernel/diagnostics.js';
import type { CoupPlanDef, TerminalEvaluationDef } from '../kernel/types.js';
import type { VictoryStandingsDef, VictoryStandingEntry } from '../kernel/types-core.js';
import type { VictoryFormula, MarkerWeightConfig } from '../kernel/derived-values.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord } from './compile-lowering.js';
import { lowerConditionNode, lowerValueNode, type ConditionLoweringContext } from './compile-conditions.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

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
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_INVALID,
      path: pathPrefix,
      severity: 'error',
      message: 'coupPlan must be an object when declared.',
      suggestion: 'Provide coupPlan.phases and optional finalRoundOmitPhases/maxConsecutiveRounds.',
    });
    return undefined;
  }

  if (!Array.isArray(rawCoupPlan.phases)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_REQUIRED_FIELD_MISSING,
      path: `${pathPrefix}.phases`,
      severity: 'error',
      message: 'coupPlan.phases is required and must be an array.',
      suggestion: 'Define coupPlan.phases as an ordered list of phase objects.',
    });
    return undefined;
  }

  if (rawCoupPlan.phases.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_PHASES_EMPTY,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_PHASE_INVALID,
        path: phasePath,
        severity: 'error',
        message: 'coupPlan phase entries must be objects.',
        suggestion: 'Provide phase.id and phase.steps.',
      });
      continue;
    }

    if (typeof phase.id !== 'string' || phase.id.trim() === '') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_PHASE_ID_INVALID,
        path: `${phasePath}.id`,
        severity: 'error',
        message: 'coupPlan phase id must be a non-empty string.',
        suggestion: 'Set phase.id to a stable identifier.',
      });
    } else if (seenPhaseIds.has(phase.id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_PHASE_DUPLICATE,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_PHASE_STEPS_INVALID,
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
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_MAX_CONSECUTIVE_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_INVALID,
        path: `${pathPrefix}.finalRoundOmitPhases`,
        severity: 'error',
        message: 'coupPlan.finalRoundOmitPhases must be an array of phase ids when declared.',
        suggestion: 'Set finalRoundOmitPhases to an array of coupPlan phase ids.',
      });
    } else {
      for (const [index, phaseId] of rawCoupPlan.finalRoundOmitPhases.entries()) {
        if (typeof phaseId !== 'string' || phaseId.trim() === '') {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_INVALID,
            path: `${pathPrefix}.finalRoundOmitPhases.${index}`,
            severity: 'error',
            message: 'finalRoundOmitPhases entries must be non-empty strings.',
            suggestion: 'Use coupPlan phase ids.',
          });
          continue;
        }

        if (!declaredPhaseIds.has(phaseId)) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE,
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
  context: ConditionLoweringContext,
): Pick<TerminalEvaluationDef, 'checkpoints' | 'margins' | 'ranking'> | undefined {
  if (rawTerminal === null) {
    return undefined;
  }

  const rawVictory = {
    checkpoints: rawTerminal.checkpoints,
    margins: rawTerminal.margins,
    ranking: rawTerminal.ranking,
  };

  if (
    rawVictory.checkpoints === undefined
    && rawVictory.margins === undefined
    && rawVictory.ranking === undefined
  ) {
    return undefined;
  }

  if (!isRecord(rawVictory)) {
    return undefined;
  }

  let loweredCheckpoints: Array<NonNullable<TerminalEvaluationDef['checkpoints']>[number]> | undefined;
  if (rawVictory.checkpoints !== undefined && !Array.isArray(rawVictory.checkpoints)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_REQUIRED_FIELD_MISSING,
      path: 'doc.terminal.checkpoints',
      severity: 'error',
      message: 'terminal.checkpoints must be an array when declared.',
      suggestion: 'Declare one or more terminal checkpoint definitions.',
    });
  } else if (rawVictory.checkpoints !== undefined) {
    const seenCheckpointIds = new Set<string>();
    loweredCheckpoints = [];
    for (const [index, checkpoint] of rawVictory.checkpoints.entries()) {
      const checkpointPath = `doc.terminal.checkpoints.${index}`;
      if (!isRecord(checkpoint)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_INVALID,
          path: checkpointPath,
          severity: 'error',
          message: 'victory checkpoint entries must be objects.',
          suggestion: 'Provide checkpoint id/seat/timing/when fields.',
        });
        continue;
      }

      if (typeof checkpoint.id !== 'string' || checkpoint.id.trim() === '') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_ID_INVALID,
          path: `${checkpointPath}.id`,
          severity: 'error',
          message: 'victory checkpoint id must be a non-empty string.',
          suggestion: 'Set checkpoint.id to a stable identifier.',
        });
      } else if (seenCheckpointIds.has(checkpoint.id)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_DUPLICATE,
          path: `${checkpointPath}.id`,
          severity: 'error',
          message: `Duplicate victory checkpoint id "${checkpoint.id}".`,
          suggestion: 'Declare each checkpoint id exactly once.',
        });
      } else {
        seenCheckpointIds.add(checkpoint.id);
      }

      if (typeof checkpoint.seat !== 'string' || checkpoint.seat.trim() === '') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_SEAT_INVALID,
          path: `${checkpointPath}.seat`,
          severity: 'error',
          message: 'victory checkpoint seat must be a non-empty string.',
          suggestion: 'Set checkpoint.seat to a declared seat id.',
        });
      }

      if (checkpoint.timing !== 'duringCoup' && checkpoint.timing !== 'finalCoup') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_TIMING_INVALID,
          path: `${checkpointPath}.timing`,
          severity: 'error',
          message: 'victory checkpoint timing must be "duringCoup" or "finalCoup".',
          suggestion: 'Use one of the supported victory checkpoint timings.',
        });
      }

      const checkpointPhases =
        Array.isArray(checkpoint.phases) && checkpoint.phases.every((phase) => typeof phase === 'string' && phase.trim() !== '')
          ? checkpoint.phases
          : undefined;

      if (checkpoint.phases !== undefined && checkpointPhases === undefined) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_PHASES_INVALID,
          path: `${checkpointPath}.phases`,
          severity: 'error',
          message: 'victory checkpoint phases must be an array of non-empty strings when declared.',
          suggestion: 'Set checkpoint.phases to phase ids such as [coupVictory].',
        });
      }

      if (!isRecord(checkpoint.when)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_CHECKPOINT_WHEN_INVALID,
          path: `${checkpointPath}.when`,
          severity: 'error',
          message: 'victory checkpoint when must be a condition object.',
          suggestion: 'Set checkpoint.when to a Condition AST object.',
        });
        continue;
      }

      const loweredWhen = lowerConditionNode(checkpoint.when, context, `${checkpointPath}.when`);
      diagnostics.push(...loweredWhen.diagnostics);
      if (loweredWhen.value === null) {
        continue;
      }

      if (
        typeof checkpoint.id === 'string' &&
        checkpoint.id.trim() !== '' &&
        typeof checkpoint.seat === 'string' &&
        checkpoint.seat.trim() !== '' &&
        (checkpoint.timing === 'duringCoup' || checkpoint.timing === 'finalCoup')
      ) {
        loweredCheckpoints.push({
          id: checkpoint.id,
          seat: checkpoint.seat,
          timing: checkpoint.timing,
          ...(checkpointPhases === undefined ? {} : { phases: checkpointPhases }),
          when: loweredWhen.value,
        });
      }
    }
  }

  let loweredMargins: Array<NonNullable<TerminalEvaluationDef['margins']>[number]> | undefined;
  if (rawVictory.margins !== undefined) {
    if (!Array.isArray(rawVictory.margins)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_MARGINS_INVALID,
        path: 'doc.terminal.margins',
        severity: 'error',
        message: 'victory.margins must be an array when declared.',
        suggestion: 'Set margins to an array of seat/value definitions.',
      });
    } else {
      loweredMargins = [];
      for (const [index, margin] of rawVictory.margins.entries()) {
        const marginPath = `doc.terminal.margins.${index}`;
        if (!isRecord(margin)) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_MARGIN_INVALID,
            path: marginPath,
            severity: 'error',
            message: 'victory margin entries must be objects.',
            suggestion: 'Provide margin.seat and margin.value.',
          });
          continue;
        }

        if (typeof margin.seat !== 'string' || margin.seat.trim() === '') {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_MARGIN_SEAT_INVALID,
            path: `${marginPath}.seat`,
            severity: 'error',
            message: 'victory margin seat must be a non-empty string.',
            suggestion: 'Set margin.seat to a declared seat id.',
          });
        }

        const valueType = typeof margin.value;
        if (
          margin.value === undefined ||
          margin.value === null ||
          (valueType !== 'number' && valueType !== 'boolean' && valueType !== 'string' && !isRecord(margin.value))
        ) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_MARGIN_VALUE_INVALID,
            path: `${marginPath}.value`,
            severity: 'error',
            message: 'victory margin value must be a ValueExpr-compatible literal or object.',
            suggestion: 'Use a literal or ValueExpr object for margin.value.',
          });
          continue;
        }

        const loweredValue = lowerValueNode(margin.value, context, `${marginPath}.value`);
        diagnostics.push(...loweredValue.diagnostics);
        if (loweredValue.value === null) {
          continue;
        }

        if (typeof margin.seat === 'string' && margin.seat.trim() !== '') {
          loweredMargins.push({
            seat: margin.seat,
            value: loweredValue.value,
          });
        }
      }
    }
  }

  if (rawVictory.ranking !== undefined) {
    if (!isRecord(rawVictory.ranking)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_RANKING_INVALID,
        path: 'doc.terminal.ranking',
        severity: 'error',
        message: 'victory.ranking must be an object when declared.',
        suggestion: 'Set ranking.order to "desc" or "asc", with optional ranking.tieBreakOrder.',
      });
    } else if (rawVictory.ranking.order !== 'desc' && rawVictory.ranking.order !== 'asc') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_RANKING_ORDER_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_RANKING_TIEBREAK_ORDER_INVALID,
        path: 'doc.terminal.ranking.tieBreakOrder',
        severity: 'error',
        message: 'victory.ranking.tieBreakOrder must be an array of non-empty seat ids when declared.',
        suggestion: 'Set ranking.tieBreakOrder to seat ids ordered from highest to lowest tie-break priority.',
      });
    }
  }

  return {
    ...(loweredCheckpoints === undefined ? {} : { checkpoints: loweredCheckpoints }),
    ...(loweredMargins === undefined ? {} : { margins: loweredMargins }),
    ...(rawVictory.ranking === undefined ? {} : { ranking: rawVictory.ranking }),
  };
}

const VALID_FORMULA_TYPES = new Set([
  'markerTotalPlusZoneCount',
  'markerTotalPlusMapBases',
  'controlledPopulationPlusMapBases',
  'controlledPopulationPlusGlobalVar',
]);

export function lowerVictoryStandings(
  raw: unknown,
  diagnostics: Diagnostic[],
  pathPrefix = 'doc.victoryStandings',
): VictoryStandingsDef | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  if (!isRecord(raw)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: pathPrefix,
      severity: 'error',
      message: 'victoryStandings must be an object.',
      suggestion: 'Provide seatGroupConfig, markerConfigs, markerName, defaultMarkerState, entries, and tieBreakOrder.',
    });
    return undefined;
  }

  if (!isRecord(raw.seatGroupConfig)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_SEAT_GROUP_INVALID,
      path: `${pathPrefix}.seatGroupConfig`,
      severity: 'error',
      message: 'victoryStandings.seatGroupConfig must be an object.',
      suggestion: 'Provide coinSeats, insurgentSeats, soloSeat, and seatProp.',
    });
    return undefined;
  }

  if (!isRecord(raw.markerConfigs)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_MARKER_CONFIG_INVALID,
      path: `${pathPrefix}.markerConfigs`,
      severity: 'error',
      message: 'victoryStandings.markerConfigs must be an object mapping config names to MarkerWeightConfig.',
      suggestion: 'Provide named marker configs with activeState and passiveState.',
    });
    return undefined;
  }

  if (typeof raw.markerName !== 'string' || raw.markerName.trim() === '') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: `${pathPrefix}.markerName`,
      severity: 'error',
      message: 'victoryStandings.markerName must be a non-empty string.',
    });
    return undefined;
  }

  if (typeof raw.defaultMarkerState !== 'string' || raw.defaultMarkerState.trim() === '') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: `${pathPrefix}.defaultMarkerState`,
      severity: 'error',
      message: 'victoryStandings.defaultMarkerState must be a non-empty string.',
    });
    return undefined;
  }

  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: `${pathPrefix}.entries`,
      severity: 'error',
      message: 'victoryStandings.entries must be a non-empty array.',
    });
    return undefined;
  }

  if (
    !Array.isArray(raw.tieBreakOrder) ||
    !raw.tieBreakOrder.every((v: unknown) => typeof v === 'string' && v.trim() !== '')
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: `${pathPrefix}.tieBreakOrder`,
      severity: 'error',
      message: 'victoryStandings.tieBreakOrder must be an array of non-empty strings.',
    });
    return undefined;
  }

  const markerConfigs: Record<string, MarkerWeightConfig> = {};
  for (const [configName, configValue] of Object.entries(raw.markerConfigs)) {
    if (!isRecord(configValue) || typeof configValue.activeState !== 'string' || typeof configValue.passiveState !== 'string') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_MARKER_CONFIG_INVALID,
        path: `${pathPrefix}.markerConfigs.${configName}`,
        severity: 'error',
        message: `Marker config "${configName}" must have activeState and passiveState strings.`,
      });
      return undefined;
    }
    markerConfigs[configName] = {
      activeState: configValue.activeState,
      passiveState: configValue.passiveState,
    };
  }

  const entries: VictoryStandingEntry[] = [];
  for (const [index, rawEntry] of (raw.entries as unknown[]).entries()) {
    const entryPath = `${pathPrefix}.entries.${index}`;
    if (!isRecord(rawEntry)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_ENTRY_INVALID,
        path: entryPath,
        severity: 'error',
        message: 'Victory standings entry must be an object with seat, threshold, and formula.',
      });
      continue;
    }

    if (typeof rawEntry.seat !== 'string' || rawEntry.seat.trim() === '') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_ENTRY_INVALID,
        path: `${entryPath}.seat`,
        severity: 'error',
        message: 'Victory standings entry seat must be a non-empty string.',
      });
      continue;
    }

    if (typeof rawEntry.threshold !== 'number') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_ENTRY_INVALID,
        path: `${entryPath}.threshold`,
        severity: 'error',
        message: 'Victory standings entry threshold must be a number.',
      });
      continue;
    }

    const formula = lowerVictoryFormula(rawEntry.formula, markerConfigs, diagnostics, `${entryPath}.formula`);
    if (formula === undefined) {
      continue;
    }

    entries.push({
      seat: rawEntry.seat,
      threshold: rawEntry.threshold,
      formula,
    });
  }

  if (entries.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_INVALID,
      path: `${pathPrefix}.entries`,
      severity: 'error',
      message: 'victoryStandings must have at least one valid entry after lowering.',
    });
    return undefined;
  }

  return {
    seatGroupConfig: raw.seatGroupConfig as unknown as VictoryStandingsDef['seatGroupConfig'],
    markerConfigs,
    markerName: raw.markerName as string,
    defaultMarkerState: raw.defaultMarkerState as string,
    entries,
    tieBreakOrder: raw.tieBreakOrder as readonly string[],
  };
}

function lowerVictoryFormula(
  raw: unknown,
  markerConfigs: Readonly<Record<string, MarkerWeightConfig>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): VictoryFormula | undefined {
  if (!isRecord(raw)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
      path: pathPrefix,
      severity: 'error',
      message: 'Victory formula must be an object with a type field.',
    });
    return undefined;
  }

  if (typeof raw.type !== 'string' || !VALID_FORMULA_TYPES.has(raw.type)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
      path: `${pathPrefix}.type`,
      severity: 'error',
      message: `Victory formula type must be one of: ${[...VALID_FORMULA_TYPES].join(', ')}.`,
    });
    return undefined;
  }

  switch (raw.type) {
    case 'markerTotalPlusZoneCount':
    case 'markerTotalPlusMapBases': {
      const resolvedMarkerConfig = resolveMarkerConfigRef(raw.markerConfig, markerConfigs, diagnostics, pathPrefix);
      if (resolvedMarkerConfig === undefined) {
        return undefined;
      }

      if (raw.type === 'markerTotalPlusZoneCount') {
        if (typeof raw.countZone !== 'string') {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
            path: `${pathPrefix}.countZone`,
            severity: 'error',
            message: 'markerTotalPlusZoneCount formula requires a countZone string.',
          });
          return undefined;
        }
        return {
          type: 'markerTotalPlusZoneCount',
          markerConfig: resolvedMarkerConfig,
          countZone: raw.countZone,
          ...(Array.isArray(raw.countTokenTypes) ? { countTokenTypes: raw.countTokenTypes as string[] } : {}),
        };
      }

      if (!Array.isArray(raw.basePieceTypes) || typeof raw.baseSeat !== 'string') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
          path: pathPrefix,
          severity: 'error',
          message: 'markerTotalPlusMapBases formula requires baseSeat and basePieceTypes.',
        });
        return undefined;
      }
      return {
        type: 'markerTotalPlusMapBases',
        markerConfig: resolvedMarkerConfig,
        baseSeat: raw.baseSeat,
        basePieceTypes: raw.basePieceTypes as string[],
      };
    }

    case 'controlledPopulationPlusMapBases': {
      if ((raw.controlFn !== 'coin' && raw.controlFn !== 'solo') || typeof raw.baseSeat !== 'string' || !Array.isArray(raw.basePieceTypes)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
          path: pathPrefix,
          severity: 'error',
          message: 'controlledPopulationPlusMapBases formula requires controlFn (coin|solo), baseSeat, and basePieceTypes.',
        });
        return undefined;
      }
      return {
        type: 'controlledPopulationPlusMapBases',
        controlFn: raw.controlFn,
        baseSeat: raw.baseSeat,
        basePieceTypes: raw.basePieceTypes as string[],
      };
    }

    case 'controlledPopulationPlusGlobalVar': {
      if ((raw.controlFn !== 'coin' && raw.controlFn !== 'solo') || typeof raw.varName !== 'string') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_FORMULA_INVALID,
          path: pathPrefix,
          severity: 'error',
          message: 'controlledPopulationPlusGlobalVar formula requires controlFn (coin|solo) and varName.',
        });
        return undefined;
      }
      return {
        type: 'controlledPopulationPlusGlobalVar',
        controlFn: raw.controlFn,
        varName: raw.varName,
      };
    }

    default:
      return undefined;
  }
}

function resolveMarkerConfigRef(
  ref: unknown,
  markerConfigs: Readonly<Record<string, MarkerWeightConfig>>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): MarkerWeightConfig | undefined {
  if (typeof ref === 'string') {
    const resolved = markerConfigs[ref];
    if (resolved === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_MARKER_CONFIG_INVALID,
        path: `${pathPrefix}.markerConfig`,
        severity: 'error',
        message: `Unknown marker config reference "${ref}". Available: ${Object.keys(markerConfigs).join(', ')}.`,
      });
      return undefined;
    }
    return resolved;
  }

  if (isRecord(ref) && typeof ref.activeState === 'string' && typeof ref.passiveState === 'string') {
    return { activeState: ref.activeState, passiveState: ref.passiveState };
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_VICTORY_STANDINGS_MARKER_CONFIG_INVALID,
    path: `${pathPrefix}.markerConfig`,
    severity: 'error',
    message: 'markerConfig must be a string reference or an object with activeState and passiveState.',
  });
  return undefined;
}
