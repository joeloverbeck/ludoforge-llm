export interface FreeOperationSequenceContextContract {
  readonly captureMoveZoneCandidatesAs?: string;
  readonly requireMoveZoneCandidatesFrom?: string;
}

export interface FreeOperationSequenceContextGrantLike {
  readonly sequence?: {
    readonly batch?: unknown;
    readonly step?: unknown;
    readonly progressionPolicy?: unknown;
  };
  readonly sequenceContext?: {
    readonly captureMoveZoneCandidatesAs?: unknown;
    readonly requireMoveZoneCandidatesFrom?: unknown;
  };
}
