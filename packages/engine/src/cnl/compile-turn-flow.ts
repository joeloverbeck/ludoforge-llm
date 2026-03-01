import type { Diagnostic } from '../kernel/diagnostics.js';
import { hasTurnFlowInterruptSelectorMatchField } from '../contracts/turn-flow-interrupt-selector-contract.js';
import type { TurnFlowDef, TurnOrderStrategy } from '../kernel/types.js';
import { TURN_FLOW_ACTION_CLASS_VALUES } from '../contracts/turn-flow-action-class-contract.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  TURN_FLOW_REQUIRED_KEYS,
} from '../contracts/turn-flow-contract.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { lowerCoupPlan } from './compile-victory.js';
import { isRecord } from './compile-lowering.js';

type IndexedString = {
  readonly sourceIndex: number;
  readonly value: string;
};

export function lowerTurnOrder(rawTurnOrder: GameSpecDoc['turnOrder'], diagnostics: Diagnostic[]): TurnOrderStrategy | undefined {
  if (rawTurnOrder === null) {
    return undefined;
  }

  if (!isRecord(rawTurnOrder) || typeof rawTurnOrder.type !== 'string') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_ORDER_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED,
        path: 'doc.turnOrder.type',
        severity: 'warning',
        message: 'turnOrder.type="simultaneous" compiles but runtime resolution is not yet fully implemented.',
        suggestion: 'Prefer roundRobin, fixedOrder, or cardDriven until simultaneous runtime is complete.',
      });
      return { type: 'simultaneous' };
    case 'fixedOrder': {
      const orderEntries: IndexedString[] = [];
      if (Array.isArray(rawTurnOrder.order)) {
        for (const [index, entry] of rawTurnOrder.order.entries()) {
          if (typeof entry !== 'string' || entry.trim() === '') {
            diagnostics.push({
              code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FIXED_ORDER_ENTRY_INVALID,
              path: `doc.turnOrder.order.${index}`,
              severity: 'error',
              message: 'fixedOrder entries must be non-empty player id strings.',
              suggestion: 'Replace invalid entries with declared player ids.',
            });
            continue;
          }
          orderEntries.push({
            sourceIndex: index,
            value: entry,
          });
        }
      }

      if (orderEntries.length === 0) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FIXED_ORDER_EMPTY,
          path: 'doc.turnOrder.order',
          severity: 'error',
          message: 'fixedOrder requires a non-empty order array.',
          suggestion: 'Provide at least one player id in turnOrder.order.',
        });
        return undefined;
      }
      const seen = new Set<string>();
      for (const { sourceIndex, value: playerId } of orderEntries) {
        if (seen.has(playerId)) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FIXED_ORDER_DUPLICATE,
            path: `doc.turnOrder.order.${sourceIndex}`,
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
        order: orderEntries.map((entry) => entry.value),
      };
    }
    case 'cardDriven': {
      if (!isRecord(rawTurnOrder.config)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_ORDER_CARD_DRIVEN_CONFIG_REQUIRED,
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
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_ORDER_UNSUPPORTED_TYPE,
    path: 'doc.turnOrder.type',
    severity: 'error',
    message: `Unsupported turnOrder type "${String(unsupportedType)}".`,
    suggestion: 'Use turnOrder.type = roundRobin | fixedOrder | cardDriven | simultaneous.',
  });
  return undefined;
}

