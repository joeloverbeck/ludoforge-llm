import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import {
  asActionId,
  asPhaseId,
  asTriggerId,
} from '../kernel/branded.js';
import type { GameDef } from '../kernel/types.js';
import type {
  ActionDef,
  ConditionAST,
  CoupPlanDef,
  EffectAST,
  EndCondition,
  LimitDef,
  ParamDef,
  PhaseDef,
  TokenTypeDef,
  TriggerDef,
  TriggerEvent,
  TurnFlowDef,
  TurnStructure,
  OperationCostDef,
  OperationLegalityDef,
  OperationProfileDef,
  OperationResolutionStageDef,
  OperationTargetingDef,
  VictoryDef,
  VariableDef,
  MapPayload,
  PieceCatalogPayload,
  EventCardDef,
  EventCardSetPayload,
} from '../kernel/types.js';
import { validateGameDef } from '../kernel/validate-gamedef.js';
import { lowerConditionNode, lowerQueryNode } from './compile-conditions.js';
import { lowerEffectArray } from './compile-effects.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { materializeZoneDefs } from './compile-zones.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { capDiagnostics, dedupeDiagnostics, sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { expandEffectMacros } from './expand-effect-macros.js';
import { expandBoardMacro } from './expand-macros.js';

export interface CompileLimits {
  readonly maxExpandedEffects: number;
  readonly maxGeneratedZones: number;
  readonly maxDiagnosticCount: number;
}

export interface CompileOptions {
  readonly sourceMap?: GameSpecSourceMap;
  readonly limits?: Partial<CompileLimits>;
}

export const DEFAULT_COMPILE_LIMITS: CompileLimits = {
  maxExpandedEffects: 20_000,
  maxGeneratedZones: 10_000,
  maxDiagnosticCount: 500,
};

export function resolveCompileLimits(overrides?: Partial<CompileLimits>): CompileLimits {
  const maxExpandedEffects = resolveLimit(
    overrides?.maxExpandedEffects,
    DEFAULT_COMPILE_LIMITS.maxExpandedEffects,
    'maxExpandedEffects',
  );
  const maxGeneratedZones = resolveLimit(
    overrides?.maxGeneratedZones,
    DEFAULT_COMPILE_LIMITS.maxGeneratedZones,
    'maxGeneratedZones',
  );
  const maxDiagnosticCount = resolveLimit(
    overrides?.maxDiagnosticCount,
    DEFAULT_COMPILE_LIMITS.maxDiagnosticCount,
    'maxDiagnosticCount',
  );

  return {
    maxExpandedEffects,
    maxGeneratedZones,
    maxDiagnosticCount,
  };
}

export function expandMacros(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const diagnostics: Diagnostic[] = [];

  const zonesExpansion = expandZoneMacros(doc.zones, limits.maxGeneratedZones, diagnostics);
  const effectsExpansion = expandEffectSections(
    {
      setup: doc.setup,
      actions: doc.actions,
      triggers: doc.triggers,
      turnStructure: doc.turnStructure,
    },
    limits.maxExpandedEffects,
    diagnostics,
  );

  const expandedDoc: GameSpecDoc = {
    ...doc,
    zones: zonesExpansion,
    setup: effectsExpansion.setup,
    actions: effectsExpansion.actions,
    triggers: effectsExpansion.triggers,
    turnStructure: effectsExpansion.turnStructure,
  };

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    doc: expandedDoc,
    diagnostics: finalizedDiagnostics,
  };
}

export function compileGameSpecToGameDef(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly gameDef: GameDef | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const macroExpansion = expandEffectMacros(doc);
  const expanded = expandMacros(macroExpansion.doc, options);
  const diagnostics: Diagnostic[] = [...macroExpansion.diagnostics, ...expanded.diagnostics];
  const gameDef = compileExpandedDoc(expanded.doc, diagnostics);

  if (gameDef !== null) {
    diagnostics.push(...validateGameDef(gameDef));
  }

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    gameDef: hasErrorDiagnostics(finalizedDiagnostics) ? null : gameDef,
    diagnostics: finalizedDiagnostics,
  };
}

function compileExpandedDoc(doc: GameSpecDoc, diagnostics: Diagnostic[]): GameDef | null {
  const derivedFromAssets = deriveSectionsFromDataAssets(doc, diagnostics);
  const effectiveZones = doc.zones ?? derivedFromAssets.zones;
  const effectiveTokenTypes = doc.tokenTypes ?? derivedFromAssets.tokenTypes;

  if (doc.metadata === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.metadata', 'metadata'));
    return null;
  }
  if (effectiveZones === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.zones', 'zones'));
    return null;
  }
  if (doc.turnStructure === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.turnStructure', 'turnStructure'));
    return null;
  }
  if (doc.actions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.actions', 'actions'));
    return null;
  }
  if (doc.endConditions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.endConditions', 'endConditions'));
    return null;
  }

  const zoneCompilation = materializeZoneDefs(effectiveZones, doc.metadata.players.max);
  diagnostics.push(...zoneCompilation.diagnostics);
  const ownershipByBase = zoneCompilation.value.ownershipByBase;

  const setup = lowerEffectsWithDiagnostics(doc.setup ?? [], ownershipByBase, diagnostics, 'doc.setup');
  const turnStructure = lowerTurnStructure(doc.turnStructure, ownershipByBase, diagnostics);
  const turnFlow = lowerTurnFlow(doc.turnFlow, diagnostics);
  const operationProfiles = lowerOperationProfiles(doc.operationProfiles, doc.actions, ownershipByBase, diagnostics);
  const coupPlan = lowerCoupPlan(doc.coupPlan, diagnostics);
  const victory = lowerVictory(doc.victory, diagnostics);
  const actions = lowerActions(doc.actions, ownershipByBase, diagnostics);
  const triggers = lowerTriggers(doc.triggers ?? [], ownershipByBase, diagnostics);
  const endConditions = lowerEndConditions(doc.endConditions, ownershipByBase, diagnostics);

  return {
    metadata: doc.metadata,
    constants: lowerConstants(doc.constants, diagnostics),
    globalVars: lowerVarDefs(doc.globalVars, diagnostics, 'doc.globalVars'),
    perPlayerVars: lowerVarDefs(doc.perPlayerVars, diagnostics, 'doc.perPlayerVars'),
    zones: zoneCompilation.value.zones,
    tokenTypes: lowerTokenTypes(effectiveTokenTypes, diagnostics),
    setup,
    turnStructure,
    ...(turnFlow === undefined ? {} : { turnFlow }),
    ...(operationProfiles === undefined ? {} : { operationProfiles }),
    ...(coupPlan === undefined ? {} : { coupPlan }),
    ...(victory === undefined ? {} : { victory }),
    actions,
    triggers,
    endConditions,
    ...(derivedFromAssets.eventCards === undefined ? {} : { eventCards: derivedFromAssets.eventCards }),
  };
}

