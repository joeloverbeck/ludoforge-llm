import { asPlayerId } from './branded.js';
import { resetPhaseUsage, resetTurnUsage } from './action-usage.js';
import { legalMoves } from './legal-moves.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { terminalResult } from './terminal.js';
import type { GameDef, GameState, TriggerEvent } from './types.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

const dispatchLifecycleEvent = (
  def: GameDef,
  state: GameState,
  event: TriggerEvent,
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

const nextActivePlayer = (def: GameDef, state: GameState): GameState['activePlayer'] => {
  if (def.turnStructure.activePlayerOrder === 'fixed') {
    return state.activePlayer;
  }

  return asPlayerId((Number(state.activePlayer) + 1) % state.playerCount);
};

export const advancePhase = (def: GameDef, state: GameState): GameState => {
  const phases = def.turnStructure.phases;
  const currentPhaseIndex = phases.findIndex((phase) => phase.id === state.currentPhase);
  if (currentPhaseIndex < 0) {
    throw new Error(`advancePhase could not find current phase ${String(state.currentPhase)} in turnStructure.phases`);
  }

  let nextState = dispatchLifecycleEvent(def, state, { type: 'phaseExit', phase: state.currentPhase });
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
    return dispatchLifecycleEvent(def, nextState, { type: 'phaseEnter', phase: nextPhase.id });
  }

  nextState = dispatchLifecycleEvent(def, nextState, { type: 'turnEnd' });
  const newActivePlayer = nextActivePlayer(def, nextState);
  const initialPhase = firstPhaseId(def);
  const rolledState = resetPhaseUsage(
    resetTurnUsage({
      ...nextState,
      turnCount: nextState.turnCount + 1,
      activePlayer: newActivePlayer,
      currentPhase: initialPhase,
    }),
  );
  const afterTurnStart = dispatchLifecycleEvent(def, rolledState, { type: 'turnStart' });
  return dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: initialPhase });
};

export const advanceToDecisionPoint = (def: GameDef, state: GameState): GameState => {
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

    nextState = advancePhase(def, nextState);
    advances += 1;
  }

  return nextState;
};
