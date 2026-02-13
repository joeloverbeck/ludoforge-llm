import { asPlayerId } from './branded.js';
import { resetPhaseUsage, resetTurnUsage } from './action-usage.js';
import { legalMoves } from './legal-moves.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { terminalResult } from './terminal.js';
import type { GameDef, GameState, TriggerEvent, TriggerLogEntry } from './types.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

const dispatchLifecycleEvent = (
  def: GameDef,
  state: GameState,
  event: TriggerEvent,
  triggerLogCollector?: TriggerLogEntry[],
): GameState => {
  const result = dispatchTriggers(
    def,
    state,
    { state: state.rng },
    event,
    0,
    def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH,
    [],
  );

  if (triggerLogCollector !== undefined) {
    triggerLogCollector.push(...result.triggerLog);
  }

  return {
    ...result.state,
    rng: result.rng.state,
  };
};

const firstPhaseId = (def: GameDef): GameState['currentPhase'] => {
  const phaseId = def.turnStructure.phases.at(0)?.id;
  if (phaseId === undefined) {
    throw new Error('advancePhase requires at least one phase in turnStructure.phases');
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
          Array.from({ length: state.playerCount }, (_unused, index) => [String(index), false]),
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
): GameState => {
  const phases = def.turnStructure.phases;
  const currentPhaseIndex = phases.findIndex((phase) => phase.id === state.currentPhase);
  if (currentPhaseIndex < 0) {
    throw new Error(`advancePhase could not find current phase ${String(state.currentPhase)} in turnStructure.phases`);
  }

  let nextState = dispatchLifecycleEvent(def, state, { type: 'phaseExit', phase: state.currentPhase }, triggerLogCollector);
  const isLastPhase = currentPhaseIndex === phases.length - 1;

  if (!isLastPhase) {
    const nextPhase = phases[currentPhaseIndex + 1];
    if (nextPhase === undefined) {
      throw new Error(`advancePhase could not resolve phase at index ${String(currentPhaseIndex + 1)}`);
    }

    nextState = resetPhaseUsage({
      ...nextState,
      currentPhase: nextPhase.id,
    });
    return dispatchLifecycleEvent(def, nextState, { type: 'phaseEnter', phase: nextPhase.id }, triggerLogCollector);
  }

  nextState = dispatchLifecycleEvent(def, nextState, { type: 'turnEnd' }, triggerLogCollector);
  const turnFlowLifecycle = applyTurnFlowCardBoundary(def, nextState);
  nextState = turnFlowLifecycle.state;
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
  const afterTurnStart = dispatchLifecycleEvent(def, rolledState, { type: 'turnStart' }, triggerLogCollector);
  return dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: initialPhase }, triggerLogCollector);
};

export const advanceToDecisionPoint = (
  def: GameDef,
  state: GameState,
  triggerLogCollector?: TriggerLogEntry[],
): GameState => {
  const phaseCount = def.turnStructure.phases.length;
  if (phaseCount <= 0) {
    throw new Error('advanceToDecisionPoint requires at least one phase in turnStructure.phases');
  }

  const maxAutoAdvancesPerMove = state.playerCount * phaseCount + 1;
  let nextState = state;
  let advances = 0;

  while (terminalResult(def, nextState) === null && legalMoves(def, nextState).length === 0) {
    if (advances >= maxAutoAdvancesPerMove) {
      throw new Error(`STALL_LOOP_DETECTED: exceeded maxAutoAdvancesPerMove=${maxAutoAdvancesPerMove}`);
    }

    nextState = advancePhase(def, nextState, triggerLogCollector);
    advances += 1;
  }

  return nextState;
};
