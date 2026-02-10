import type { PlayerId } from './branded.js';

export interface RngState {
  readonly state: readonly bigint[];
}

export interface ActionUsageRecord {
  readonly turnCount: number;
  readonly phaseCount: number;
  readonly gameCount: number;
}

export interface PlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

export type TerminalResult =
  | { readonly type: 'win'; readonly player: PlayerId }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score'; readonly ranking: readonly PlayerScore[] };

export interface BehaviorCharacterization {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly mechanicCount: number;
}
