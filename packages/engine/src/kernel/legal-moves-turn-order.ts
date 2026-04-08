import { isFreeOperationAllowedDuringMonsoonForMove } from './free-operation-discovery-analysis.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import {
  hasActiveSeatRequiredPendingFreeOperationGrant,
  isMoveAllowedByRequiredPendingFreeOperationGrant,
  isEventMovePlayableUnderGrantViabilityPolicy,
} from './turn-flow-eligibility.js';
import type { GameDef, GameState, Move, MoveParamValue } from './types.js';
import type { ActionRestrictionDef, TurnFlowActionClass, TurnFlowInterruptMoveSelectorDef } from './types-turn-flow.js';
import { cardDrivenConfig, cardDrivenRuntime } from './card-driven-accessors.js';
import { createSeatResolutionContext, type SeatResolutionContext } from './identity.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';

export function resolveConstrainedSecondEligibleActionClasses(
  def: GameDef,
  state: GameState,
): readonly TurnFlowActionClass[] | null {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return null;
  }

  const interruptPhases = def.turnStructure.interrupts?.map((phase) => String(phase.id)) ?? [];
  if (interruptPhases.includes(String(state.currentPhase))) {
    return null;
  }

  const firstActionClass = runtime.currentCard.firstActionClass;
  if (runtime.currentCard.nonPassCount !== 1 || firstActionClass === null) {
    return null;
  }

  const row = cardDrivenConfig(def)?.turnFlow.optionMatrix.find((matrixRow) => matrixRow.first === firstActionClass);
  if (row === undefined) {
    return null;
  }

  return row.second;
}

export function isMoveAllowedByTurnFlowOptionMatrix(def: GameDef, state: GameState, move: Move): boolean {
  if (move.freeOperation === true && state.turnOrderState.type === 'cardDriven') {
    const seatResolution = createSeatResolutionContext(def, state.playerCount);
    if (
      hasActiveSeatRequiredPendingFreeOperationGrant(def, state, seatResolution)
      && isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution)
    ) {
      return true;
    }
  }

  const constrained = resolveConstrainedSecondEligibleActionClasses(def, state);
  if (constrained === null) {
    return true;
  }

  const moveClass = resolveTurnFlowActionClass(def, move);
  if (moveClass === 'pass') {
    return true;
  }
  if (moveClass === null) {
    return false;
  }
  if (moveClass === 'specialActivity') {
    return constrained.includes('operationPlusSpecialActivity');
  }
  if (moveClass === 'operation') {
    return (
      constrained.includes('operation') ||
      constrained.includes('limitedOperation') ||
      constrained.includes('operationPlusSpecialActivity')
    );
  }
  return constrained.includes(moveClass);
}

function containsToken(paramValue: MoveParamValue, token: string): boolean {
  if (typeof paramValue === 'string') {
    return paramValue === token;
  }
  if (Array.isArray(paramValue)) {
    return paramValue.some((item) => item === token);
  }
  return false;
}

function hasOverrideToken(move: Move, token: string | undefined): boolean {
  if (token === undefined) {
    return false;
  }
  return Object.values(move.params).some((paramValue) => containsToken(paramValue, token));
}

function isLookaheadCardCoup(def: GameDef, state: GameState): boolean {
  const lookaheadZone = cardDrivenConfig(def)?.turnFlow.cardLifecycle.lookahead;
  if (lookaheadZone === undefined) {
    return false;
  }
  return state.zones[lookaheadZone]?.[0]?.props.isCoup === true;
}

function compareSeatByInterruptPrecedence(
  left: string,
  right: string,
  precedence: readonly string[],
): number {
  const leftIndex = precedence.indexOf(left);
  const rightIndex = precedence.indexOf(right);
  const leftRank = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
  const rightRank = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.localeCompare(right);
}

function resolveInterruptWinnerSeat(
  state: GameState,
  precedence: readonly string[],
): string | null {
  const currentCard = cardDrivenRuntime(state)?.currentCard;
  if (currentCard === undefined) {
    return null;
  }
  const contenders = [currentCard.firstEligible, currentCard.secondEligible].filter(
    (seat): seat is string => seat !== null,
  );
  if (contenders.length === 0) {
    return null;
  }
  const sorted = [...contenders].sort((left, right) => compareSeatByInterruptPrecedence(left, right, precedence));
  return sorted[0] ?? null;
}

