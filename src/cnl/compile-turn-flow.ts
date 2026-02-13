import type { Diagnostic } from '../kernel/diagnostics.js';
import type { TurnFlowDef } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord } from './compile-lowering.js';

export function lowerTurnFlow(rawTurnFlow: GameSpecDoc['turnFlow'], diagnostics: Diagnostic[]): TurnFlowDef | undefined {
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