function lowerTurnFlow(rawTurnFlow: GameSpecDoc['turnFlow'], diagnostics: Diagnostic[]): TurnFlowDef | undefined {
  if (rawTurnFlow === null) {
    return undefined;
  }

  if (!isRecord(rawTurnFlow)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_INVALID',
      path: 'doc.turnFlow',
      severity: 'error',
      message: 'turnFlow must be an object when declared.',
      suggestion: 'Provide a turnFlow object with required contract fields.',
    });
    return undefined;
  }

  const cardLifecycle = rawTurnFlow.cardLifecycle;
  if (!isRecord(cardLifecycle)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnFlow.cardLifecycle',
      severity: 'error',
      message: 'turnFlow.cardLifecycle is required and must be an object.',
      suggestion: 'Define cardLifecycle.played, cardLifecycle.lookahead, and cardLifecycle.leader.',
    });
  }

  const eligibility = rawTurnFlow.eligibility;
  if (!isRecord(eligibility)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnFlow.eligibility',
      severity: 'error',
      message: 'turnFlow.eligibility is required and must be an object.',
      suggestion: 'Define eligibility.factions and eligibility.overrideWindows.',
    });
  }

  if (!Array.isArray(rawTurnFlow.optionMatrix)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnFlow.optionMatrix',
      severity: 'error',
      message: 'turnFlow.optionMatrix is required and must be an array.',
      suggestion: 'Define optionMatrix rows for first/second eligible action classes.',
    });
  }

  if (!Array.isArray(rawTurnFlow.passRewards)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnFlow.passRewards',
      severity: 'error',
      message: 'turnFlow.passRewards is required and must be an array.',
      suggestion: 'Define pass reward entries keyed by faction class.',
    });
  }

  if (!Array.isArray(rawTurnFlow.durationWindows)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnFlow.durationWindows',
      severity: 'error',
      message: 'turnFlow.durationWindows is required and must be an array.',
      suggestion: 'Declare supported duration windows such as card/nextCard/coup/campaign.',
    });
  }

  if (
    !isRecord(cardLifecycle) ||
    typeof cardLifecycle.played !== 'string' ||
    typeof cardLifecycle.lookahead !== 'string' ||
    typeof cardLifecycle.leader !== 'string' ||
    !isRecord(eligibility) ||
    !Array.isArray(eligibility.factions) ||
    !Array.isArray(eligibility.overrideWindows) ||
    !Array.isArray(rawTurnFlow.optionMatrix) ||
    !Array.isArray(rawTurnFlow.passRewards) ||
    !Array.isArray(rawTurnFlow.durationWindows)
  ) {
    return undefined;
  }

  const factionOrder = eligibility.factions.filter((faction): faction is string => typeof faction === 'string');
  const seenFactions = new Set<string>();
  for (const [index, faction] of factionOrder.entries()) {
    if (!seenFactions.has(faction)) {
      seenFactions.add(faction);
      continue;
    }
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_FACTION',
      path: `doc.turnFlow.eligibility.factions.${index}`,
      severity: 'error',
      message: `Duplicate faction id "${faction}" creates unresolved deterministic ordering.`,
      suggestion: 'Declare each faction id exactly once in eligibility.factions.',
    });
  }

  const seenOptionRows = new Set<string>();
  for (const [index, row] of rawTurnFlow.optionMatrix.entries()) {
    if (!isRecord(row) || typeof row.first !== 'string') {
      continue;
    }
    if (!seenOptionRows.has(row.first)) {
      seenOptionRows.add(row.first);
      continue;
    }
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_OPTION_ROW',
      path: `doc.turnFlow.optionMatrix.${index}.first`,
      severity: 'error',
      message: `Duplicate optionMatrix.first "${row.first}" creates ambiguous second-eligible ordering.`,
      suggestion: 'Keep one optionMatrix row per first action class.',
    });
  }

  if (isRecord(rawTurnFlow.pivotal)) {
    const actionIds = Array.isArray(rawTurnFlow.pivotal.actionIds)
      ? rawTurnFlow.pivotal.actionIds.filter((actionId): actionId is string => typeof actionId === 'string')
      : [];
    const interrupt = isRecord(rawTurnFlow.pivotal.interrupt) ? rawTurnFlow.pivotal.interrupt : null;
    const precedence = Array.isArray(interrupt?.precedence)
      ? interrupt.precedence.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (actionIds.length > 1 && precedence.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_REQUIRED',
        path: 'doc.turnFlow.pivotal.interrupt.precedence',
        severity: 'error',
        message: 'Multiple pivotal actions require explicit interrupt precedence for deterministic ordering.',
        suggestion: 'Declare pivotal.interrupt.precedence with a stable faction-id order.',
      });
    }

    const seenPrecedence = new Set<string>();
    for (const [index, faction] of precedence.entries()) {
      if (!factionOrder.includes(faction)) {
        diagnostics.push({
          code: 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_FACTION',
          path: `doc.turnFlow.pivotal.interrupt.precedence.${index}`,
          severity: 'error',
          message: `Interrupt precedence faction "${faction}" is not declared in eligibility.factions.`,
          suggestion: 'Use faction ids declared in turnFlow.eligibility.factions.',
        });
      }

      if (!seenPrecedence.has(faction)) {
        seenPrecedence.add(faction);
        continue;
      }

      diagnostics.push({
        code: 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_DUPLICATE',
        path: `doc.turnFlow.pivotal.interrupt.precedence.${index}`,
        severity: 'error',
        message: `Duplicate interrupt precedence faction "${faction}" creates unresolved ordering.`,
        suggestion: 'List each faction at most once in pivotal.interrupt.precedence.',
      });
    }
  }

  return rawTurnFlow as TurnFlowDef;
}

