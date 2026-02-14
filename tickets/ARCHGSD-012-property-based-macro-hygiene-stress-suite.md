# ARCHGSD-012 - Property-Based Macro Hygiene Stress Suite

**Status**: TODO  
**Priority**: P1  
**Type**: Quality / Compiler Robustness  
**Depends on**: `ARCHGSD-010`

## Why this ticket exists
Macro hygiene failures tend to emerge from deep nesting and unusual binder/template combinations. Example-based tests are necessary but insufficient for universal GameSpecDoc coverage.

## 1) Specification (what must change)
- Add property-based test generators for macro structures with:
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

## 2) Invariants (must remain true)
- Property tests are deterministic under fixed seeds.
- Expansion remains game-agnostic and independent of game-specific identifiers.
- Failures provide reproducible minimal counterexamples.

## 3) Tests to add/modify
## New tests
- `test/unit/property/macro-hygiene.property.test.ts`
  - property checks listed above.
- `test/unit/expand-effect-macros.test.ts`
  - add curated regression fixtures captured from property-test counterexamples.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
