import { asPlayerId } from './branded.js';
import { applyBoundaryExpiry } from './boundary-expiry.js';
import { resetPhaseUsage, resetTurnUsage } from './action-usage.js';
import { resolveBoundaryDurationsAtTurnEnd } from './event-execution.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { legalMoves } from './legal-moves.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import { kernelRuntimeError } from './runtime-error.js';
import { resolvePlayerIndexForTurnFlowSeat } from './seat-resolution.js';
import { terminalResult } from './terminal.js';
import type { ExecutionCollector, GameDef, GameState, TriggerLogEntry } from './types.js';
import type { MoveExecutionPolicy } from './execution-policy.js';

const firstPhaseId = (def: GameDef): GameState['currentPhase'] => {
  const phaseId = def.turnStructure.phases.at(0)?.id;
  if (phaseId === undefined) {
    throw kernelRuntimeError(
      'PHASE_ADVANCE_NO_PHASES',
      'advancePhase requires at least one phase in turnStructure.phases',
    );
  }

  return phaseId;
};

const parseFixedOrderPlayer = (playerId: string, playerCount: number): number | null => {
  const numeric = Number(playerId);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= playerCount) {
    return null;
  }
  return numeric;
};

const resolveCoupPhaseIds = (def: GameDef): ReadonlySet<string> => {
  if (def.turnOrder?.type !== 'cardDriven') {
    return new Set<string>();
  }
  return new Set((def.turnOrder.config.coupPlan?.phases ?? []).map((p) => p.id));
};

const isInCoupPhase = (def: GameDef, state: GameState): boolean =>
  resolveCoupPhaseIds(def).has(String(state.currentPhase));

const resolveCurrentCoupSeat = (
  def: GameDef,
  state: GameState,
): string => {
  return requireCardDrivenActiveSeat(def, state, 'resolveCurrentCoupSeat');
};

/**
 * When entering a coup phase, reset the turn flow state so all factions are
 * eligible, the first seat in seatOrder is active, and the current card
 * tracking is cleared. If the coup plan defines a seatOrder, it overrides
 * the card-based seat order for the duration of the coup phase.
 * Returns the state unchanged if the target phase is not a coup phase or
 * the turn order is not card-driven.
 */
