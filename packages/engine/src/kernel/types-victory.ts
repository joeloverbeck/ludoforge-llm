import type { ConditionAST, ValueExpr } from './types-ast.js';

export type VictoryTiming = 'duringCoup' | 'finalCoup';

export interface VictoryCheckpointDef {
  readonly id: string;
  readonly seat: string;
  readonly timing: VictoryTiming;
  readonly when: ConditionAST;
}

export interface VictoryMarginDef {
  readonly seat: string;
  readonly value: ValueExpr;
}

export interface VictoryRankingDef {
  readonly order: 'desc' | 'asc';
  readonly tieBreakOrder?: readonly string[];
}

export interface VictoryTerminalRankingEntry {
  readonly seat: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}

export interface VictoryTerminalMetadata {
  readonly timing: VictoryTiming;
  readonly checkpointId: string;
  readonly winnerSeat: string;
  readonly ranking?: readonly VictoryTerminalRankingEntry[];
}
