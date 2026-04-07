// ---------------------------------------------------------------------------
// Discriminated-union variants
// ---------------------------------------------------------------------------

/** Zone filter resolved to a definite match/no-match. */
export interface ZoneFilterEvaluationResolved {
  readonly status: 'resolved';
  readonly matched: boolean;
}

/** Zone filter could not be evaluated; evaluation deferred. */
export interface ZoneFilterEvaluationDeferred {
  readonly status: 'deferred';
  readonly reason: ZoneFilterDeferralReason;
}

/** Zone filter evaluation failed with a non-deferrable error. */
export interface ZoneFilterEvaluationFailed {
  readonly status: 'failed';
  readonly error: unknown;
}

/** Outcome of a zone-filter evaluation attempt. */
export type ZoneFilterEvaluationResult =
  | ZoneFilterEvaluationResolved
  | ZoneFilterEvaluationDeferred
  | ZoneFilterEvaluationFailed;

/** Why a zone-filter evaluation was deferred. */
export type ZoneFilterDeferralReason =
  | 'missingBinding'
  | 'missingVar';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export const zoneFilterResolved = (matched: boolean): ZoneFilterEvaluationResolved => ({
  status: 'resolved',
  matched,
});

export const zoneFilterDeferred = (reason: ZoneFilterDeferralReason): ZoneFilterEvaluationDeferred => ({
  status: 'deferred',
  reason,
});

export const zoneFilterFailed = (error: unknown): ZoneFilterEvaluationFailed => ({
  status: 'failed',
  error,
});

// ---------------------------------------------------------------------------
// Resolution utility
// ---------------------------------------------------------------------------

/** Policy for mapping each zone-filter evaluation outcome to a concrete value. */
export type ZoneFilterEvaluationResultPolicy<T> = {
  readonly onResolved: (matched: boolean) => T;
  readonly onDeferred: (reason: ZoneFilterDeferralReason) => T;
  readonly onFailed: (error: unknown) => T;
};

/** Map a ZoneFilterEvaluationResult to a concrete value using a policy. */
export const resolveZoneFilterEvaluationResult = <T>(
  result: ZoneFilterEvaluationResult,
  policy: ZoneFilterEvaluationResultPolicy<T>,
): T => {
  switch (result.status) {
    case 'resolved': return policy.onResolved(result.matched);
    case 'deferred': return policy.onDeferred(result.reason);
    case 'failed': return policy.onFailed(result.error);
  }
};
