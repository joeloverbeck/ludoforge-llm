import type { GameState } from './types.js';

type OptionalStateKey = {
  [K in keyof GameState]-?: undefined extends GameState[K] ? K : never;
}[keyof GameState];

export const omitOptionalStateKey = <K extends OptionalStateKey>(
  state: GameState,
  key: K,
): GameState => {
  const nextState = { ...state };
  delete nextState[key];
  return nextState;
};