function lowerCoupPlan(rawCoupPlan: GameSpecDoc['coupPlan'], diagnostics: Diagnostic[]): CoupPlanDef | undefined {
  if (rawCoupPlan === null) {
    return undefined;
  }

  if (!isRecord(rawCoupPlan)) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_INVALID',
      path: 'doc.coupPlan',
      severity: 'error',
      message: 'coupPlan must be an object when declared.',
      suggestion: 'Provide coupPlan.phases and optional finalRoundOmitPhases/maxConsecutiveRounds.',
    });
    return undefined;
  }

  if (!Array.isArray(rawCoupPlan.phases)) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_REQUIRED_FIELD_MISSING',
      path: 'doc.coupPlan.phases',
      severity: 'error',
      message: 'coupPlan.phases is required and must be an array.',
      suggestion: 'Define coupPlan.phases as an ordered list of phase objects.',
    });
    return undefined;
  }

  const seenPhaseIds = new Set<string>();
  for (const [index, phase] of rawCoupPlan.phases.entries()) {
    const phasePath = `doc.coupPlan.phases.${index}`;
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

  if (
    rawCoupPlan.maxConsecutiveRounds !== undefined &&
    (!Number.isInteger(rawCoupPlan.maxConsecutiveRounds) || rawCoupPlan.maxConsecutiveRounds < 1)
  ) {
    diagnostics.push({
      code: 'CNL_COMPILER_COUP_PLAN_MAX_CONSECUTIVE_INVALID',
      path: 'doc.coupPlan.maxConsecutiveRounds',
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
        path: 'doc.coupPlan.finalRoundOmitPhases',
        severity: 'error',
        message: 'coupPlan.finalRoundOmitPhases must be an array of phase ids when declared.',
        suggestion: 'Set finalRoundOmitPhases to an array of coupPlan phase ids.',
      });
    } else {
      for (const [index, phaseId] of rawCoupPlan.finalRoundOmitPhases.entries()) {
        if (typeof phaseId !== 'string' || phaseId.trim() === '') {
          diagnostics.push({
            code: 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_INVALID',
            path: `doc.coupPlan.finalRoundOmitPhases.${index}`,
            severity: 'error',
            message: 'finalRoundOmitPhases entries must be non-empty strings.',
            suggestion: 'Use coupPlan phase ids.',
          });
          continue;
        }

        if (!declaredPhaseIds.has(phaseId)) {
          diagnostics.push({
            code: 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE',
            path: `doc.coupPlan.finalRoundOmitPhases.${index}`,
            severity: 'error',
            message: `Unknown coupPlan phase id "${phaseId}" in finalRoundOmitPhases.`,
            suggestion: 'Reference ids declared in coupPlan.phases.',
          });
        }
      }
    }
  }

  return rawCoupPlan as CoupPlanDef;
}

function lowerVictory(rawVictory: GameSpecDoc['victory'], diagnostics: Diagnostic[]): VictoryDef | undefined {
  if (rawVictory === null) {
    return undefined;
  }

  if (!isRecord(rawVictory)) {
    diagnostics.push({
      code: 'CNL_COMPILER_VICTORY_INVALID',
      path: 'doc.victory',
      severity: 'error',
      message: 'victory must be an object when declared.',
      suggestion: 'Provide victory.checkpoints and optional margins/ranking.',
    });
    return undefined;
  }

  if (!Array.isArray(rawVictory.checkpoints)) {
    diagnostics.push({
      code: 'CNL_COMPILER_VICTORY_REQUIRED_FIELD_MISSING',
      path: 'doc.victory.checkpoints',
      severity: 'error',
      message: 'victory.checkpoints is required and must be an array.',
      suggestion: 'Declare one or more victory checkpoint definitions.',
    });
    return undefined;
  }

  const seenCheckpointIds = new Set<string>();
  for (const [index, checkpoint] of rawVictory.checkpoints.entries()) {
    const checkpointPath = `doc.victory.checkpoints.${index}`;
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
        path: 'doc.victory.margins',
        severity: 'error',
        message: 'victory.margins must be an array when declared.',
        suggestion: 'Set margins to an array of faction/value definitions.',
      });
    } else {
      for (const [index, margin] of rawVictory.margins.entries()) {
        const marginPath = `doc.victory.margins.${index}`;
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
        path: 'doc.victory.ranking',
        severity: 'error',
        message: 'victory.ranking must be an object when declared.',
        suggestion: 'Set ranking.order to "desc" or "asc".',
      });
    } else if (rawVictory.ranking.order !== 'desc' && rawVictory.ranking.order !== 'asc') {
      diagnostics.push({
        code: 'CNL_COMPILER_VICTORY_RANKING_ORDER_INVALID',
        path: 'doc.victory.ranking.order',
        severity: 'error',
        message: 'victory.ranking.order must be "desc" or "asc".',
        suggestion: 'Use "desc" for high-to-low or "asc" for low-to-high ranking.',
      });
    }
  }

  return rawVictory as VictoryDef;
}

function lowerOperationProfiles(
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
  const actionIdBindings = new Set<string>();

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
    if (actionIdBindings.has(actionId)) {
      diagnostics.push({
        code: 'CNL_COMPILER_OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS',
        path: `${basePath}.actionId`,
        severity: 'error',
        message: `Multiple operation profiles map to action "${actionId}".`,
        suggestion: 'Map each action id to at most one operation profile.',
      });
      continue;
    }
    actionIdBindings.add(actionId);

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

    // Lower legality
    const rawLegality = rawProfile.legality;
    let legalityWhen: ConditionAST | undefined;
    if (rawLegality.when !== undefined) {
      const loweredWhen = lowerOptionalCondition(rawLegality.when, ownershipByBase, [], diagnostics, `${basePath}.legality.when`);
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
      const loweredValidate = lowerOptionalCondition(rawCost.validate, ownershipByBase, [], diagnostics, `${basePath}.cost.validate`);
      if (loweredValidate !== undefined && loweredValidate !== null) {
        costValidate = loweredValidate;
      }
    }
    if (rawCost.spend !== undefined) {
      const loweredSpend = lowerEffectsWithDiagnostics(rawCost.spend, ownershipByBase, diagnostics, `${basePath}.cost.spend`);
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
      const loweredFilter = lowerOptionalCondition(rawTargeting.filter, ownershipByBase, [], diagnostics, `${basePath}.targeting.filter`);
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

    // Lower resolution stages
    const resolution: OperationResolutionStageDef[] = [];
    for (const [stageIdx, rawStage] of (rawProfile.resolution as Record<string, unknown>[]).entries()) {
      const stagePath = `${basePath}.resolution[${stageIdx}]`;
      const loweredEffects = lowerEffectsWithDiagnostics(
        rawStage.effects ?? [],
        ownershipByBase,
        diagnostics,
        `${stagePath}.effects`,
      );
      const stage: OperationResolutionStageDef = {
        ...(typeof rawStage.stage === 'string' ? { stage: rawStage.stage } : {}),
        effects: loweredEffects,
      };
      resolution.push(stage);
    }

    lowered.push({
      id,
      actionId: asActionId(actionId),
      legality,
      cost,
      targeting,
      resolution,
      partialExecution: { mode: partialExecution.mode },
      ...(linkedSpecialActivityWindows === undefined ? {} : { linkedSpecialActivityWindows }),
    });
  }

  return lowered;
}

