import { resolveTurnFlowActionClass } from './turn-flow-eligibility.js';
import type { GameDef, GameState, Move, MoveParamValue } from './types.js';

export function isMoveAllowedByTurnFlowOptionMatrix(def: GameDef, state: GameState, move: Move): boolean {
  const runtime = state.turnFlow;
  if (runtime === undefined) {
    return true;
  }

  const firstActionClass = runtime.currentCard.firstActionClass;
  if (runtime.currentCard.nonPassCount !== 1 || firstActionClass === null) {
    return true;
  }

  const moveClass = resolveTurnFlowActionClass(move);
  if (moveClass === 'pass') {
    return true;
  }

  const row = def.turnFlow?.optionMatrix.find((matrixRow) => matrixRow.first === firstActionClass);
  if (row === undefined || moveClass === null) {
    return row === undefined;
  }

  return row.second.includes(moveClass);
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
  const lookaheadZone = def.turnFlow?.cardLifecycle.lookahead;
  if (lookaheadZone === undefined) {
    return false;
  }
  return state.zones[lookaheadZone]?.[0]?.props.isCoup === true;
}

function compareFactionByInterruptPrecedence(
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

function resolveInterruptWinnerFaction(
  state: GameState,
  precedence: readonly string[],
): string | null {
  const currentCard = state.turnFlow?.currentCard;
  if (currentCard === undefined) {
    return null;
  }
  const contenders = [currentCard.firstEligible, currentCard.secondEligible].filter(
    (faction): faction is string => faction !== null,
  );
  if (contenders.length === 0) {
    return null;
  }
  const sorted = [...contenders].sort((left, right) => compareFactionByInterruptPrecedence(left, right, precedence));
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

export function applyTurnFlowWindowFilters(def: GameDef, state: GameState, moves: readonly Move[]): readonly Move[] {
  const turnFlow = def.turnFlow;
  if (turnFlow === undefined) {
    return moves;
  }

  const monsoonActive = turnFlow.monsoon !== undefined && isLookaheadCardCoup(def, state);
  const pivotalActionIds = new Set(turnFlow.pivotal?.actionIds ?? []);
  const inPreActionWindow = (state.turnFlow?.currentCard.nonPassCount ?? 0) === 0;
  const activeFaction = String(state.activePlayer);
  const precedence = turnFlow.pivotal?.interrupt?.precedence ?? [];
  const interruptWinnerFaction =
    precedence.length > 0 && inPreActionWindow ? resolveInterruptWinnerFaction(state, precedence) : null;
  const filtered = moves.filter((move) => {
    const actionId = String(move.actionId);
    const isPivotal = pivotalActionIds.has(actionId);
    if (isPivotal) {
      if ((turnFlow.pivotal?.requirePreActionWindow ?? true) && !inPreActionWindow) {
        return false;
      }

      if (interruptWinnerFaction !== null && activeFaction !== interruptWinnerFaction) {
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
    if (restriction.maxParam !== undefined) {
      const constrained = toConstrainedNumericValue(move.params[restriction.maxParam.name]);
      return constrained !== null && constrained <= restriction.maxParam.max;
    }
    return false;
  });

  const cancellationRules = turnFlow.pivotal?.interrupt?.cancellation;
  if (cancellationRules === undefined || cancellationRules.length === 0) {
    return filtered;
  }

  const actionIds = new Set(filtered.map((move) => String(move.actionId)));
  const canceledActionIds = new Set<string>();
  for (const rule of cancellationRules) {
    if (!actionIds.has(rule.winnerActionId)) {
      continue;
    }
    canceledActionIds.add(rule.canceledActionId);
  }

  if (canceledActionIds.size === 0) {
    return filtered;
  }
  return filtered.filter((move) => !canceledActionIds.has(String(move.actionId)));
}
