/**
 * Pure validator for chooseN selected sequences.
 *
 * Checks each item in a selected sequence for:
 * - domain membership
 * - duplicate detection
 * - tier admissibility at each point in the sequence
 *
 * Returns a list of invalid items with reasons rather than throwing.
 * This allows callers to inspect and act on invalidity (e.g., removal
 * invalidation in interactive sessions) without catching exceptions.
 *
 * Pure function — no side effects, no state mutation.
 */
import { computeTierAdmissibility, type PrioritizedTierEntry } from './prioritized-tier-legality.js';
import type { MoveParamScalar } from './types.js';

const validationKey = (value: unknown): string => JSON.stringify([typeof value, value]);

// ── Public types ─────────────────────────────────────────────────────

export type ChooseNValidationFailureReason = 'out-of-domain' | 'duplicate' | 'tier-blocked';

export interface ChooseNValidationFailure {
  readonly index: number;
  readonly value: MoveParamScalar;
  readonly reason: ChooseNValidationFailureReason;
}

export interface ValidateChooseNSelectedSequenceInput {
  readonly normalizedDomain: readonly MoveParamScalar[];
  readonly tiers: readonly (readonly PrioritizedTierEntry[])[] | null;
  readonly qualifierMode: 'none' | 'byQualifier';
  readonly selectedSequence: readonly MoveParamScalar[];
}

// ── Validator ────────────────────────────────────────────────────────

/**
 * Validate a chooseN selected sequence against domain, uniqueness,
 * and tier admissibility constraints.
 *
 * Items are checked in sequence order because tier admissibility
 * depends on prior valid selections. Invalid items do NOT contribute
 * to the "already selected" set for subsequent tier computations —
 * this is intentional so that removal invalidation is detected correctly.
 *
 * @returns Empty array when the sequence is valid; otherwise one entry
 *          per invalid item, in sequence order.
 */
export const validateChooseNSelectedSequence = (
  input: ValidateChooseNSelectedSequenceInput,
): readonly ChooseNValidationFailure[] => {
  const { normalizedDomain, tiers, qualifierMode, selectedSequence } = input;
  const failures: ChooseNValidationFailure[] = [];

  const domainKeys = new Set(normalizedDomain.map(validationKey));
  const seenKeys = new Set<string>();
  const validSelected: MoveParamScalar[] = [];

  for (let index = 0; index < selectedSequence.length; index += 1) {
    const value = selectedSequence[index]!;
    const key = validationKey(value);

    // Check 1: domain membership.
    if (!domainKeys.has(key)) {
      failures.push({ index, value, reason: 'out-of-domain' });
      continue;
    }

    // Check 2: duplicate detection.
    if (seenKeys.has(key)) {
      failures.push({ index, value, reason: 'duplicate' });
      continue;
    }

    // Check 3: tier admissibility (only when tiers are defined).
    if (tiers !== null) {
      const admissibility = computeTierAdmissibility(tiers, validSelected, qualifierMode);
      const admissibleKeys = new Set(admissibility.admissibleValues.map(validationKey));
      if (!admissibleKeys.has(key)) {
        failures.push({ index, value, reason: 'tier-blocked' });
        seenKeys.add(key);
        continue;
      }
    }

    seenKeys.add(key);
    validSelected.push(value);
  }

  return failures;
};
