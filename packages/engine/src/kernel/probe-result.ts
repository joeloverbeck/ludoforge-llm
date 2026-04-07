/** Outcome of a speculative move evaluation. */
export type ProbeOutcome =
  | 'legal'
  | 'illegal'
  | 'inconclusive';

/** Why a probe was inconclusive (or illegal with a known cause). */
export type ProbeInconclusiveReason =
  | 'ownerMismatch'
  | 'missingBinding'
  | 'stackingViolation'
  | 'selectorCardinality';

// ---------------------------------------------------------------------------
// Discriminated-union variants
// ---------------------------------------------------------------------------

/** Probe outcome: the probe resolved to a definite legal value. */
export interface ProbeResultLegal<T> {
  readonly outcome: 'legal';
  readonly value: T;
}

/** Probe outcome: the probe resolved to definite illegality. */
export interface ProbeResultIllegal {
  readonly outcome: 'illegal';
  readonly reason?: ProbeInconclusiveReason;
}

/** Probe outcome: the probe could not resolve definitively. */
export interface ProbeResultInconclusive {
  readonly outcome: 'inconclusive';
  readonly reason?: ProbeInconclusiveReason;
}

/** A probe result is one of three discriminated outcomes. */
export type ProbeResult<T = void> =
  | ProbeResultLegal<T>
  | ProbeResultIllegal
  | ProbeResultInconclusive;

// ---------------------------------------------------------------------------
// Resolution utility
// ---------------------------------------------------------------------------

/** Policy for mapping each probe outcome to a concrete value. */
export type ProbeResultPolicy<T, TFallback> = {
  readonly onLegal: (value: T) => TFallback;
  readonly onIllegal: () => TFallback;
  readonly onInconclusive: (reason: ProbeInconclusiveReason | undefined) => TFallback;
};

/** Map a ProbeResult to a concrete value using a policy. */
export const resolveProbeResult = <T, TFallback>(
  result: ProbeResult<T>,
  policy: ProbeResultPolicy<T, TFallback>,
): TFallback => {
  switch (result.outcome) {
    case 'legal': return policy.onLegal(result.value);
    case 'illegal': return policy.onIllegal();
    case 'inconclusive': return policy.onInconclusive(result.reason);
  }
};
