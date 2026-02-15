import type { Diagnostic } from '../kernel/diagnostics.js';
import type { TurnFlowDef, TurnOrderStrategy } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { lowerCoupPlan } from './compile-victory.js';
import { isRecord } from './compile-lowering.js';

export function lowerTurnOrder(rawTurnOrder: GameSpecDoc['turnOrder'], diagnostics: Diagnostic[]): TurnOrderStrategy | undefined {
  if (rawTurnOrder === null) {
    return undefined;
  }

  if (!isRecord(rawTurnOrder) || typeof rawTurnOrder.type !== 'string') {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_ORDER_INVALID',
      path: 'doc.turnOrder',
      severity: 'error',
      message: 'turnOrder must be an object with a valid type when declared.',
      suggestion: 'Provide a turnOrder object with type roundRobin, fixedOrder, cardDriven, or simultaneous.',
    });
    return undefined;
  }

  switch (rawTurnOrder.type) {
    case 'roundRobin':
      return { type: 'roundRobin' };
    case 'simultaneous':
      diagnostics.push({
        code: 'CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED',
        path: 'doc.turnOrder.type',
        severity: 'warning',
        message: 'turnOrder.type="simultaneous" compiles but runtime resolution is not yet fully implemented.',
        suggestion: 'Prefer roundRobin, fixedOrder, or cardDriven until simultaneous runtime is complete.',
      });
      return { type: 'simultaneous' };
    case 'fixedOrder': {
      const order = Array.isArray(rawTurnOrder.order)
        ? rawTurnOrder.order.filter((entry): entry is string => typeof entry === 'string')
        : [];
      if (order.length === 0) {
        diagnostics.push({
          code: 'CNL_COMPILER_FIXED_ORDER_EMPTY',
          path: 'doc.turnOrder.order',
          severity: 'error',
          message: 'fixedOrder requires a non-empty order array.',
          suggestion: 'Provide at least one player id in turnOrder.order.',
        });
        return undefined;
      }
      const seen = new Set<string>();
      for (const [index, playerId] of order.entries()) {
        if (seen.has(playerId)) {
          diagnostics.push({
            code: 'CNL_COMPILER_FIXED_ORDER_DUPLICATE',
            path: `doc.turnOrder.order.${index}`,
            severity: 'warning',
            message: `Duplicate fixedOrder player id "${playerId}".`,
            suggestion: 'Use unique player ids in turnOrder.order for deterministic sequencing.',
          });
          continue;
        }
        seen.add(playerId);
      }

      return {
        type: 'fixedOrder',
        order,
      };
    }
    case 'cardDriven': {
      if (!isRecord(rawTurnOrder.config)) {
        diagnostics.push({
          code: 'CNL_COMPILER_TURN_ORDER_CARD_DRIVEN_CONFIG_REQUIRED',
          path: 'doc.turnOrder.config',
          severity: 'error',
          message: 'cardDriven turnOrder requires a config object.',
          suggestion: 'Provide turnOrder.config.turnFlow and optional turnOrder.config.coupPlan.',
        });
        return undefined;
      }

      const turnFlow = lowerCardDrivenTurnFlow(rawTurnOrder.config.turnFlow, diagnostics);
      if (turnFlow === undefined) {
        return undefined;
      }

      const coupPlan = lowerCoupPlan(
        rawTurnOrder.config.coupPlan ?? null,
        diagnostics,
        'doc.turnOrder.config.coupPlan',
      );

      return {
        type: 'cardDriven',
        config: {
          turnFlow,
          ...(coupPlan === undefined ? {} : { coupPlan }),
        },
      };
    }
  }
  const unsupportedType = (rawTurnOrder as { readonly type?: unknown }).type;
  diagnostics.push({
    code: 'CNL_COMPILER_TURN_ORDER_UNSUPPORTED_TYPE',
    path: 'doc.turnOrder.type',
    severity: 'error',
    message: `Unsupported turnOrder type "${String(unsupportedType)}".`,
    suggestion: 'Use turnOrder.type = roundRobin | fixedOrder | cardDriven | simultaneous.',
  });
  return undefined;
}