function lowerCardDrivenTurnFlow(rawTurnFlow: unknown, diagnostics: Diagnostic[]): TurnFlowDef | undefined {
  const isTurnFlowActionClass = (value: unknown): value is TurnFlowDef['optionMatrix'][number]['second'][number] =>
    typeof value === 'string' && (TURN_FLOW_ACTION_CLASS_VALUES as readonly string[]).includes(value);

  if (!isRecord(rawTurnFlow)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_INVALID,
      path: 'doc.turnOrder.config.turnFlow',
      severity: 'error',
      message: 'cardDriven turnFlow must be an object when declared.',
      suggestion: 'Provide turnFlow.cardLifecycle, eligibility, actionClassByActionId, optionMatrix, passRewards, and durationWindows.',
    });
    return undefined;
  }

  const requiredFieldSpecs: Readonly<Record<(typeof TURN_FLOW_REQUIRED_KEYS)[number], {
    readonly valid: (value: unknown) => boolean;
    readonly message: string;
    readonly suggestion: string;
  }>> = {
    cardLifecycle: {
      valid: isRecord,
      message: 'turnFlow.cardLifecycle is required and must be an object.',
      suggestion: 'Define cardLifecycle.played, cardLifecycle.lookahead, and cardLifecycle.leader.',
    },
    eligibility: {
      valid: isRecord,
      message: 'turnFlow.eligibility is required and must be an object.',
      suggestion: 'Define eligibility.seats and eligibility.overrideWindows.',
    },
    actionClassByActionId: {
      valid: isRecord,
      message: 'turnFlow.actionClassByActionId is required and must be an object.',
      suggestion: `Define actionClassByActionId values from: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
    },
    optionMatrix: {
      valid: Array.isArray,
      message: 'turnFlow.optionMatrix is required and must be an array.',
      suggestion: 'Define optionMatrix rows for first/second eligible action classes.',
    },
    passRewards: {
      valid: Array.isArray,
      message: 'turnFlow.passRewards is required and must be an array.',
      suggestion: 'Define pass reward entries keyed by seat.',
    },
    durationWindows: {
      valid: Array.isArray,
      message: 'turnFlow.durationWindows is required and must be an array.',
      suggestion: 'Declare supported duration windows such as turn/nextTurn/round/cycle.',
    },
  };

  for (const key of TURN_FLOW_REQUIRED_KEYS) {
    const fieldValue = rawTurnFlow[key];
    const spec = requiredFieldSpecs[key];
    if (spec.valid(fieldValue)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING,
      path: `doc.turnOrder.config.turnFlow.${key}`,
      severity: 'error',
      message: spec.message,
      suggestion: spec.suggestion,
    });
  }

  const cardLifecycle = rawTurnFlow.cardLifecycle;
  const eligibility = rawTurnFlow.eligibility;

  if (
    !isRecord(cardLifecycle) ||
    typeof cardLifecycle.played !== 'string' ||
    typeof cardLifecycle.lookahead !== 'string' ||
    typeof cardLifecycle.leader !== 'string' ||
    !isRecord(eligibility) ||
    !Array.isArray(eligibility.seats) ||
    !Array.isArray(eligibility.overrideWindows) ||
    !isRecord(rawTurnFlow.actionClassByActionId) ||
    !Array.isArray(rawTurnFlow.optionMatrix) ||
    !Array.isArray(rawTurnFlow.passRewards) ||
    (rawTurnFlow.freeOperationActionIds !== undefined && !Array.isArray(rawTurnFlow.freeOperationActionIds)) ||
    !Array.isArray(rawTurnFlow.durationWindows)
  ) {
    return undefined;
  }

  if (Array.isArray(rawTurnFlow.freeOperationActionIds)) {
    for (const [index, actionId] of rawTurnFlow.freeOperationActionIds.entries()) {
      if (typeof actionId === 'string' && actionId.trim() !== '') {
        continue;
      }
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING,
        path: `doc.turnOrder.config.turnFlow.freeOperationActionIds.${index}`,
        severity: 'error',
        message: 'turnFlow.freeOperationActionIds entries must be non-empty strings.',
        suggestion: 'Replace invalid entry with an action id string.',
      });
    }
  }
  for (const [actionId, actionClass] of Object.entries(rawTurnFlow.actionClassByActionId)) {
    if (actionId.trim() === '') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ACTION_CLASS_MAP_INVALID,
        path: 'doc.turnOrder.config.turnFlow.actionClassByActionId',
        severity: 'error',
        message: 'turnFlow.actionClassByActionId keys must be non-empty action ids.',
        suggestion: 'Replace empty keys with declared action ids.',
      });
    }
    if (!isTurnFlowActionClass(actionClass)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ACTION_CLASS_MAP_INVALID,
        path: `doc.turnOrder.config.turnFlow.actionClassByActionId.${actionId}`,
        severity: 'error',
        message: 'turnFlow.actionClassByActionId contains an invalid action class.',
        suggestion: `Use one of: ${TURN_FLOW_ACTION_CLASS_VALUES.join(', ')}.`,
      });
    }
  }

  const seatOrderEntries: IndexedString[] = [];
  for (const [index, seat] of eligibility.seats.entries()) {
    if (typeof seat !== 'string' || seat.trim() === '') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_SEAT_INVALID,
        path: `doc.turnOrder.config.turnFlow.eligibility.seats.${index}`,
        severity: 'error',
        message: 'eligibility.seats entries must be non-empty seat id strings.',
        suggestion: 'Replace invalid entries with declared seat ids.',
      });
      continue;
    }
    seatOrderEntries.push({
      sourceIndex: index,
      value: seat,
    });
  }
  const seatOrder = seatOrderEntries.map((entry) => entry.value);
  const seenSeats = new Set<string>();
  for (const { sourceIndex, value: seat } of seatOrderEntries) {
    if (!seenSeats.has(seat)) {
      seenSeats.add(seat);
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_SEAT,
      path: `doc.turnOrder.config.turnFlow.eligibility.seats.${sourceIndex}`,
      severity: 'error',
      message: `Duplicate seat id "${seat}" creates unresolved deterministic ordering.`,
      suggestion: 'Declare each seat id exactly once in eligibility.seats.',
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
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_OPTION_ROW,
      path: `doc.turnOrder.config.turnFlow.optionMatrix.${index}.first`,
      severity: 'error',
      message: `Duplicate optionMatrix.first "${row.first}" creates ambiguous second-eligible ordering.`,
      suggestion: 'Keep one optionMatrix row per first action class.',
    });
  }

  if (isRecord(rawTurnFlow.pivotal)) {
    const actionIdEntries: IndexedString[] = [];
    if (Array.isArray(rawTurnFlow.pivotal.actionIds)) {
      for (const [index, actionId] of rawTurnFlow.pivotal.actionIds.entries()) {
        if (typeof actionId !== 'string' || actionId.trim() === '') {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_PIVOTAL_ACTION_ID_INVALID,
            path: `doc.turnOrder.config.turnFlow.pivotal.actionIds.${index}`,
            severity: 'error',
            message: 'pivotal.actionIds entries must be non-empty action id strings.',
            suggestion: 'Replace invalid entries with declared action ids.',
          });
          continue;
        }
        actionIdEntries.push({
          sourceIndex: index,
          value: actionId,
        });
      }
    }
    const interrupt = isRecord(rawTurnFlow.pivotal.interrupt) ? rawTurnFlow.pivotal.interrupt : null;
    const precedenceEntries: IndexedString[] = [];
    if (Array.isArray(interrupt?.precedence)) {
      for (const [index, entry] of interrupt.precedence.entries()) {
        if (typeof entry !== 'string' || entry.trim() === '') {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_INVALID_SEAT,
            path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.${index}`,
            severity: 'error',
            message: 'pivotal.interrupt.precedence entries must be non-empty seat id strings.',
            suggestion: 'Replace invalid entries with declared seat ids.',
          });
          continue;
        }
        precedenceEntries.push({
          sourceIndex: index,
          value: entry,
        });
      }
    }
    const cancellationRules = Array.isArray(interrupt?.cancellation) ? interrupt.cancellation : [];

    if (interrupt !== null && interrupt.cancellation !== undefined && !Array.isArray(interrupt.cancellation)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_INVALID,
        path: 'doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation',
        severity: 'error',
        message: 'Interrupt cancellation must be an array of winner/canceled selector objects.',
        suggestion: 'Use cancellation: [{ winner: {...}, canceled: {...} }].',
      });
    }

    if (actionIdEntries.length > 1 && precedenceEntries.length === 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_REQUIRED,
        path: 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence',
        severity: 'error',
        message: 'Multiple pivotal actions require explicit interrupt precedence for deterministic ordering.',
        suggestion: 'Declare pivotal.interrupt.precedence with a stable seat-id order.',
      });
    }

    const seenPrecedence = new Set<string>();
    for (const { sourceIndex, value: seat } of precedenceEntries) {
      if (!seatOrder.includes(seat)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_SEAT,
          path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.${sourceIndex}`,
          severity: 'error',
          message: `Interrupt precedence seat "${seat}" is not declared in eligibility.seats.`,
          suggestion: 'Use seat ids declared in turnFlow.eligibility.seats.',
        });
      }

      if (!seenPrecedence.has(seat)) {
        seenPrecedence.add(seat);
        continue;
      }

      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_DUPLICATE,
        path: `doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.${sourceIndex}`,
        severity: 'error',
        message: `Duplicate interrupt precedence seat "${seat}" creates unresolved ordering.`,
        suggestion: 'List each seat at most once in pivotal.interrupt.precedence.',
      });
    }

    for (const [index, rule] of cancellationRules.entries()) {
      if (!isRecord(rule)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_INVALID,
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
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_INVALID,
            path: selectorPath,
            severity: 'error',
            message: `Interrupt cancellation ${selectorKey} selector must be an object.`,
            suggestion: 'Declare at least one selector field (actionId/actionClass/eventCardId/eventCardTags*/paramEquals).',
          });
          continue;
        }

        const hasAnyField = hasTurnFlowInterruptSelectorMatchField(selector);
        if (!hasAnyField) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_EMPTY,
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
