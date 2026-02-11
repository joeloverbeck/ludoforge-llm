# FITLMAPSCEANDSTAMOD-006 - Derived-State Recompute and Consistency Guards

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-005`

## Goal
Implement deterministic recomputation for control and victory-relevant projections from canonical state, with validation guards against canonical/derived drift.

## Scope
- Add pure recomputation functions for control totals and support/opposition aggregates.
- Add optional cached-derived assertions in validation paths.
- Ensure synthetic state edits recompute to stable values.

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/validate-gamedef.ts`
- `src/kernel/eval-query.ts`
- `test/unit/property/spatial.property.test.ts`
- `test/unit/property/eval.property.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/unit/eval-query.test.ts`

## Out Of Scope
- No victory check end-condition logic from Spec 19.
- No operation/event execution behavior.
- No trace/e2e campaign flow assertions.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/eval-query.test.ts`
  - recomputed control and support/opposition aggregates match expected fixtures.
- `test/unit/validate-gamedef.test.ts`
  - cached-derived mismatch (if present) is detected with actionable diagnostic.
- `test/unit/property/eval.property.test.ts`
  - synthetic edits preserve recomputation determinism.
- `test/unit/property/spatial.property.test.ts`
  - recomputation remains stable under deterministic zone ordering.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Canonical state is the single source of truth.
- Derived values are deterministic pure functions of canonical state.
- No incremental hidden counters drift from canonical projections.
