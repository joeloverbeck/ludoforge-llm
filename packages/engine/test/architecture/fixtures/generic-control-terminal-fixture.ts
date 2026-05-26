import { applyMove, legalMoves, terminalResult } from '../../../src/kernel/index.js';
import type { GameDef, GameState, TerminalResult } from '../../../src/kernel/types.js';

export const GENERIC_CONTROL_TERMINAL_FIXTURE = {
  seed: 198001,
  playerCount: 2,
  maxSteps: 8,
  expectedScores: [2, 2],
} as const;

export const playGenericControlTerminalFixture = (
  gameDef: GameDef,
  initial: GameState,
): { state: GameState; result: TerminalResult | null } => {
  let state = initial;

  for (
    let step = 0;
    step < GENERIC_CONTROL_TERMINAL_FIXTURE.maxSteps && terminalResult(gameDef, state) === null;
    step += 1
  ) {
    const moves = legalMoves(gameDef, state);
    if (moves.length === 0) {
      break;
    }
    const claim = moves.find((move) => move.actionId === 'claim');
    state = applyMove(gameDef, state, claim ?? moves[0]!).state;
  }

  return { state, result: terminalResult(gameDef, state) };
};
