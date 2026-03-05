import type { Diagnostic } from './diagnostics.js';
import {
  analyzeSeatOrderShape,
  buildSeatResolutionIndex,
  normalizeSeatKey,
  resolvePlayerIndexForTurnFlowSeat,
} from './seat-resolution.js';
import {
  CARD_SEAT_ORDER_MIN_DISTINCT_SEATS,
  isCardSeatOrderDistinctSeatCountValid,
} from './turn-flow-seat-order-policy.js';
import type { ConditionAST, GameDef, ValueExpr } from './types.js';
import { validateConditionAst, validateEffectAst, validateValueExpr } from './validate-gamedef-behavior.js';
import { type ValidationContext, checkDuplicateIds, pushMissingReferenceDiagnostic } from './validate-gamedef-structure.js';
import { forEachDefined } from './validate-gamedef-utils.js';
import {
  collectTurnFlowEligibilityOverrideWindowIds,
  findMissingTurnFlowLinkedWindows,
} from '../contracts/index.js';

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
  const turnPhaseIds = new Set(def.turnStructure.phases.map((phase) => String(phase.id)));
  coupPlan.phases.forEach((phase, index) => {
    if (turnPhaseIds.has(phase.id)) {
      return;
    }
    diagnostics.push({
      code: 'COUP_PLAN_PHASE_NOT_IN_TURN_STRUCTURE',
      path: `turnOrder.config.coupPlan.phases[${index}].id`,
      severity: 'error',
      message: `coupPlan phase "${phase.id}" is not declared in turnStructure.phases.`,
      suggestion: 'Declare each coupPlan phase id in turnStructure.phases with exact id match.',
    });
  });

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

