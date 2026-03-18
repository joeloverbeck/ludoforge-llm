import type {
  GameState,
  MoveContext,
  MoveLog,
  SimulationStopReason,
  TerminalResult,
} from '../kernel/index.js';

export interface EnrichedMoveLog extends MoveLog {
  readonly seatId: string;
  readonly moveContext?: MoveContext;
}

export interface EnrichedGameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly seatNames: readonly string[];
  readonly moves: readonly EnrichedMoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
}
