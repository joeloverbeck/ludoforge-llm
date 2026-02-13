import type { ConditionAST, ValueExpr } from './types-ast.js';

export type VictoryTiming = 'duringCoup' | 'finalCoup';

export interface VictoryCheckpointDef {
  readonly id: string;
  readonly faction: string;
  readonly timing: VictoryTiming;
  readonly when: ConditionAST;
}

export interface VictoryMarginDef {
  readonly faction: string;
  readonly value: ValueExpr;
}

export interface VictoryRankingDef {
  readonly order: 'desc' | 'asc';
}

export interface VictoryDef {
  readonly checkpoints: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
}

export interface VictoryTerminalRankingEntry {
  readonly faction: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}

export interface VictoryTerminalMetadata {
  readonly timing: VictoryTiming;
  readonly checkpointId: string;
  readonly winnerFaction: string;
  readonly ranking?: readonly VictoryTerminalRankingEntry[];
}
