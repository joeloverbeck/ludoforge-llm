import type { GameDef, GameState, TerminalResult } from './types.js';

export const terminalResult = (_def: GameDef, _state: GameState): TerminalResult | null => {
  throw new Error('terminalResult is not implemented in KERGAMLOOTRI-001');
};