const applyCoupPhaseEntryReset = (def: GameDef, state: GameState, phaseId: GameState['currentPhase']): GameState => {
  if (def.turnOrder?.type !== 'cardDriven' || state.turnOrderState.type !== 'cardDriven') {
    return state;
  }
  const coupPhaseIds = resolveCoupPhaseIds(def);
  if (!coupPhaseIds.has(String(phaseId))) {
    return state;
  }
  const runtime = state.turnOrderState.runtime;
  const coupSeatOrder = def.turnOrder.config.coupPlan?.seatOrder ?? runtime.seatOrder;
  const allEligible = Object.fromEntries(
    coupSeatOrder.map((seat) => [seat, true]),
  ) as Readonly<Record<string, boolean>>;
  const firstSeat = coupSeatOrder[0] ?? null;
  const secondSeat = coupSeatOrder[1] ?? null;
  const resolvedFirstSeatPlayerIndex =
    firstSeat === null ? null : resolvePlayerIndexForTurnFlowSeat(def, state.playerCount, firstSeat);
  if (firstSeat !== null && resolvedFirstSeatPlayerIndex === null) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: applyCoupPhaseEntryReset could not resolve first coup seat "${firstSeat}" for playerCount=${state.playerCount}`,
    );
  }
  return {
    ...state,
    activePlayer:
      resolvedFirstSeatPlayerIndex === null ? state.activePlayer : asPlayerId(resolvedFirstSeatPlayerIndex),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: coupSeatOrder,
        eligibility: allEligible,
        currentCard: {
          firstEligible: firstSeat,
          secondEligible: secondSeat,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

const resolveCardDrivenCoupContext = (
  def: GameDef,
  state: GameState,
): {
  readonly coupPhaseIds: ReadonlySet<string>;
  readonly coupActive: boolean;
  readonly finalCoupRound: boolean;
} | null => {
  if (def.turnOrder?.type !== 'cardDriven' || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }

  const coupPlan = def.turnOrder.config.coupPlan;
  if (coupPlan === undefined) {
    return null;
  }

  const coupPhaseIds = new Set(coupPlan.phases.map((phase) => phase.id));
  if (coupPhaseIds.size === 0) {
    return null;
  }

  const cardLifecycle = def.turnOrder.config.turnFlow.cardLifecycle;
  const playedTop = state.zones[cardLifecycle.played]?.[0];
  const playedProps = playedTop?.props as Readonly<Record<string, unknown>> | undefined;
  const isCoup = playedProps?.isCoup === true;

  const consecutiveCoupRounds = state.turnOrderState.runtime.consecutiveCoupRounds ?? 0;
  const maxConsecutiveRounds = coupPlan.maxConsecutiveRounds;
  const coupActive = isCoup && (maxConsecutiveRounds === undefined || consecutiveCoupRounds < maxConsecutiveRounds);

  if (!coupActive) {
    return { coupPhaseIds, coupActive: false, finalCoupRound: false };
  }

  const lookaheadEmpty = (state.zones[cardLifecycle.lookahead]?.length ?? 0) === 0;
  const slotIds = new Set([cardLifecycle.played, cardLifecycle.lookahead, cardLifecycle.leader]);
  const drawPileIds = def.zones
    .filter((zone) => zone.ordering === 'stack' && !slotIds.has(String(zone.id)))
    .map((zone) => String(zone.id));
  const drawPileEmpty =
    drawPileIds.length === 1
      ? (state.zones[drawPileIds[0]!] ?? []).length === 0
      : true;

  return {
    coupPhaseIds,
    coupActive: true,
    finalCoupRound: lookaheadEmpty && drawPileEmpty,
  };
};

const effectiveTurnPhases = (def: GameDef, state: GameState): GameDef['turnStructure']['phases'] => {
  const context = resolveCardDrivenCoupContext(def, state);
  if (context === null) {
    return def.turnStructure.phases;
  }

  if (!context.coupActive) {
    return def.turnStructure.phases.filter((phase) => !context.coupPhaseIds.has(String(phase.id)));
  }

  const omitted = new Set<string>(
    context.finalCoupRound
      ? (def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config.coupPlan?.finalRoundOmitPhases : undefined) ?? []
      : [],
  );
  return def.turnStructure.phases.filter(
    (phase) => context.coupPhaseIds.has(String(phase.id)) && !omitted.has(String(phase.id)),
  );
};

const advanceTurnOrder = (def: GameDef, state: GameState): Pick<GameState, 'activePlayer' | 'turnOrderState'> => {
  const strategy = def.turnOrder;
  if (strategy === undefined || strategy.type === 'roundRobin') {
    return {
      activePlayer: asPlayerId((Number(state.activePlayer) + 1) % state.playerCount),
      turnOrderState: { type: 'roundRobin' },
    };
  }
  if (strategy.type === 'fixedOrder') {
    const currentIndex = state.turnOrderState.type === 'fixedOrder' ? state.turnOrderState.currentIndex : 0;
    const nextIndex = strategy.order.length === 0 ? 0 : (currentIndex + 1) % strategy.order.length;
    const nextPlayerId = strategy.order[nextIndex];
    const parsed = nextPlayerId === undefined ? null : parseFixedOrderPlayer(nextPlayerId, state.playerCount);
    return {
      activePlayer: parsed === null ? state.activePlayer : asPlayerId(parsed),
      turnOrderState: {
        type: 'fixedOrder',
        currentIndex: nextIndex,
      },
    };
  }
  if (strategy.type === 'simultaneous') {
    return {
      activePlayer: state.activePlayer,
      turnOrderState: {
        type: 'simultaneous',
        submitted: Object.fromEntries(
          Array.from({ length: state.playerCount }, (_unused, index) => [index, false]),
        ),
        pending: {},
      },
    };
  }

  return {
    activePlayer: state.activePlayer,
    turnOrderState: state.turnOrderState.type === 'cardDriven' ? state.turnOrderState : { type: 'roundRobin' },
  };
};

export const advancePhase = (
  def: GameDef,
  state: GameState,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
  cachedRuntime?: GameDefRuntime,
): GameState => {
  const phases = effectiveTurnPhases(def, state);
  const currentPhaseIndex = phases.findIndex((phase) => phase.id === state.currentPhase);
  if (currentPhaseIndex < 0) {
    // Current phase is not in the effective turn phases — force a direct transition
    // to the first effective phase. This occurs when applyTurnFlowCardBoundary promotes
    // a coup card mid-round (in applyTurnFlowEligibilityAfterMove), leaving the state
    // in 'main' while effective phases are now coup-only.
    const targetPhase = phases[0];
    if (targetPhase === undefined) {
      throw kernelRuntimeError(
        'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND',
        `advancePhase could not find current phase ${String(state.currentPhase)} in effective turn phases`,
        { currentPhase: state.currentPhase },
      );
    }
    let redirected = dispatchLifecycleEvent(def, state, { type: 'phaseExit', phase: state.currentPhase }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
    redirected = applyCoupPhaseEntryReset(def, resetPhaseUsage({
      ...redirected,
      currentPhase: targetPhase.id,
    }), targetPhase.id);
    return dispatchLifecycleEvent(def, redirected, { type: 'phaseEnter', phase: targetPhase.id }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
  }

  let nextState = dispatchLifecycleEvent(def, state, { type: 'phaseExit', phase: state.currentPhase }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
  const isLastPhase = currentPhaseIndex === phases.length - 1;

  if (!isLastPhase) {
    const nextPhase = phases[currentPhaseIndex + 1];
    if (nextPhase === undefined) {
      throw kernelRuntimeError(
        'PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND',
        `advancePhase could not resolve phase at index ${String(currentPhaseIndex + 1)}`,
        { nextPhaseIndex: currentPhaseIndex + 1 },
      );
    }

    nextState = applyCoupPhaseEntryReset(def, resetPhaseUsage({
      ...nextState,
      currentPhase: nextPhase.id,
    }), nextPhase.id);

    return dispatchLifecycleEvent(def, nextState, { type: 'phaseEnter', phase: nextPhase.id }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
  }

  nextState = dispatchLifecycleEvent(def, nextState, { type: 'turnEnd' }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
  const turnFlowLifecycle = applyTurnFlowCardBoundary(def, nextState);
  nextState = turnFlowLifecycle.state;
  const boundaryDurations = resolveBoundaryDurationsAtTurnEnd(turnFlowLifecycle.traceEntries);
  const expiry = applyBoundaryExpiry(
    def,
    nextState,
    boundaryDurations,
    triggerLogCollector,
    policy,
    collector,
  );
  nextState = expiry.state;
  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...turnFlowLifecycle.traceEntries);
  }
  const turnOrderAdvance = advanceTurnOrder(def, nextState);
  const rolledForCoupCheck = {
    ...nextState,
    turnCount: nextState.turnCount + 1,
    activePlayer: turnOrderAdvance.activePlayer,
    turnOrderState: turnOrderAdvance.turnOrderState,
  };
  const effectivePhases = effectiveTurnPhases(def, rolledForCoupCheck);
  const initialPhase = effectivePhases.at(0)?.id ?? firstPhaseId(def);
  const rolledState = applyCoupPhaseEntryReset(def, resetPhaseUsage(
    resetTurnUsage({
      ...rolledForCoupCheck,
      currentPhase: initialPhase,
    }),
  ), initialPhase);
  const afterTurnStart = dispatchLifecycleEvent(def, rolledState, { type: 'turnStart' }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
  return dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: initialPhase }, triggerLogCollector, policy, collector, 'lifecycle', cachedRuntime);
};

/**
 * In coup phases, when the current player has no legal moves, implicitly
 * pass them and cycle to the next eligible seat. Returns null if no
 * more eligible seats remain (the phase should advance instead).
 */
const coupPhaseImplicitPass = (
  def: GameDef,
  state: GameState,
): GameState | null => {
  if (!isInCoupPhase(def, state) || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }

  const runtime = state.turnOrderState.runtime;
  const currentSeat = resolveCurrentCoupSeat(def, state);
  const acted = new Set([...runtime.currentCard.actedSeats, currentSeat]);
  const passed = new Set([...runtime.currentCard.passedSeats, currentSeat]);

  const remaining = runtime.seatOrder.filter(
    (seat) => runtime.eligibility[seat] === true && !acted.has(seat),
  );
  if (remaining.length === 0) {
    return null;
  }

  const nextSeat = remaining[0]!;
  const nextSeatPlayerIndex = resolvePlayerIndexForTurnFlowSeat(def, state.playerCount, nextSeat);
  if (nextSeatPlayerIndex === null) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: coupPhaseImplicitPass could not resolve next seat "${nextSeat}" for playerCount=${state.playerCount}`,
    );
  }
  return {
    ...state,
    activePlayer: asPlayerId(nextSeatPlayerIndex),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          actedSeats: [...acted],
          passedSeats: [...passed],
          firstEligible: remaining[0] ?? null,
          secondEligible: remaining[1] ?? null,
        },
      },
    },
  };
};

