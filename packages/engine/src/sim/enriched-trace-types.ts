import type {
  CompoundTurnSummary,
  DecisionLog,
  GameState,
  SimulationStopReason,
  TerminalResult,
} from '../kernel/index.js';

export type EnrichedDecisionLog = DecisionLog;

export interface EnrichedGameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly seatNames: readonly string[];
  readonly decisions: readonly EnrichedDecisionLog[];
  readonly compoundTurns: readonly CompoundTurnSummary[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
  readonly traceProtocolVersion: 'spec-140';
}