function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
  readonly eventCards?: readonly EventCardDef[];
} {
  if (doc.dataAssets === null) {
    return { zones: null, tokenTypes: null };
  }

  const mapAssets: Array<{ readonly id: string; readonly payload: MapPayload }> = [];
  const pieceCatalogAssets: Array<{ readonly id: string; readonly payload: PieceCatalogPayload }> = [];
  const scenarioRefs: Array<{
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly path: string;
    readonly entityId: string;
  }> = [];
  const eventCardSetAssets: Array<{
    readonly id: string;
    readonly payload: EventCardSetPayload;
    readonly path: string;
  }> = [];

  for (const [index, rawAsset] of doc.dataAssets.entries()) {
    if (!isRecord(rawAsset)) {
      continue;
    }
    const pathPrefix = `doc.dataAssets.${index}`;
    const validated = validateDataAssetEnvelope(rawAsset, {
      expectedKinds: ['map', 'scenario', 'pieceCatalog', 'eventCardSet'],
      pathPrefix,
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
      continue;
    }

    if (validated.asset.kind === 'map') {
      mapAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as MapPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'pieceCatalog') {
      pieceCatalogAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as PieceCatalogPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'scenario') {
      const payload = validated.asset.payload;
      if (!isRecord(payload)) {
        continue;
      }
      const mapAssetId =
        typeof payload.mapAssetId === 'string' && payload.mapAssetId.trim() !== '' ? payload.mapAssetId.trim() : undefined;
      const pieceCatalogAssetId =
        typeof payload.pieceCatalogAssetId === 'string' && payload.pieceCatalogAssetId.trim() !== ''
          ? payload.pieceCatalogAssetId.trim()
          : undefined;
      scenarioRefs.push({
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
        path: `${pathPrefix}.payload`,
        entityId: validated.asset.id,
      });
      continue;
    }

    if (validated.asset.kind === 'eventCardSet') {
      eventCardSetAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as EventCardSetPayload,
        path: `${pathPrefix}.payload.cards`,
      });
    }
  }

  const selectedScenario = scenarioRefs.length > 0 ? scenarioRefs[0] : undefined;
  if (scenarioRefs.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple scenario assets found (${scenarioRefs.length}); compiler cannot determine a single canonical scenario.`,
      suggestion: 'Keep one scenario asset in the compiled document.',
    });
  }

  const selectedMap = selectAssetById(
    mapAssets,
    selectedScenario?.mapAssetId,
    diagnostics,
    'map',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  const selectedPieceCatalog = selectAssetById(
    pieceCatalogAssets,
    selectedScenario?.pieceCatalogAssetId,
    diagnostics,
    'pieceCatalog',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );

  const zones =
    selectedMap === undefined
      ? null
      : selectedMap.payload.spaces.map((space) => ({
          id: space.id,
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: [...space.adjacentTo].sort((left, right) => left.localeCompare(right)),
        }));

  const tokenTypes =
    selectedPieceCatalog === undefined
      ? null
      : selectedPieceCatalog.payload.pieceTypes.map((pieceType) => ({
          id: pieceType.id,
          props: Object.fromEntries(
            [...pieceType.statusDimensions]
              .sort((left, right) => left.localeCompare(right))
              .map((dimension) => [dimension, 'string']),
          ),
        }));

  let eventCards: readonly EventCardDef[] | undefined;
  if (eventCardSetAssets.length === 1) {
    const [selectedSet] = eventCardSetAssets;
    if (selectedSet !== undefined) {
      eventCards = lowerEventCards(selectedSet.payload.cards, diagnostics, selectedSet.path);
    }
  } else if (eventCardSetAssets.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_EVENT_CARD_SET_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple eventCardSet assets found (${eventCardSetAssets.length}); compiler cannot determine a single canonical event-card source.`,
      suggestion: 'Keep one eventCardSet asset in the compiled document.',
      alternatives: eventCardSetAssets
        .map((asset) => asset.id)
        .sort((left, right) => left.localeCompare(right)),
    });
  }

  return {
    zones,
    tokenTypes,
    ...(eventCards === undefined ? {} : { eventCards }),
  };
}