export const advanceToDecisionPoint = (
  def: GameDef,
  state: GameState,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
  cachedRuntime?: GameDefRuntime,
): GameState => {
  const phaseCount = effectiveTurnPhases(def, state).length;
  if (phaseCount <= 0) {
    throw kernelRuntimeError(
      'DECISION_POINT_NO_PHASES',
      'advanceToDecisionPoint requires at least one effective turn phase',
    );
  }

  const maxAutoAdvancesPerMove = 2 * state.playerCount * phaseCount + 1;
  let nextState = state;
  let advances = 0;

  while (terminalResult(def, nextState, cachedRuntime) === null) {
    const isInterruptPhase = (def.turnStructure.interrupts ?? []).some((phase) => phase.id === nextState.currentPhase);
    const phaseValid = isInterruptPhase || effectiveTurnPhases(def, nextState).some((phase) => phase.id === nextState.currentPhase);
    if (phaseValid && legalMoves(def, nextState, undefined, cachedRuntime).length > 0) {
      break;
    }

    if (advances >= maxAutoAdvancesPerMove) {
      throw kernelRuntimeError(
        'DECISION_POINT_STALL_LOOP_DETECTED',
        `STALL_LOOP_DETECTED: exceeded maxAutoAdvancesPerMove=${maxAutoAdvancesPerMove}`,
        { maxAutoAdvancesPerMove },
      );
    }

    if (phaseValid) {
      const coupCycled = coupPhaseImplicitPass(def, nextState);
      if (coupCycled !== null) {
        nextState = coupCycled;
        advances += 1;
        continue;
      }
    }

    nextState = advancePhase(def, nextState, triggerLogCollector, policy, collector, cachedRuntime);
    advances += 1;
  }

  return nextState;
};
