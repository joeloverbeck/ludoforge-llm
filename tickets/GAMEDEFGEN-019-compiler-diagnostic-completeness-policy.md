# GAMEDEFGEN-019: Compiler Diagnostic Completeness Policy for Partial-Compile Failures

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Define and codify a compiler-wide policy for diagnostics when earlier section failures occur (explicitly choose and enforce either strict fail-fast cross-validation skipping or best-effort additional diagnostics).
2. Apply the chosen policy consistently across compiler phases, especially where cross-validation currently depends on section success.
3. Make diagnostic production deterministic under the policy (stable codes, paths, and ordering regardless of traversal noise).
4. Document the policy as part of compiler contract so GameSpec authors can rely on predictable feedback behavior.
5. Keep policy generic for all games and GameSpecDocs.

## 2) Invariants That Should Pass

1. Compiler behavior for partial-compile documents follows one explicit policy, not implicit module-by-module behavior.
2. Diagnostics remain deterministic for identical invalid documents.
3. Policy does not hide mandatory structural errors or emit contradictory diagnostics.
4. Policy remains game-agnostic and independent of specific content packs.

## 3) Tests That Should Pass

1. Unit: representative partial-compile scenarios assert policy-conformant diagnostic presence/absence.
2. Unit: deterministic ordering tests for mixed lowerer + cross-validator diagnostics under failure conditions.
3. Integration: invalid GameSpecDoc examples produce stable, policy-consistent diagnostic sets.
4. Regression: existing compiler diagnostics tests pass or are updated only where policy intentionally changes expected output.