function lowerEventCards(
  cards: readonly EventCardDef[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventCardDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();

  const lowered = cards.map((card, index) => {
    const cardPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(card.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_CARD_ID_DUPLICATE',
        path: `${cardPath}.id`,
        severity: 'error',
        message: `Duplicate event card id "${card.id}".`,
        suggestion: 'Use unique event card ids inside one eventCardSet payload.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (card.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(card.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: 'CNL_COMPILER_EVENT_CARD_ORDER_AMBIGUOUS',
          path: `${cardPath}.order`,
          severity: 'error',
          message: `Event card order ${card.order} is declared more than once in the same eventCardSet.`,
          suggestion: 'Use unique order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(card.order, index);
      }
    }

    const unshaded =
      card.unshaded === undefined
        ? undefined
        : lowerEventCardSide(card.unshaded, diagnostics, `${cardPath}.unshaded`);
    const shaded = card.shaded === undefined ? undefined : lowerEventCardSide(card.shaded, diagnostics, `${cardPath}.shaded`);

    return {
      index,
      card: {
        ...card,
        ...(unshaded === undefined ? {} : { unshaded }),
        ...(shaded === undefined ? {} : { shaded }),
      },
    };
  });

  lowered.sort((left, right) => {
    const leftOrder = left.card.order;
    const rightOrder = right.card.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.card.id).localeCompare(normalizeIdentifier(right.card.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return lowered.map((entry) => entry.card);
}

function lowerEventCardSide(
  side: NonNullable<EventCardDef['unshaded']>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): NonNullable<EventCardDef['unshaded']> {
  if (side.branches === undefined) {
    return side;
  }

  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();
  const loweredBranches = side.branches.map((branch, index) => {
    const branchPath = `${pathPrefix}.branches.${index}`;
    const normalizedId = normalizeIdentifier(branch.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ID_DUPLICATE',
        path: `${branchPath}.id`,
        severity: 'error',
        message: `Duplicate event card branch id "${branch.id}" within one side.`,
        suggestion: 'Use unique branch ids inside each event card side.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (branch.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(branch.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ORDER_AMBIGUOUS',
          path: `${branchPath}.order`,
          severity: 'error',
          message: `Event card branch order ${branch.order} is declared more than once within one side.`,
          suggestion: 'Use unique branch order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(branch.order, index);
      }
    }

    return {
      index,
      branch,
    };
  });

  loweredBranches.sort((left, right) => {
    const leftOrder = left.branch.order;
    const rightOrder = right.branch.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.branch.id).localeCompare(normalizeIdentifier(right.branch.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return {
    ...side,
    branches: loweredBranches.map((entry) => entry.branch),
  };
}

function selectAssetById<TPayload>(
  assets: ReadonlyArray<{ readonly id: string; readonly payload: TPayload }>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  kind: 'map' | 'pieceCatalog',
  selectedPath: string,
  entityId?: string,
): { readonly id: string; readonly payload: TPayload } | undefined {
  if (selectedId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedId);
    const matched = assets.find((asset) => normalizeIdentifier(asset.id) === normalizedSelectedId);
    if (matched !== undefined) {
      return matched;
    }

    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_REF_MISSING',
      path: `${selectedPath}.${kind}AssetId`,
      severity: 'error',
      message: `Scenario references unknown ${kind} asset "${selectedId}".`,
      suggestion: `Use an existing ${kind} asset id from doc.dataAssets.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
      ...(entityId === undefined ? {} : { entityId }),
    });
    return undefined;
  }

  if (assets.length === 1) {
    return assets[0];
  }

  if (assets.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple ${kind} assets found (${assets.length}); compiler cannot infer which one to use.`,
      suggestion: `Provide a scenario asset referencing exactly one ${kind} asset id.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
    });
  }

  return undefined;
}

function finalizeDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceMap: GameSpecSourceMap | undefined,
  maxDiagnosticCount: number,
): readonly Diagnostic[] {
  const sorted = sortDiagnosticsDeterministic(diagnostics, sourceMap);
  const deduped = dedupeDiagnostics(sorted);
  return capDiagnostics(deduped, maxDiagnosticCount);
}

function lowerConstants(
  constants: GameSpecDoc['constants'],
  diagnostics: Diagnostic[],
): Readonly<Record<string, number>> {
  if (constants === null) {
    return {};
  }

  const output: Record<string, number> = {};
  for (const [name, value] of Object.entries(constants)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      diagnostics.push(missingCapabilityDiagnostic(`doc.constants.${name}`, 'constant value', value, ['number']));
      continue;
    }
    output[name] = value;
  }
  return output;
}

function lowerVarDefs(
  variables: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.globalVars' | 'doc.perPlayerVars',
): readonly VariableDef[] {
  if (variables === null) {
    return [];
  }

  const lowered: VariableDef[] = [];
  for (const [index, variable] of variables.entries()) {
    const path = `${pathPrefix}.${index}`;
    if (!isRecord(variable)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    if (
      typeof variable.name !== 'string' ||
      variable.name.trim() === '' ||
      variable.type !== 'int' ||
      !isFiniteNumber(variable.init) ||
      !isFiniteNumber(variable.min) ||
      !isFiniteNumber(variable.max)
    ) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    lowered.push({
      name: variable.name,
      type: 'int',
      init: variable.init,
      min: variable.min,
      max: variable.max,
    });
  }
  return lowered;
}

function lowerTokenTypes(tokenTypes: GameSpecDoc['tokenTypes'], diagnostics: Diagnostic[]): readonly TokenTypeDef[] {
  if (tokenTypes === null) {
    return [];
  }

  const lowered: TokenTypeDef[] = [];
  for (const [index, tokenType] of tokenTypes.entries()) {
    const path = `doc.tokenTypes.${index}`;
    if (!isRecord(tokenType) || typeof tokenType.id !== 'string' || tokenType.id.trim() === '' || !isRecord(tokenType.props)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'token type definition', tokenType));
      continue;
    }

    const props: Record<string, 'int' | 'string' | 'boolean'> = {};
    let validProps = true;
    for (const [propName, propType] of Object.entries(tokenType.props)) {
      if (propType !== 'int' && propType !== 'string' && propType !== 'boolean') {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.props.${propName}`, 'token prop type', propType, ['int', 'string', 'boolean']),
        );
        validProps = false;
      } else {
        props[propName] = propType;
      }
    }
    if (!validProps) {
      continue;
    }
    lowered.push({
      id: tokenType.id,
      props,
    });
  }
  return lowered;
}

function lowerTurnStructure(
  turnStructure: NonNullable<GameSpecDoc['turnStructure']>,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): TurnStructure {
  const phasesSource = Array.isArray(turnStructure.phases) ? turnStructure.phases : [];
  const phases: PhaseDef[] = phasesSource.map((phase, phaseIndex) => {
    const path = `doc.turnStructure.phases.${phaseIndex}`;
    if (!isRecord(phase) || typeof phase.id !== 'string' || phase.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'phase definition', phase));
      return {
        id: asPhaseId(`invalid-phase-${phaseIndex}`),
      };
    }

    const onEnter = Array.isArray(phase.onEnter)
      ? lowerEffectsWithDiagnostics(phase.onEnter, ownershipByBase, diagnostics, `${path}.onEnter`)
      : undefined;
    const onExit = Array.isArray(phase.onExit)
      ? lowerEffectsWithDiagnostics(phase.onExit, ownershipByBase, diagnostics, `${path}.onExit`)
      : undefined;

    return {
      id: asPhaseId(phase.id),
      ...(onEnter === undefined ? {} : { onEnter }),
      ...(onExit === undefined ? {} : { onExit }),
    };
  });

  const activePlayerOrder =
    turnStructure.activePlayerOrder === 'roundRobin' || turnStructure.activePlayerOrder === 'fixed'
      ? turnStructure.activePlayerOrder
      : 'roundRobin';

  if (activePlayerOrder !== turnStructure.activePlayerOrder) {
    diagnostics.push(
      missingCapabilityDiagnostic('doc.turnStructure.activePlayerOrder', 'turnStructure.activePlayerOrder', turnStructure.activePlayerOrder, [
        'roundRobin',
        'fixed',
      ]),
    );
  }

  return {
    phases,
    activePlayerOrder,
  };
}

