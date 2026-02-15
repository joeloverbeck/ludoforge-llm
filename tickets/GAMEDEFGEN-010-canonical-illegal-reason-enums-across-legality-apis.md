# GAMEDEFGEN-010: Canonical Illegal-Reason Enums Across Legality APIs

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Small-Medium

## 1) What Needs To Change / Be Added

1. Define a single canonical typed union for legality/choice illegal reasons used by kernel APIs.
2. Align `legalMoves`-adjacent decision reasons, `legalChoices` illegal reasons, and related apply/validation reason metadata onto shared constants/types.
3. Remove ad hoc reason-string drift between modules.
4. Ensure reason taxonomies remain engine-generic and not game-specific.

## 2) Invariants That Should Pass

1. Illegal reason values are strongly typed and consistent across relevant kernel APIs.
2. No duplicate semantic reasons exist under different strings.
3. Existing valid flows preserve behavior; only reason taxonomy becomes canonicalized.
4. Downstream consumers (agents/sim/test helpers) can rely on stable reason enums.

## 3) Tests That Should Pass

1. Unit: exhaustive type-level and runtime tests validate canonical reason mapping/usage.
2. Unit: `legalChoices` illegal outputs use only canonical reason enum members.
3. Unit: `applyMove` illegal metadata reason fields map to canonical reasons where applicable.
4. Regression: existing tests relying on reason values are updated and pass with canonical names.
