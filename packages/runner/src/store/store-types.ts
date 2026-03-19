import type {
  ActionId,
  ChoicePendingRequest,
  DecisionKey,
  LegalMoveEnumerationResult,
  Move,
  MoveParamValue,
  PlayerId,
  TerminalResult,
} from '@ludoforge/engine/runtime';

export type PlayerSeat = 'human' | 'ai-random' | 'ai-greedy';

/** One step in the progressive choice breadcrumb. */
export interface PartialChoice {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly value: MoveParamValue;
}

/** Context passed to semantic frame derivation beyond state + def. */
export interface RenderContext {
  readonly playerID: PlayerId;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly partialMove: Move | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly terminal: TerminalResult | null;
}
