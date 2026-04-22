import type {
  ChoicePendingRequest,
  DecisionKey,
  LegalMoveEnumerationResult,
  MoveParamValue,
  PlayerId,
  TerminalResult,
} from '@ludoforge/engine/runtime';
import type { SeatController } from '../seat/seat-controller.js';

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
  readonly actionAvailabilityById?: ReadonlyMap<string, boolean>;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedActionId: string | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, SeatController>;
  readonly terminal: TerminalResult | null;
}