function lowerCardDrivenTurnFlow(rawTurnFlow: unknown, diagnostics: Diagnostic[]): TurnFlowDef | undefined {
  if (!isRecord(rawTurnFlow)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_INVALID',
      path: 'doc.turnOrder.config.turnFlow',
      severity: 'error',
      message: 'cardDriven turnFlow must be an object when declared.',
      suggestion: 'Provide turnFlow.cardLifecycle, eligibility, optionMatrix, passRewards, and durationWindows.',
    });
    return undefined;
  }

  const cardLifecycle = rawTurnFlow.cardLifecycle;
  if (!isRecord(cardLifecycle)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnOrder.config.turnFlow.cardLifecycle',
      severity: 'error',
      message: 'turnFlow.cardLifecycle is required and must be an object.',
      suggestion: 'Define cardLifecycle.played, cardLifecycle.lookahead, and cardLifecycle.leader.',
    });
  }

  const eligibility = rawTurnFlow.eligibility;
  if (!isRecord(eligibility)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnOrder.config.turnFlow.eligibility',
      severity: 'error',
      message: 'turnFlow.eligibility is required and must be an object.',
      suggestion: 'Define eligibility.factions and eligibility.overrideWindows.',
    });
  }

  if (!Array.isArray(rawTurnFlow.optionMatrix)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnOrder.config.turnFlow.optionMatrix',
      severity: 'error',
      message: 'turnFlow.optionMatrix is required and must be an array.',
      suggestion: 'Define optionMatrix rows for first/second eligible action classes.',
    });
  }

  if (!Array.isArray(rawTurnFlow.passRewards)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnOrder.config.turnFlow.passRewards',
      severity: 'error',
      message: 'turnFlow.passRewards is required and must be an array.',
      suggestion: 'Define pass reward entries keyed by faction class.',
    });
  }

  if (!Array.isArray(rawTurnFlow.durationWindows)) {
    diagnostics.push({
      code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
      path: 'doc.turnOrder.config.turnFlow.durationWindows',
      severity: 'error',
      message: 'turnFlow.durationWindows is required and must be an array.',
      suggestion: 'Declare supported duration windows such as turn/nextTurn/round/cycle.',
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
    (rawTurnFlow.freeOperationActionIds !== undefined && !Array.isArray(rawTurnFlow.freeOperationActionIds)) ||
    !Array.isArray(rawTurnFlow.durationWindows)
  ) {
    return undefined;
  }

  if (Array.isArray(rawTurnFlow.freeOperationActionIds)) {
    for (const [index, actionId] of rawTurnFlow.freeOperationActionIds.entries()) {
      if (typeof actionId === 'string') {
        continue;
      }
      diagnostics.push({
        code: 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING',
        path: `doc.turnOrder.config.turnFlow.freeOperationActionIds.${index}`,
        severity: 'error',
        message: 'turnFlow.freeOperationActionIds entries must be non-empty strings.',
        suggestion: 'Replace invalid entry with an action id string.',
      });
    }
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
      path: `doc.turnOrder.config.turnFlow.eligibility.factions.${index}`,
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
      path: `doc.turnOrder.config.turnFlow.optionMatrix.${index}.first`,
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
    const cancellationRules = Array.isArray(interrupt?.cancellation) ? interrupt.cancellation : [];

    if (interrupt !== null && interrupt.cancellation !== undefined && !Array.isArray(interrupt.cancellation)) {
      diagnostics.push({
        code: 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_INVALID',
        path: 'doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation',
        severity: 'error',
        message: 'Interrupt cancellation must be an array of winner/canceled selector objects.',
        suggestion: 'Use cancellation: [{ winner: {...}, canceled: {...} }].',
      });
    }

    if (actionIds.length > 1 && precedence.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_REQUIRED',
        path: 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence',
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
          path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.${index}`,
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
        path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.${index}`,
        severity: 'error',
        message: `Duplicate interrupt precedence faction "${faction}" creates unresolved ordering.`,
        suggestion: 'List each faction at most once in pivotal.interrupt.precedence.',
      });
    }

    for (const [index, rule] of cancellationRules.entries()) {
      if (!isRecord(rule)) {
        diagnostics.push({
          code: 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_INVALID',
          path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.${index}`,
          severity: 'error',
          message: 'Interrupt cancellation entries must be objects with winner/canceled selectors.',
          suggestion: 'Use { winner: {...}, canceled: {...} }.',
        });
        continue;
      }

      for (const selectorKey of ['winner', 'canceled'] as const) {
        const selector = rule[selectorKey];
        const selectorPath = `doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.${index}.${selectorKey}`;
        if (!isRecord(selector)) {
          diagnostics.push({
            code: 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_INVALID',
            path: selectorPath,
            severity: 'error',
            message: `Interrupt cancellation ${selectorKey} selector must be an object.`,
            suggestion: 'Declare at least one selector field (actionId/actionClass/eventCardId/eventCardTags*/paramEquals).',
          });
          continue;
        }

        const hasAnyField =
          typeof selector.actionId === 'string' ||
          typeof selector.actionClass === 'string' ||
          typeof selector.eventCardId === 'string' ||
          Array.isArray(selector.eventCardTagsAll) ||
          Array.isArray(selector.eventCardTagsAny) ||
          isRecord(selector.paramEquals);
        if (!hasAnyField) {
          diagnostics.push({
            code: 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_EMPTY',
            path: selectorPath,
            severity: 'error',
            message: `Interrupt cancellation ${selectorKey} selector must declare at least one matching field.`,
            suggestion: 'Declare actionId/actionClass/eventCardId/eventCardTags*/paramEquals.',
          });
        }
      }
    }
  }

  return rawTurnFlow as unknown as TurnFlowDef;
}