function lowerActions(
  actions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly ActionDef[] {
  const lowered: ActionDef[] = [];
  for (const [index, action] of actions.entries()) {
    const path = `doc.actions.${index}`;
    if (!isRecord(action)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    if (typeof action.id !== 'string' || action.id.trim() === '' || typeof action.phase !== 'string' || action.phase.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    const actor = normalizePlayerSelector(action.actor, `${path}.actor`);
    diagnostics.push(...actor.diagnostics);

    const params = lowerActionParams(action.params, ownershipByBase, diagnostics, `${path}.params`);
    const bindingScope = params.bindingScope;
    const pre = lowerOptionalCondition(action.pre, ownershipByBase, bindingScope, diagnostics, `${path}.pre`);
    const cost = lowerEffectsWithDiagnostics(action.cost, ownershipByBase, diagnostics, `${path}.cost`, bindingScope);
    const effects = lowerEffectsWithDiagnostics(action.effects, ownershipByBase, diagnostics, `${path}.effects`, bindingScope);
    const limits = lowerActionLimits(action.limits, diagnostics, `${path}.limits`);

    if (actor.value === null || (action.pre !== null && pre === null)) {
      continue;
    }

    lowered.push({
      id: asActionId(action.id),
      actor: actor.value,
      phase: asPhaseId(action.phase),
      params: params.value,
      pre: pre ?? null,
      cost,
      effects,
      limits,
    });
  }

  return lowered;
}

function lowerActionParams(
  paramsSource: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): {
  readonly value: readonly ParamDef[];
  readonly bindingScope: readonly string[];
} {
  if (!Array.isArray(paramsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action params', paramsSource, ['array']));
    return { value: [], bindingScope: [] };
  }

  const value: ParamDef[] = [];
  const bindingScope: string[] = [];
  paramsSource.forEach((param, paramIndex) => {
    const paramPath = `${path}.${paramIndex}`;
    if (!isRecord(param) || typeof param.name !== 'string' || param.name.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(paramPath, 'action param', param));
      return;
    }

    const domain = lowerQueryNode(param.domain, { ownershipByBase }, `${paramPath}.domain`);
    diagnostics.push(...domain.diagnostics);
    if (domain.value === null) {
      return;
    }

    value.push({
      name: param.name,
      domain: domain.value,
    });
    bindingScope.push(toBindingToken(param.name));
  });

  return {
    value,
    bindingScope,
  };
}

function lowerActionLimits(limitsSource: unknown, diagnostics: Diagnostic[], path: string): readonly LimitDef[] {
  if (!Array.isArray(limitsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action limits', limitsSource, ['array']));
    return [];
  }

  const limits: LimitDef[] = [];
  for (const [index, limit] of limitsSource.entries()) {
    const limitPath = `${path}.${index}`;
    const maxValue = isRecord(limit) && typeof limit.max === 'number' ? limit.max : null;
    if (
      !isRecord(limit) ||
      (limit.scope !== 'turn' && limit.scope !== 'phase' && limit.scope !== 'game') ||
      maxValue === null ||
      !Number.isInteger(maxValue) ||
      maxValue < 0
    ) {
      diagnostics.push(missingCapabilityDiagnostic(limitPath, 'action limit', limit, ['{ scope: turn|phase|game, max: int>=0 }']));
      continue;
    }
    limits.push({
      scope: limit.scope,
      max: maxValue,
    });
  }
  return limits;
}

function lowerTriggers(
  triggers: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly TriggerDef[] {
  const lowered: TriggerDef[] = [];
  for (const [index, trigger] of triggers.entries()) {
    const path = `doc.triggers.${index}`;
    if (!isRecord(trigger)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'trigger definition', trigger));
      continue;
    }

    const event = lowerTriggerEvent(trigger.event, ownershipByBase, diagnostics, `${path}.event`);
    const match = lowerOptionalCondition(trigger.match, ownershipByBase, [], diagnostics, `${path}.match`);
    const when = lowerOptionalCondition(trigger.when, ownershipByBase, [], diagnostics, `${path}.when`);
    const effects = lowerEffectsWithDiagnostics(trigger.effects, ownershipByBase, diagnostics, `${path}.effects`);

    if (event === null || match === null || when === null) {
      continue;
    }

    const triggerId = typeof trigger.id === 'string' && trigger.id.trim() !== '' ? trigger.id : `trigger_${index}`;
    lowered.push({
      id: asTriggerId(triggerId),
      event,
      ...(match === undefined ? {} : { match }),
      ...(when === undefined ? {} : { when }),
      effects,
    });
  }
  return lowered;
}

function lowerTriggerEvent(
  event: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): TriggerEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'trigger event', event));
    return null;
  }

  switch (event.type) {
    case 'phaseEnter':
    case 'phaseExit':
      if (typeof event.phase !== 'string' || event.phase.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.phase`, `${event.type} phase`, event.phase, ['phase id']));
        return null;
      }
      return { type: event.type, phase: asPhaseId(event.phase) };
    case 'turnStart':
    case 'turnEnd':
      return { type: event.type };
    case 'actionResolved':
      if (event.action === undefined) {
        return { type: 'actionResolved' };
      }
      if (typeof event.action !== 'string' || event.action.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.action`, 'actionResolved action', event.action, ['action id']));
        return null;
      }
      return { type: 'actionResolved', action: asActionId(event.action) };
    case 'tokenEntered':
      if (event.zone === undefined) {
        return { type: 'tokenEntered' };
      }
      if (typeof event.zone !== 'string') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.zone`, 'tokenEntered zone', event.zone, ['zone selector string']));
        return null;
      }
      return { type: 'tokenEntered', zone: event.zone as GameDef['zones'][number]['id'] };
    default:
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.type`, 'trigger event type', event.type, [
          'phaseEnter',
          'phaseExit',
          'turnStart',
          'turnEnd',
          'actionResolved',
          'tokenEntered',
        ]),
      );
      return null;
  }
}

function lowerEndConditions(
  endConditions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly EndCondition[] {
  const lowered: EndCondition[] = [];
  for (const [index, endCondition] of endConditions.entries()) {
    const path = `doc.endConditions.${index}`;
    if (!isRecord(endCondition)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'end condition', endCondition));
      continue;
    }

    const when = lowerConditionNode(endCondition.when, { ownershipByBase }, `${path}.when`);
    diagnostics.push(...when.diagnostics);
    const result = lowerTerminalResult(endCondition.result, diagnostics, `${path}.result`);

    if (when.value === null || result === null) {
      continue;
    }

    lowered.push({
      when: when.value,
      result,
    });
  }
  return lowered;
}

function lowerTerminalResult(
  result: unknown,
  diagnostics: Diagnostic[],
  path: string,
): EndCondition['result'] | null {
  if (!isRecord(result) || typeof result.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'end condition result', result));
    return null;
  }

  switch (result.type) {
    case 'draw':
      return { type: 'draw' };
    case 'lossAll':
      return { type: 'lossAll' };
    case 'score':
      return { type: 'score' };
    case 'win': {
      const player = normalizePlayerSelector(result.player, `${path}.player`);
      diagnostics.push(...player.diagnostics);
      if (player.value === null) {
        return null;
      }
      return {
        type: 'win',
        player: player.value,
      };
    }
    default:
      diagnostics.push(missingCapabilityDiagnostic(`${path}.type`, 'end condition result type', result.type, ['win', 'lossAll', 'draw', 'score']));
      return null;
  }
}