export const validateCardSeatOrderMapping = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (def.turnOrder?.type !== 'cardDriven') {
    return;
  }

  const turnFlow = def.turnOrder.config.turnFlow;
  const seatResolutionIndex = buildSeatResolutionIndex(def, def.seats?.length ?? 0);
  const firstSourceByCanonicalSeat = new Map<string, string>();
  for (const [seatIndex, seatValue] of turnFlow.eligibility.seats.entries()) {
    const path = `turnOrder.config.turnFlow.eligibility.seats[${seatIndex}]`;
    if (typeof seatValue !== 'string') {
      continue;
    }
    const playerIndex = resolvePlayerIndexForTurnFlowSeat(seatValue, seatResolutionIndex);
    if (playerIndex === null) {
      diagnostics.push({
        code: 'TURN_FLOW_ELIGIBILITY_SEAT_UNRESOLVABLE',
        path,
        severity: 'error',
        message: `turnFlow.eligibility.seats entry "${seatValue}" does not resolve to a declared canonical seat id in seats[].`,
        suggestion: 'Use canonical seat ids declared in seats[].id.',
      });
      continue;
    }

    const canonicalSeat = seatResolutionIndex.seatIdByPlayerIndex[playerIndex];
    if (typeof canonicalSeat !== 'string' || canonicalSeat.length === 0) {
      diagnostics.push({
        code: 'TURN_FLOW_ELIGIBILITY_SEAT_UNRESOLVABLE',
        path,
        severity: 'error',
        message: `turnFlow.eligibility.seats entry "${seatValue}" resolves to player index ${playerIndex}, but that index has no canonical seat id in seats[].`,
        suggestion: 'Define seats[] ids for all referenced turn-flow seat positions.',
      });
      continue;
    }

    const priorSource = firstSourceByCanonicalSeat.get(canonicalSeat);
    if (priorSource !== undefined) {
      diagnostics.push({
        code: 'TURN_FLOW_ELIGIBILITY_SEAT_DUPLICATE_RESOLVED',
        path,
        severity: 'error',
        message: `turnFlow.eligibility.seats entry "${seatValue}" resolves to canonical seat "${canonicalSeat}", which is already resolved by "${priorSource}".`,
        suggestion: 'Ensure eligibility.seats resolves each canonical seat at most once.',
      });
      continue;
    }

    firstSourceByCanonicalSeat.set(canonicalSeat, seatValue);
  }

  const seatSet = new Set(turnFlow.eligibility.seats);
  const mapping = turnFlow.cardSeatOrderMapping ?? {};

  const normalizedKeys = new Map<string, string>();
  const sourceKeyByMappedSeat = new Map<string, string>();
  for (const [sourceSeatKey, mappedSeat] of Object.entries(mapping)) {
    const keyPath = `turnOrder.config.turnFlow.cardSeatOrderMapping[${JSON.stringify(sourceSeatKey)}]`;

    if (!seatSet.has(mappedSeat)) {
      diagnostics.push({
        code: 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_UNKNOWN_SEAT',
        path: keyPath,
        severity: 'error',
        message: `cardSeatOrderMapping "${sourceSeatKey}" maps to "${mappedSeat}", which is not declared in turnFlow.eligibility.seats.`,
        suggestion: 'Map each source seat key to one of turnFlow.eligibility.seats.',
      });
    }

    const priorSource = sourceKeyByMappedSeat.get(mappedSeat);
    if (priorSource !== undefined) {
      diagnostics.push({
        code: 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_DUPLICATE',
        path: keyPath,
        severity: 'error',
        message: `cardSeatOrderMapping target "${mappedSeat}" is used by both "${priorSource}" and "${sourceSeatKey}".`,
        suggestion: 'Map each source seat key to a unique target seat.',
      });
    } else {
      sourceKeyByMappedSeat.set(mappedSeat, sourceSeatKey);
    }

    const normalizedSourceSeatKey = normalizeSeatKey(sourceSeatKey);
    if (normalizedSourceSeatKey.length === 0) {
      continue;
    }
    const priorNormalizedSource = normalizedKeys.get(normalizedSourceSeatKey);
    if (priorNormalizedSource !== undefined && priorNormalizedSource !== sourceSeatKey) {
      diagnostics.push({
        code: 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_SOURCE_COLLISION',
        path: keyPath,
        severity: 'error',
        message: `cardSeatOrderMapping key "${sourceSeatKey}" collides with "${priorNormalizedSource}" after normalization.`,
        suggestion: 'Use unique source seat keys that remain distinct after casing/punctuation normalization.',
      });
      continue;
    }
    normalizedKeys.set(normalizedSourceSeatKey, sourceSeatKey);
  }

  const metadataKey = turnFlow.cardSeatOrderMetadataKey;
  if (metadataKey === undefined || metadataKey.length === 0) {
    return;
  }

  for (const [deckIndex, deck] of (def.eventDecks ?? []).entries()) {
    for (const [cardIndex, card] of deck.cards.entries()) {
      const metadata = card.metadata;
      if (typeof metadata !== 'object' || metadata === null) {
        continue;
      }
      const rawSeatOrder = (metadata as Readonly<Record<string, unknown>>)[metadataKey];
      if (!Array.isArray(rawSeatOrder) || !rawSeatOrder.every((entry): entry is string => typeof entry === 'string')) {
        continue;
      }

      for (const [seatIndex, sourceSeat] of rawSeatOrder.entries()) {
        const mappedSeat = mapping[sourceSeat] ?? sourceSeat;
        if (seatSet.has(mappedSeat)) {
          continue;
        }
        diagnostics.push({
          code: 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_UNKNOWN_SEAT',
          path: `eventDecks[${deckIndex}].cards[${cardIndex}].metadata.${metadataKey}[${seatIndex}]`,
          severity: 'error',
          message: `Card seat-order value "${sourceSeat}" resolves to "${mappedSeat}", which is not in turnFlow.eligibility.seats.`,
          suggestion: 'Add or correct cardSeatOrderMapping, or align card metadata seat-order values with turnFlow.eligibility.seats.',
        });
      }

      const resolvedSeatOrder = rawSeatOrder.map((sourceSeat) => mapping[sourceSeat] ?? sourceSeat);
      const shape = analyzeSeatOrderShape(resolvedSeatOrder);
      if (shape.duplicateSeats.length > 0) {
        const firstDuplicateIndex = resolvedSeatOrder.findIndex(
          (seat, index) => resolvedSeatOrder.indexOf(seat) !== index,
        );
        if (firstDuplicateIndex >= 0) {
          diagnostics.push({
            code: 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DUPLICATE_SEAT',
            path: `eventDecks[${deckIndex}].cards[${cardIndex}].metadata.${metadataKey}[${firstDuplicateIndex}]`,
            severity: 'error',
            message: `Card seat-order resolves duplicate seat "${resolvedSeatOrder[firstDuplicateIndex] ?? ''}" in metadata key "${metadataKey}".`,
            suggestion: 'Ensure each card seat-order resolves to unique seats.',
          });
        }
      }
      if (!isCardSeatOrderDistinctSeatCountValid(shape.distinctSeatCount)) {
        diagnostics.push({
          code: 'TURN_FLOW_CARD_SEAT_ORDER_INSUFFICIENT_DISTINCT_SEATS',
          path: `eventDecks[${deckIndex}].cards[${cardIndex}].metadata.${metadataKey}`,
          severity: 'error',
          message: `Card seat-order resolves to ${shape.distinctSeatCount} distinct seat(s); at least ${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS} are required.`,
          suggestion: `Provide a card seat-order with at least ${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS} distinct seats.`,
        });
      }
    }
  }
};

