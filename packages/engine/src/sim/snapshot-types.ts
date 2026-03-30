import type { PhaseId, PlayerId, ZoneId } from '../kernel/branded.js';
import type { VariableValue } from '../kernel/types.js';

export type SnapshotDepth = 'none' | 'minimal' | 'standard' | 'verbose';

export interface SeatStandingSnapshot {
  readonly seat: string;
  readonly margin: number;
  readonly perPlayerVars?: Readonly<Record<string, VariableValue>>;
  readonly tokenCountOnBoard?: number;
}

export interface DecisionPointSnapshot {
  readonly turnCount: number;
  readonly phaseId: PhaseId;
  readonly activePlayer: PlayerId;
  readonly seatStandings: readonly SeatStandingSnapshot[];
}

export interface StandardDecisionPointSnapshot extends DecisionPointSnapshot {
  readonly globalVars: Readonly<Record<string, VariableValue>>;
}

export interface ZoneSummary {
  readonly zoneId: ZoneId;
  readonly zoneVars?: Readonly<Record<string, number>>;
  readonly tokenCountBySeat?: Readonly<Record<string, number>>;
}

export interface VerboseDecisionPointSnapshot extends StandardDecisionPointSnapshot {
  readonly zoneSummaries: readonly ZoneSummary[];
}
