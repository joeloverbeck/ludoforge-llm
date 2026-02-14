# ARCHGSD-012 - Property-Based Macro Hygiene Stress Suite

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Quality / Compiler Robustness  
**Depends on**: `ARCHGSD-010`

## Why this ticket exists
Macro hygiene failures tend to emerge from deep nesting and unusual binder/template combinations. Example-based tests are necessary but insufficient for universal GameSpecDoc coverage.

## Assumption Reassessment (2026-02-14)
- `test/unit/expand-effect-macros.test.ts` already contains substantial curated macro-hygiene regressions:
  - exported vs non-exported binder handling,
  - non-binding literal safety,
  - binder-bearing query/selector/reference rewriting,
  - leakage and unresolved-template diagnostics.
- The real gap is not fixture breadth, but stress coverage across many generated nested combinations with deterministic replay.

## 1) Specification (what must change)
- Add property-style generators for macro structures with:
  - nested macro invocations,
  - binder declarations/references/templates,
  - exported vs non-exported binders,
  - selector fields and binding-bearing query/reference shapes.
- Define properties that must always hold:
  - deterministic expansion output for identical input;
  - no non-binding literal mutation;
  - no unexported binder leakage across invocation boundaries;
  - deterministic diagnostics on invalid inputs.
- Include seeded replay support for shrinking/failure reproduction.

## Scope Adjustment
- Primary implementation target: add `test/unit/property/macro-hygiene.property.test.ts`.
- `test/unit/expand-effect-macros.test.ts` should only be modified if the new property suite discovers a concrete failing counterexample that is not already covered.

## 2) Invariants (must remain true)
- Property tests are deterministic under fixed seeds.
- Expansion remains game-agnostic and independent of game-specific identifiers.
- Failures provide reproducible minimal counterexamples.

## 3) Tests to add/modify
## New tests
- `test/unit/property/macro-hygiene.property.test.ts`
  - property checks listed above.

## Conditional test updates
- `test/unit/expand-effect-macros.test.ts`
  - add curated regression fixtures only for newly discovered failing counterexamples.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added `test/unit/property/macro-hygiene.property.test.ts` with seeded property-style stress checks for:
    - deterministic expansion output;
    - deterministic diagnostics on invalid generated docs;
    - non-binding literal stability;
    - no unexported binder leakage in generated valid docs.
  - Reassessed and corrected ticket assumptions/scope to reflect that curated macro hygiene coverage already existed in `test/unit/expand-effect-macros.test.ts`.
- Deviations from original plan:
  - Did not add new curated cases to `test/unit/expand-effect-macros.test.ts` because no new failing counterexamples were discovered by the stress suite.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