export const validateTerminal = (diagnostics: Diagnostic[], def: GameDef, context: ValidationContext): void => {
  if (!def.terminal || !def.terminal.checkpoints) {
    return;
  }

  if (def.terminal.checkpoints.length === 0) {
    diagnostics.push({
      code: 'VICTORY_CHECKPOINTS_EMPTY',
      path: 'terminal.checkpoints',
      severity: 'error',
      message: 'victory.checkpoints must include at least one checkpoint definition.',
      suggestion: 'Define one or more deterministic checkpoint entries.',
    });
  }

  checkDuplicateIds(
    diagnostics,
    def.terminal.checkpoints.map((checkpoint) => checkpoint.id),
    'DUPLICATE_VICTORY_CHECKPOINT_ID',
    'victory checkpoint id',
    'terminal.checkpoints',
  );

  def.terminal.checkpoints.forEach((checkpoint, index) => {
    if (typeof checkpoint.when !== 'object' || checkpoint.when === null || Array.isArray(checkpoint.when)) {
      diagnostics.push({
        code: 'VICTORY_CHECKPOINT_WHEN_INVALID',
        path: `terminal.checkpoints[${index}].when`,
        severity: 'error',
        message: 'victory checkpoint "when" must be a condition object.',
        suggestion: 'Set checkpoint.when to a valid Condition AST object.',
      });
      return;
    }
    validateConditionAst(diagnostics, checkpoint.when as ConditionAST, `terminal.checkpoints[${index}].when`, context);
  });

  def.terminal.margins?.forEach((margin, index) => {
    const isLiteral =
      typeof margin.value === 'number' || typeof margin.value === 'string' || typeof margin.value === 'boolean';
    const isObject = typeof margin.value === 'object' && margin.value !== null && !Array.isArray(margin.value);
    if (!isLiteral && !isObject) {
      diagnostics.push({
        code: 'VICTORY_MARGIN_VALUE_INVALID',
        path: `terminal.margins[${index}].value`,
        severity: 'error',
        message: 'victory margin value must be a ValueExpr-compatible literal or object.',
        suggestion: 'Use a literal or ValueExpr object.',
      });
      return;
    }
    validateValueExpr(diagnostics, margin.value as ValueExpr, `terminal.margins[${index}].value`, context);
  });
};

export const validateActionPipelines = (
  diagnostics: Diagnostic[],
  def: GameDef,
  actionCandidates: readonly string[],
  context: ValidationContext,
): void => {
  const hasCardDrivenTurnOrder = def.turnOrder?.type === 'cardDriven';
  const overrideWindowCandidates = hasCardDrivenTurnOrder
    ? collectTurnFlowEligibilityOverrideWindowIds(def.turnOrder.config.turnFlow)
    : [];

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

    if (hasCardDrivenTurnOrder) {
      const missingWindows = findMissingTurnFlowLinkedWindows(actionPipeline.linkedWindows, overrideWindowCandidates);
      for (const { index: windowIndex, windowId } of missingWindows) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING',
          `${basePath}.linkedWindows[${windowIndex}]`,
          `Unknown turn-flow eligibility override window "${windowId}".`,
          windowId,
          overrideWindowCandidates,
        );
      }
    }

    if (actionPipeline.applicability !== undefined) {
      validateConditionAst(diagnostics, actionPipeline.applicability, `${basePath}.applicability`, context);
    }
    if (actionPipeline.legality !== null && actionPipeline.legality !== undefined) {
      validateConditionAst(diagnostics, actionPipeline.legality, `${basePath}.legality`, context);
    }
    if (actionPipeline.costValidation !== null && actionPipeline.costValidation !== undefined) {
      validateConditionAst(diagnostics, actionPipeline.costValidation, `${basePath}.costValidation`, context);
    }
    forEachDefined(actionPipeline.costEffects, (effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `${basePath}.costEffects[${effectIndex}]`, context);
    });
    if (actionPipeline.targeting.filter !== undefined) {
      validateConditionAst(diagnostics, actionPipeline.targeting.filter, `${basePath}.targeting.filter`, context);
    }
    actionPipeline.stages.forEach((stage, stageIndex) => {
      forEachDefined(stage.effects, (effect, effectIndex) => {
        validateEffectAst(diagnostics, effect, `${basePath}.stages[${stageIndex}].effects[${effectIndex}]`, context);
      });
    });
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
