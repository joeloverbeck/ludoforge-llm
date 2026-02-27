import { isMoveDecisionSequenceSatisfiable, resolveMoveDecisionSequence } from './move-decision-sequence.js';
import type { MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import {
  isFreeOperationApplicableForMove,
  isFreeOperationGrantedForMove,
  resolveTurnFlowActionClass,
} from './turn-flow-eligibility.js';
import { resolveEffectiveFreeOperationActionDomain, resolveTurnFlowDefaultFreeOperationActionDomain } from './free-operation-action-domain.js';
import { toMoveIdentityKey } from './move-identity.js';
import type { GameDef, GameState, Move, MoveParamValue, RuntimeWarning } from './types.js';
import type { TurnFlowInterruptMoveSelectorDef } from './types-turn-flow.js';
import { asActionId } from './branded.js';

const cardDrivenConfig = (def: GameDef) =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

const cardDrivenRuntime = (state: GameState) =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;

export function resolveConstrainedSecondEligibleActionClasses(
  def: GameDef,
  state: GameState,
): readonly ('pass' | 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' | 'event')[] | null {
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

export function applyTurnFlowWindowFilters(def: GameDef, state: GameState, moves: readonly Move[]): readonly Move[] {
  const turnFlow = cardDrivenConfig(def)?.turnFlow;
  if (turnFlow === undefined) {
    return moves;
  }

  const monsoonActive = turnFlow.monsoon !== undefined && isLookaheadCardCoup(def, state);
  const pivotalActionIds = new Set(turnFlow.pivotal?.actionIds ?? []);
  const inPreActionWindow = (cardDrivenRuntime(state)?.currentCard.nonPassCount ?? 0) === 0;
  const activeSeat = String(state.activePlayer);
  const precedence = turnFlow.pivotal?.interrupt?.precedence ?? [];
  const interruptWinnerSeat =
    precedence.length > 0 && inPreActionWindow ? resolveInterruptWinnerSeat(state, precedence) : null;
  const filtered = moves.filter((move) => {
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

    if (!monsoonActive) {
      return true;
    }
    const restriction = turnFlow.monsoon?.restrictedActions.find((candidate) => candidate.actionId === actionId);
    if (restriction === undefined) {
      return true;
    }
    if (hasOverrideToken(move, restriction.overrideToken)) {
      return true;
    }
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
    return true;
  });

  const cancellationRules = turnFlow.pivotal?.interrupt?.cancellation;
  if (cancellationRules === undefined || cancellationRules.length === 0) {
    return filtered;
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
    return filtered;
  }
  return filtered.filter((move) => !canceledMoves.has(move));
}

export function applyPendingFreeOperationVariants(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  options?: {
    readonly budgets?: Partial<MoveEnumerationBudgets>;
    readonly onWarning?: (warning: RuntimeWarning) => void;
  },
): readonly Move[] {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return moves;
  }

  const pendingGrants = runtime.pendingFreeOperationGrants ?? [];
  if (!pendingGrants.some((grant) => grant.seat === String(state.activePlayer))) {
    return moves;
  }

  const variants: Move[] = [...moves];
  const seen = new Set(moves.map((move) => toMoveIdentityKey(def, move)));
  const turnFlowDefaults = resolveTurnFlowDefaultFreeOperationActionDomain(def);
  const pendingActionIds = pendingGrants
    .filter((grant) => grant.seat === String(state.activePlayer))
    .flatMap((grant) => resolveEffectiveFreeOperationActionDomain(grant.actionIds, turnFlowDefaults));
  const extraBaseMoves: Move[] = pendingActionIds.map((actionId) => ({ actionId: asActionId(actionId), params: {} }));

  for (const move of [...moves, ...extraBaseMoves]) {
    if (move.freeOperation === true) {
      continue;
    }
    const candidate: Move = {
      ...move,
      freeOperation: true,
    };
    if (!isFreeOperationApplicableForMove(def, state, candidate)) {
      continue;
    }
    const checkpoint = resolveMoveDecisionSequence(def, state, candidate, {
      choose: () => undefined,
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
      ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
    }).complete;
    const unresolvedDecisionCheckpoint = !checkpoint;
    if (
      unresolvedDecisionCheckpoint &&
      !isMoveDecisionSequenceSatisfiable(def, state, candidate, {
        ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
        ...(options?.onWarning === undefined ? {} : { onWarning: options.onWarning }),
      })
    ) {
      continue;
    }
    if (!unresolvedDecisionCheckpoint && !isFreeOperationGrantedForMove(def, state, candidate)) {
      continue;
    }

    const key = toMoveIdentityKey(def, candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    variants.push(candidate);
  }
  return variants;
}
