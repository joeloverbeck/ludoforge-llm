import type {
  EffectTraceEntry,
  Move,
  StateDelta,
  TerminalResult,
  TriggerLogEntry,
} from '../kernel/types-core.js';
import type { PlayerId } from '../kernel/branded.js';

// ── AI Decision Trace ───────────────────────────────────

export interface AiDecisionTrace {
  readonly seatType: 'ai-random' | 'ai-greedy' | 'ai-mcts-fast' | 'ai-mcts-default' | 'ai-mcts-strong';
  readonly candidateCount: number;
  readonly selectedIndex: number;
}

// ── Trace Events ────────────────────────────────────────

export interface GameInitializedEvent {
  readonly kind: 'game-initialized';
  readonly seed: number;
  readonly playerCount: number;
  readonly phase: string;
}

export interface MoveAppliedEvent {
  readonly kind: 'move-applied';
  readonly turnCount: number;
  readonly player: PlayerId;
  readonly move: Move;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly aiDecision?: AiDecisionTrace;
}

export interface GameTerminalEvent {
  readonly kind: 'game-terminal';
  readonly result: TerminalResult;
  readonly turnCount: number;
}

export type TraceEvent =
  | GameInitializedEvent
  | MoveAppliedEvent
  | GameTerminalEvent;

export type TraceSubscriber = (event: TraceEvent) => void;
