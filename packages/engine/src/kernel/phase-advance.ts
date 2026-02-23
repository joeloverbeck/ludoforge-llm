import { asPlayerId } from './branded.js';
import { resetPhaseUsage, resetTurnUsage } from './action-usage.js';
import { expireLastingEffectsAtBoundaries, resolveBoundaryDurationsAtTurnEnd } from './event-execution.js';
import { legalMoves } from './legal-moves.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import { kernelRuntimeError } from './runtime-error.js';
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
  return def.turnStructure.phases.filter((phase) => !omitted.has(String(phase.id)));
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
): GameState => {
  const phases = effectiveTurnPhases(def, state);
  const currentPhaseIndex = phases.findIndex((phase) => phase.id === state.currentPhase);
  if (currentPhaseIndex < 0) {
    throw kernelRuntimeError(
      'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND',
      `advancePhase could not find current phase ${String(state.currentPhase)} in effective turn phases`,
      { currentPhase: state.currentPhase },
    );
  }

  let nextState = dispatchLifecycleEvent(def, state, { type: 'phaseExit', phase: state.currentPhase }, triggerLogCollector, policy, collector);
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

    nextState = resetPhaseUsage({
      ...nextState,
      currentPhase: nextPhase.id,
    });
    return dispatchLifecycleEvent(def, nextState, { type: 'phaseEnter', phase: nextPhase.id }, triggerLogCollector, policy, collector);
  }

  nextState = dispatchLifecycleEvent(def, nextState, { type: 'turnEnd' }, triggerLogCollector, policy, collector);
  const turnFlowLifecycle = applyTurnFlowCardBoundary(def, nextState);
  nextState = turnFlowLifecycle.state;
  const boundaryDurations = resolveBoundaryDurationsAtTurnEnd(turnFlowLifecycle.traceEntries);
  const expiry = expireLastingEffectsAtBoundaries(
    def,
    nextState,
    { state: nextState.rng },
    boundaryDurations,
    policy,
    collector,
  );
  nextState = {
    ...expiry.state,
    rng: expiry.rng.state,
  };
  for (const emittedEvent of expiry.emittedEvents) {
    nextState = dispatchLifecycleEvent(def, nextState, emittedEvent, triggerLogCollector, policy, collector);
  }
  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...turnFlowLifecycle.traceEntries);
  }
  const turnOrderAdvance = advanceTurnOrder(def, nextState);
  const initialPhase = firstPhaseId(def);
  const rolledState = resetPhaseUsage(
    resetTurnUsage({
      ...nextState,
      turnCount: nextState.turnCount + 1,
      activePlayer: turnOrderAdvance.activePlayer,
      turnOrderState: turnOrderAdvance.turnOrderState,
      currentPhase: initialPhase,
    }),
  );
  const afterTurnStart = dispatchLifecycleEvent(def, rolledState, { type: 'turnStart' }, triggerLogCollector, policy, collector);
  return dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: initialPhase }, triggerLogCollector, policy, collector);
};

export const advanceToDecisionPoint = (
  def: GameDef,
  state: GameState,
  triggerLogCollector?: TriggerLogEntry[],
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
): GameState => {
  const phaseCount = effectiveTurnPhases(def, state).length;
  if (phaseCount <= 0) {
    throw kernelRuntimeError(
      'DECISION_POINT_NO_PHASES',
      'advanceToDecisionPoint requires at least one effective turn phase',
    );
  }

  const maxAutoAdvancesPerMove = state.playerCount * phaseCount + 1;
  let nextState = state;
  let advances = 0;

  while (terminalResult(def, nextState) === null && legalMoves(def, nextState).length === 0) {
    if (advances >= maxAutoAdvancesPerMove) {
      throw kernelRuntimeError(
        'DECISION_POINT_STALL_LOOP_DETECTED',
        `STALL_LOOP_DETECTED: exceeded maxAutoAdvancesPerMove=${maxAutoAdvancesPerMove}`,
        { maxAutoAdvancesPerMove },
      );
    }

    nextState = advancePhase(def, nextState, triggerLogCollector, policy, collector);
    advances += 1;
  }

  return nextState;
};
