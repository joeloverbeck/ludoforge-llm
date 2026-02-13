import type { GameState } from '../../src/kernel/index.js';

export function maybeCardDrivenRuntime(state: GameState) {
  return state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : undefined;
}

export function requireCardDrivenRuntime(state: GameState) {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw new Error(`Expected cardDriven turnOrderState, received "${state.turnOrderState.type}".`);
  }
  return state.turnOrderState.runtime;
}
