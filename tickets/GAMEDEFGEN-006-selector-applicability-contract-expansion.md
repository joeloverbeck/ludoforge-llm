# GAMEDEFGEN-006: Expand Explicit Selector Applicability Contracts Across Runtime

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Extend explicit applicability contracts beyond `actor` and `executor` to other selector/runtime surfaces used in legality and move execution.
2. Introduce typed resolver outcomes (`applicable`, `notApplicable`, `invalidSpec`) for remaining selector families where runtime currently depends on thrown eval errors for branching.
3. Update kernel callsites in `legalMoves`, `legalChoices`, and `applyMove` to branch on typed outcomes instead of exception categories.
4. Keep runtime behavior deterministic and game-agnostic, with no game-specific branches.

## 2) Invariants That Should Pass

1. Normal legality/choice/apply branching does not depend on eval-error type matching for selector applicability.
2. `notApplicable` outcomes are skipped/illegal-handled deterministically and do not crash enumeration.
3. `invalidSpec` outcomes are surfaced explicitly and never silently swallowed.
4. Existing valid GameDef behavior and move ordering remain stable.

## 3) Tests That Should Pass

1. Unit: each migrated selector surface has explicit coverage for `applicable`, `notApplicable`, and `invalidSpec` outcomes.
2. Unit: legal move ordering remains unchanged for representative valid fixtures.
3. Unit: malformed selector specs fail with explicit typed errors, not incidental JS exceptions.
4. Integration: representative FITL suites touching migrated selector surfaces remain green.