function lowerOptionalCondition(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  bindingScope: readonly string[],
  diagnostics: Diagnostic[],
  path: string,
): ConditionAST | null | undefined {
  if (source === null) {
    return null;
  }
  if (source === undefined) {
    return undefined;
  }
  const lowered = lowerConditionNode(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value;
}

function lowerEffectsWithDiagnostics(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
  bindingScope: readonly string[] = [],
): readonly EffectAST[] {
  if (!Array.isArray(source)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'effects array', source, ['array']));
    return [];
  }

  const lowered = lowerEffectArray(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value ?? [];
}

function requiredSectionDiagnostic(path: string, section: string): Diagnostic {
  return {
    code: 'CNL_COMPILER_REQUIRED_SECTION_MISSING',
    path,
    severity: 'error',
    message: `Required section "${section}" is missing.`,
    suggestion: `Provide doc.${section} before compilation.`,
  };
}

function missingCapabilityDiagnostic(
  path: string,
  label: string,
  actual: unknown,
  alternatives: readonly string[] = [],
): Diagnostic {
  return {
    code: 'CNL_COMPILER_MISSING_CAPABILITY',
    path,
    severity: 'error',
    message: `Cannot lower ${label}: ${formatValue(actual)}.`,
    suggestion: alternatives.length > 0 ? `Use one of the supported forms.` : 'Use a supported compiler shape.',
    ...(alternatives.length === 0 ? {} : { alternatives: [...alternatives] }),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toBindingToken(name: string): string {
  return name.startsWith('$') ? name : `$${name}`;
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}

function resolveLimit(candidate: number | undefined, fallback: number, name: keyof CompileLimits): number {
  if (candidate === undefined) {
    return fallback;
  }
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${name} must be an integer >= 0.`);
  }
  return candidate;
}

function expandZoneMacros(
  zones: GameSpecDoc['zones'],
  maxGeneratedZones: number,
  diagnostics: Diagnostic[],
): GameSpecDoc['zones'] {
  if (zones === null) {
    return null;
  }

  const expandedZones: unknown[] = [];
  let generatedZones = 0;

  for (const [index, zone] of zones.entries()) {
    if (!isBoardMacroZone(zone)) {
      expandedZones.push(zone);
      continue;
    }

    const macroPath = `doc.zones.${index}`;
    const args = zone.args.map((value) => (typeof value === 'number' ? value : Number.NaN));
    const expansion = expandBoardMacro(zone.macro, args, macroPath);
    diagnostics.push(...expansion.diagnostics);
    if (expansion.diagnostics.length > 0) {
      continue;
    }

    const nextGeneratedZones = generatedZones + expansion.zones.length;
    if (nextGeneratedZones > maxGeneratedZones) {
      diagnostics.push({
        code: 'CNL_COMPILER_LIMIT_EXCEEDED',
        path: macroPath,
        severity: 'error',
        message: `Macro expansion exceeded maxGeneratedZones (${nextGeneratedZones} > ${maxGeneratedZones}).`,
        suggestion: 'Reduce board macro output size or increase compile limit maxGeneratedZones.',
      });
      continue;
    }

    generatedZones = nextGeneratedZones;
    expandedZones.push(...expansion.zones.map(zoneDefToSpecZone));
  }

  return expandedZones as GameSpecDoc['zones'];
}

function expandEffectSections(
  sections: Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'>,
  maxExpandedEffects: number,
  diagnostics: Diagnostic[],
): Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'> {
  const state: ExpansionState = {
    maxExpandedEffects,
    expandedEffects: 0,
    diagnostics,
  };

  return {
    setup:
      sections.setup === null
        ? null
        : (expandEffectArray(sections.setup, 'doc.setup', state) as GameSpecDoc['setup']),
    actions:
      sections.actions === null
        ? null
        : (sections.actions.map((action, actionIndex) =>
            expandActionEffects(action, actionIndex, state),
          ) as GameSpecDoc['actions']),
    triggers:
      sections.triggers === null
        ? null
        : (sections.triggers.map((trigger, triggerIndex) =>
            expandTriggerEffects(trigger, triggerIndex, state),
          ) as GameSpecDoc['triggers']),
    turnStructure: expandTurnStructureEffects(sections.turnStructure, state),
  };
}

function expandTurnStructureEffects(
  turnStructure: GameSpecDoc['turnStructure'],
  state: ExpansionState,
): GameSpecDoc['turnStructure'] {
  if (!isRecord(turnStructure) || !Array.isArray(turnStructure.phases)) {
    return turnStructure;
  }

  const phases = turnStructure.phases.map((phase, phaseIndex) => {
    if (!isRecord(phase)) {
      return phase;
    }
    const onEnter = Array.isArray(phase.onEnter)
      ? expandEffectArray(phase.onEnter, `doc.turnStructure.phases.${phaseIndex}.onEnter`, state)
      : phase.onEnter;
    const onExit = Array.isArray(phase.onExit)
      ? expandEffectArray(phase.onExit, `doc.turnStructure.phases.${phaseIndex}.onExit`, state)
      : phase.onExit;
    return {
      ...phase,
      ...(onEnter !== phase.onEnter ? { onEnter } : {}),
      ...(onExit !== phase.onExit ? { onExit } : {}),
    };
  });

  return {
    ...turnStructure,
    phases,
  } as GameSpecDoc['turnStructure'];
}

function expandActionEffects(action: unknown, actionIndex: number, state: ExpansionState): unknown {
  if (!isRecord(action)) {
    return action;
  }

  const cost = Array.isArray(action.cost)
    ? expandEffectArray(action.cost, `doc.actions.${actionIndex}.cost`, state)
    : action.cost;
  const effects = Array.isArray(action.effects)
    ? expandEffectArray(action.effects, `doc.actions.${actionIndex}.effects`, state)
    : action.effects;

  return {
    ...action,
    ...(cost !== action.cost ? { cost } : {}),
    ...(effects !== action.effects ? { effects } : {}),
  };
}

function expandTriggerEffects(trigger: unknown, triggerIndex: number, state: ExpansionState): unknown {
  if (!isRecord(trigger) || !Array.isArray(trigger.effects)) {
    return trigger;
  }

  return {
    ...trigger,
    effects: expandEffectArray(trigger.effects, `doc.triggers.${triggerIndex}.effects`, state),
  };
}

function expandEffectArray(effects: readonly unknown[], path: string, state: ExpansionState): readonly unknown[] {
  const expanded: unknown[] = [];
  for (const [index, effect] of effects.entries()) {
    expanded.push(...expandSingleEffect(effect, `${path}.${index}`, state));
  }
  return expanded;
}

function expandSingleEffect(effect: unknown, path: string, state: ExpansionState): readonly unknown[] {
  if (!isRecord(effect)) {
    return [effect];
  }

  const refillToSize = expandRefillToSize(effect, path, state);
  if (refillToSize !== undefined) {
    return refillToSize;
  }

  const discardDownTo = expandDiscardDownTo(effect, path, state);
  if (discardDownTo !== undefined) {
    return [discardDownTo];
  }

  const drawEach = expandDrawEach(effect, path, state);
  if (drawEach !== undefined) {
    return [drawEach];
  }

  if (isRecord(effect.if)) {
    const thenEffects = Array.isArray(effect.if.then)
      ? expandEffectArray(effect.if.then, `${path}.if.then`, state)
      : effect.if.then;
    const elseEffects = Array.isArray(effect.if.else)
      ? expandEffectArray(effect.if.else, `${path}.if.else`, state)
      : effect.if.else;

    return [
      {
        ...effect,
        if: {
          ...effect.if,
          ...(thenEffects !== effect.if.then ? { then: thenEffects } : {}),
          ...(elseEffects !== effect.if.else ? { else: elseEffects } : {}),
        },
      },
    ];
  }

  if (isRecord(effect.forEach) && Array.isArray(effect.forEach.effects)) {
    return [
      {
        ...effect,
        forEach: {
          ...effect.forEach,
          effects: expandEffectArray(effect.forEach.effects, `${path}.forEach.effects`, state),
        },
      },
    ];
  }

  if (isRecord(effect.let) && Array.isArray(effect.let.in)) {
    return [
      {
        ...effect,
        let: {
          ...effect.let,
          in: expandEffectArray(effect.let.in, `${path}.let.in`, state),
        },
      },
    ];
  }

  return [effect];
}

function expandRefillToSize(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): readonly unknown[] | undefined {
  const refillNode = effect.refillToSize;
  if (!isRecord(refillNode)) {
    return undefined;
  }

  if (!isValidMacroSize(refillNode.size)) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path: `${path}.refillToSize.size`,
      severity: 'error',
      message: 'refillToSize requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit if + draw effects with count: 1.',
    });
    return [effect];
  }

  if (typeof refillNode.zone !== 'string' || typeof refillNode.fromZone !== 'string') {
    return [effect];
  }

  const size = refillNode.size;
  if (!consumeExpandedEffects(path, state, size, 'refillToSize')) {
    return [effect];
  }

  const expanded: unknown[] = [];
  for (let index = 0; index < size; index += 1) {
    expanded.push({
      if: {
        when: {
          op: '<',
          left: { ref: 'zoneCount', zone: refillNode.zone },
          right: size,
        },
        then: [{ draw: { from: refillNode.fromZone, to: refillNode.zone, count: 1 } }],
        else: [],
      },
    });
  }

  return expanded;
}

function expandDiscardDownTo(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): unknown | undefined {
  const discardNode = effect.discardDownTo;
  if (!isRecord(discardNode)) {
    return undefined;
  }

  if (!isValidMacroSize(discardNode.size)) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path: `${path}.discardDownTo.size`,
      severity: 'error',
      message: 'discardDownTo requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit token loop gated by zoneCount(zone) > size.',
    });
    return effect;
  }

  if (typeof discardNode.zone !== 'string') {
    return effect;
  }

  if (!consumeExpandedEffects(path, state, 1, 'discardDownTo')) {
    return effect;
  }

  const surplusGuard = {
    op: '>',
    left: { ref: 'zoneCount', zone: discardNode.zone },
    right: discardNode.size,
  };

  const thenEffects =
    typeof discardNode.to === 'string'
      ? [{ moveToken: { token: '$tok', from: discardNode.zone, to: discardNode.to } }]
      : [{ destroyToken: { token: '$tok' } }];

  return {
    forEach: {
      bind: '$tok',
      over: { query: 'tokensInZone', zone: discardNode.zone },
      effects: [
        {
          if: {
            when: surplusGuard,
            then: thenEffects,
            else: [],
          },
        },
      ],
    },
  };
}

function expandDrawEach(effect: Record<string, unknown>, path: string, state: ExpansionState): unknown | undefined {
  const drawNode = effect.draw;
  if (!isRecord(drawNode) || drawNode.to !== 'hand:each') {
    return undefined;
  }

  if (!consumeExpandedEffects(path, state, 1, 'draw:each', `${path}.draw.to`)) {
    return effect;
  }

  return {
    forEach: {
      bind: '$p',
      over: { query: 'players' },
      effects: [
        {
          draw: {
            ...drawNode,
            to: 'hand:$p',
          },
        },
      ],
    },
  };
}

function zoneDefToSpecZone(zone: {
  readonly id: unknown;
  readonly owner: unknown;
  readonly visibility: unknown;
  readonly ordering: unknown;
  readonly adjacentTo?: readonly unknown[];
}): unknown {
  const adjacentTo = zone.adjacentTo?.map((entry) => String(entry));
  if (adjacentTo === undefined) {
    return {
      id: String(zone.id),
      owner: zone.owner,
      visibility: zone.visibility,
      ordering: zone.ordering,
    };
  }

  return {
    id: String(zone.id),
    owner: zone.owner,
    visibility: zone.visibility,
    ordering: zone.ordering,
    adjacentTo,
  };
}

function isBoardMacroZone(value: unknown): value is { readonly macro: string; readonly args: readonly unknown[] } {
  return isRecord(value) && typeof value.macro === 'string' && Array.isArray(value.args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidMacroSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function consumeExpandedEffects(
  path: string,
  state: ExpansionState,
  count: number,
  macroName: string,
  diagnosticPath = path,
): boolean {
  const nextExpandedEffects = state.expandedEffects + count;
  if (nextExpandedEffects > state.maxExpandedEffects) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_LIMIT_EXCEEDED',
      path: diagnosticPath,
      severity: 'error',
      message: `Macro expansion exceeded maxExpandedEffects (${nextExpandedEffects} > ${state.maxExpandedEffects}).`,
      suggestion: `Reduce ${macroName} expansion count or increase compile limit maxExpandedEffects.`,
    });
    return false;
  }

  state.expandedEffects = nextExpandedEffects;
  return true;
}

interface ExpansionState {
  readonly maxExpandedEffects: number;
  expandedEffects: number;
  readonly diagnostics: Diagnostic[];
}