function toConstrainedNumericValue(paramValue: MoveParamValue | undefined): number | null {
  if (typeof paramValue === 'number') {
    return paramValue;
  }
  if (Array.isArray(paramValue)) {
    return paramValue.length;
  }
  return null;
}

function toConstrainedNumericValueOrZero(paramValue: MoveParamValue | undefined): number | null {
  if (paramValue === undefined) {
    return 0;
  }
  return toConstrainedNumericValue(paramValue);
}

function resolveEventCardForMove(def: GameDef, move: Move): { readonly id: string; readonly tags: readonly string[] } | null {
  const explicitCardId = move.params.eventCardId;
  if (typeof explicitCardId !== 'string' || explicitCardId.length === 0) {
    return null;
  }

  const eventDecks = def.eventDecks;
  if (eventDecks === undefined || eventDecks.length === 0) {
    return null;
  }

  const explicitDeckId = move.params.eventDeckId;
  const decks =
    typeof explicitDeckId === 'string' && explicitDeckId.length > 0
      ? eventDecks.filter((deck) => deck.id === explicitDeckId)
      : eventDecks;

  for (const deck of decks) {
    const card = deck.cards.find((candidate) => candidate.id === explicitCardId);
    if (card !== undefined) {
      return {
        id: card.id,
        tags: card.tags ?? [],
      };
    }
  }

  return null;
}

function moveMatchesSelector(def: GameDef, move: Move, selector: TurnFlowInterruptMoveSelectorDef): boolean {
  if (selector.actionId !== undefined && selector.actionId !== String(move.actionId)) {
    return false;
  }

  if (selector.actionClass !== undefined && selector.actionClass !== resolveTurnFlowActionClass(def, move)) {
    return false;
  }

  const selectorNeedsEventCard =
    selector.eventCardId !== undefined ||
    selector.eventCardTagsAll !== undefined ||
    selector.eventCardTagsAny !== undefined;
  const resolvedEventCard = selectorNeedsEventCard ? resolveEventCardForMove(def, move) : null;

  if (selector.eventCardId !== undefined && selector.eventCardId !== resolvedEventCard?.id) {
    return false;
  }

  if (
    selector.eventCardTagsAll !== undefined &&
    !selector.eventCardTagsAll.every((tag) => resolvedEventCard?.tags.includes(tag) === true)
  ) {
    return false;
  }

  if (
    selector.eventCardTagsAny !== undefined &&
    !selector.eventCardTagsAny.some((tag) => resolvedEventCard?.tags.includes(tag) === true)
  ) {
    return false;
  }

  if (selector.paramEquals !== undefined) {
    for (const [name, expected] of Object.entries(selector.paramEquals)) {
      if (move.params[name] !== expected) {
        return false;
      }
    }
  }

  return true;
}

function matchesActionRestriction(
  restriction: ActionRestrictionDef,
  actionId: string,
  actionClassByActionId: Readonly<Record<string, TurnFlowActionClass>>,
): boolean {
  if (restriction.actionId !== undefined && restriction.actionId === actionId) {
    return true;
  }
  if (restriction.actionClass !== undefined && actionClassByActionId[actionId] === restriction.actionClass) {
    return true;
  }
  return false;
}

function isMoveAllowedByLastingEffectRestrictions(
  _def: GameDef,
  state: GameState,
  move: Move,
  turnFlow: NonNullable<ReturnType<typeof cardDrivenConfig>>['turnFlow'],
): boolean {
  const activeEffects = state.activeLastingEffects;
  if (activeEffects === undefined || activeEffects.length === 0) {
    return true;
  }

  if (move.freeOperation === true) {
    return true;
  }

  const actionId = String(move.actionId);
  let effectiveMaxParam: Map<string, number> | null = null;

  for (const effect of activeEffects) {
    const restrictions = effect.actionRestrictions;
    if (restrictions === undefined) {
      continue;
    }
    for (const restriction of restrictions) {
      if (!matchesActionRestriction(restriction, actionId, turnFlow.actionClassByActionId)) {
        continue;
      }
      if (restriction.blocked === true) {
        return false;
      }
      if (restriction.maxParam !== undefined) {
        if (effectiveMaxParam === null) {
          effectiveMaxParam = new Map();
        }
        const existing = effectiveMaxParam.get(restriction.maxParam.name);
        const limit = existing === undefined ? restriction.maxParam.max : Math.min(existing, restriction.maxParam.max);
        effectiveMaxParam.set(restriction.maxParam.name, limit);
      }
    }
  }

  if (effectiveMaxParam !== null) {
    for (const [name, max] of effectiveMaxParam) {
      const constrained = toConstrainedNumericValue(move.params[name]);
      if (constrained !== null && constrained > max) {
        return false;
      }
    }
  }

  return true;
}

