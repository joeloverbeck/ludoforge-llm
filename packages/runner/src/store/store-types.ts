import type {
  ActionId,
  ChoicePendingRequest,
  LegalMoveEnumerationResult,
  MoveParamValue,
  PlayerId,
  TerminalResult,
} from '@ludoforge/engine';

export type PlayerSeat = 'human' | 'ai-random' | 'ai-greedy';

/** One step in the progressive choice breadcrumb. */
export interface PartialChoice {
  readonly decisionId: string;
  readonly name: string;
  readonly value: MoveParamValue;
}

/** Context passed to deriveRenderModel() beyond state + def. */
export interface RenderContext {
  readonly playerID: PlayerId;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly terminal: TerminalResult | null;
}
