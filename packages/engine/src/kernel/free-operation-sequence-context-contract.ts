export interface FreeOperationSequenceContextContract {
  readonly captureMoveZoneCandidatesAs?: string;
  readonly requireMoveZoneCandidatesFrom?: string;
}

export interface FreeOperationSequenceContextGrantLike {
  readonly sequence?: {
    readonly chain?: unknown;
    readonly step?: unknown;
  };
  readonly sequenceContext?: {
    readonly captureMoveZoneCandidatesAs?: unknown;
    readonly requireMoveZoneCandidatesFrom?: unknown;
  };
}
