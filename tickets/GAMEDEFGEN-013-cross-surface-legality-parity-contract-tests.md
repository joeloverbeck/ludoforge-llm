# GAMEDEFGEN-013: Add Cross-Surface Legality Parity Contract Tests

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Add a table-driven legality parity contract test suite that evaluates shared scenarios across all three entry points:
   - `legalMoves`
   - `legalChoices`
   - `applyMove`
2. Define a reusable scenario fixture format for applicability and predicate edge cases (phase mismatch, actor/executor non-applicability, limits exceeded, pipeline no-match, predicate evaluation failure, etc.).
3. For each scenario, assert the expected normalized outcome and each surface projection.
4. Ensure tests are data-driven and generic, with no game-specific hardcoding.

## 2) Invariants That Should Pass

1. Equivalent scenarios produce parity-consistent outcomes across all entry points.
2. Divergences are only those explicitly specified by surface contract (discoverability vs illegality signaling vs exception).
3. Malformed predicate and selector errors retain typed runtime error behavior.
4. Parity tests remain deterministic and stable under repeated runs.

## 3) Tests That Should Pass

1. New unit contract suite for cross-surface legality parity (table-driven).
2. Unit coverage for malformed predicate and selector error projection consistency.
3. Regression: existing legality/applicability dispatch tests continue to pass.
4. Full kernel unit suite for touched files passes.