export function applyTurnFlowWindowFilters(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  seatResolution: SeatResolutionContext,
): readonly Move[] {
  const turnFlow = cardDrivenConfig(def)?.turnFlow;
  if (turnFlow === undefined) {
    return moves;
  }

  const monsoonActive = turnFlow.monsoon !== undefined && isLookaheadCardCoup(def, state);
  const pivotalActionIds = new Set(turnFlow.pivotal?.actionIds ?? []);
  const inPreActionWindow = (cardDrivenRuntime(state)?.currentCard.nonPassCount ?? 0) === 0;
  const activeSeat = state.turnOrderState.type === 'cardDriven'
    ? requireCardDrivenActiveSeat(
      def,
      state,
      TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.WINDOW_FILTER_APPLICATION,
      seatResolution,
    )
    : String(state.activePlayer);
  const precedence = turnFlow.pivotal?.interrupt?.precedence ?? [];
  const interruptWinnerSeat =
    precedence.length > 0 && inPreActionWindow ? resolveInterruptWinnerSeat(state, precedence) : null;
  const filtered = moves.filter((move) => {
    if (!isEventMovePlayableUnderGrantViabilityPolicy(def, state, move, seatResolution)) {
      return false;
    }
    const actionId = String(move.actionId);
    const isPivotal = pivotalActionIds.has(actionId);
    if (isPivotal) {
      if ((turnFlow.pivotal?.requirePreActionWindow ?? true) && !inPreActionWindow) {
        return false;
      }

      if (interruptWinnerSeat !== null && activeSeat !== interruptWinnerSeat) {
        return false;
      }

      const monsoonPivotalOverride = hasOverrideToken(move, turnFlow.monsoon?.pivotalOverrideToken);
      if ((turnFlow.pivotal?.disallowWhenLookaheadIsCoup ?? true) && isLookaheadCardCoup(def, state) && !monsoonPivotalOverride) {
        return false;
      }
      if (monsoonActive && (turnFlow.monsoon?.blockPivotal ?? true) && !monsoonPivotalOverride) {
        return false;
      }
    }

    if (monsoonActive) {
      const restriction = turnFlow.monsoon?.restrictedActions.find((candidate) => candidate.actionId === actionId);
      if (restriction !== undefined) {
        if (
          !isFreeOperationAllowedDuringMonsoonForMove(def, state, move, seatResolution, {
            zoneFilterErrorSurface: 'legalChoices',
          })
          && !hasOverrideToken(move, restriction.overrideToken)
        ) {
          const hasQuantitativeRule = restriction.maxParam !== undefined || restriction.maxParamsTotal !== undefined;
          if (!hasQuantitativeRule) {
            return false;
          }
          if (restriction.maxParam !== undefined) {
            const constrained = toConstrainedNumericValue(move.params[restriction.maxParam.name]);
            if (constrained === null || constrained > restriction.maxParam.max) {
              return false;
            }
          }
          if (restriction.maxParamsTotal !== undefined) {
            let total = 0;
            for (const name of restriction.maxParamsTotal.names) {
              const constrained = toConstrainedNumericValueOrZero(move.params[name]);
              if (constrained === null) {
                return false;
              }
              total += constrained;
            }
            if (total > restriction.maxParamsTotal.max) {
              return false;
            }
          }
        }
      }
    }

    if (!isMoveAllowedByLastingEffectRestrictions(def, state, move, turnFlow)) {
      return false;
    }

    return true;
  });

  const cancellationRules = turnFlow.pivotal?.interrupt?.cancellation;
  if (cancellationRules === undefined || cancellationRules.length === 0) {
    return filtered.filter((move) => isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution));
  }

  const canceledMoves = new Set<Move>();
  for (const rule of cancellationRules) {
    const hasWinner = filtered.some((move) => moveMatchesSelector(def, move, rule.winner));
    if (!hasWinner) {
      continue;
    }

    for (const move of filtered) {
      if (moveMatchesSelector(def, move, rule.canceled)) {
        canceledMoves.add(move);
      }
    }
  }

  if (canceledMoves.size === 0) {
    return filtered.filter((move) => isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution));
  }
  return filtered
    .filter((move) => !canceledMoves.has(move))
    .filter((move) => isMoveAllowedByRequiredPendingFreeOperationGrant(def, state, move, seatResolution));
}
