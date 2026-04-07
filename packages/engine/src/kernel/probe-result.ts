/** Outcome of a speculative move evaluation. */
export type ProbeOutcome =
  | 'legal'
  | 'illegal'
  | 'inconclusive';

/** Why a probe was inconclusive. */
export type ProbeInconclusiveReason =
  | 'ownerMismatch'
  | 'missingBinding'
  | 'stackingViolation'
  | 'selectorCardinality';

/** Result of a speculative move evaluation. */
export interface ProbeResult<T = void> {
  readonly outcome: ProbeOutcome;
  readonly reason?: ProbeInconclusiveReason;
  /** Payload present when outcome is 'legal'. Shape varies by call site. */
  readonly value?: T;
}
