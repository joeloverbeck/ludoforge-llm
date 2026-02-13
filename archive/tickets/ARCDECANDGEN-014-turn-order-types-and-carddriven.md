# ARCDECANDGEN-014: Introduce `TurnOrderStrategy` Discriminated Union and Migrate `cardDriven`

**Status**: ✅ COMPLETED
**Phase**: 5A (Generalized Turn Order Strategy)
**Priority**: P1
**Complexity**: XL
**Dependencies**: ARCDECANDGEN-001 (types split), ARCDECANDGEN-002 (compiler split), ARCDECANDGEN-003 (validate-spec split)

## Goal

Reassess this migration ticket against current code/tests and convert it into a robust, staged change plan that preserves architecture quality and avoids brittle mega-refactors.

## Assumption Reassessment (February 13, 2026)

- The repository is still on `turnFlow` + root-level `coupPlan` across kernel, compiler, schema, fixtures, and tests.
- The original file list is incomplete for current reality:
  - parser/document/compiler section wiring and structured compile-result tests still reference `turnFlow` and `coupPlan` directly.
  - integration/unit golden fixtures and schema tests have broad direct coupling to current names.
- The original "single XL migration ticket" scope is too wide for safe, reviewable delivery and high confidence testing in one change set.

## Architecture Rationale (Reassessed)

The proposed direction (`turnFlow`/`coupPlan` → discriminated `turnOrder`) is still more beneficial than the current architecture because it:
- removes FITL-specific top-level kernel coupling,
- enables extensible turn-order variants with exhaustive dispatch,
- consolidates coup semantics under card-driven turn-order config.

But this should be delivered as staged tickets, not one monolithic rewrite.

## Updated Scope (This Ticket)

1. Reassess and correct ticket assumptions/scope to match actual codebase state and `specs/32-architecture-decomposition-and-generalization.md`.
2. Add one safety hardening change discovered during reassessment:
   - enforce that declared `coupPlan.phases` is non-empty in compiler + kernel validation + schema.
3. Add/strengthen focused tests for that invariant.
4. Do not perform the full `turnFlow` → `turnOrder` rename in this ticket.

## File List (Reassessed)

### Files to modify now
- `src/cnl/compile-victory.ts`
- `src/kernel/validate-gamedef-extensions.ts`
- `src/kernel/schemas-extensions.ts`
- `test/unit/compile-top-level.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/unit/schemas-top-level.test.ts`

## Out of Scope

- Full discriminated-union migration (`turnOrder`, `turnOrderState`, nested `coupPlan`) and broad rename fallout.
- Aliasing/backward-compatibility shims.
- Runtime behavior changes to turn sequencing.

## Acceptance Criteria

### Tests that must pass
- Focused unit suites covering compiler/kernel/schema contracts for coupPlan and top-level compile behavior.
- `npm run typecheck`

### Invariants that must remain true
- If `coupPlan` is declared, it must contain at least one phase.
- Compiler diagnostics and schema paths for invalid `coupPlan` remain deterministic/actionable.
- Existing turn-flow runtime behavior is unchanged.

## Outcome

- Completion date: February 13, 2026
- What was actually changed:
  - Reassessed and corrected ticket assumptions/scope against current code and `specs/32-architecture-decomposition-and-generalization.md`.
  - Implemented an immediate robustness hardening in current architecture: `coupPlan.phases` must be non-empty.
  - Enforced this invariant in compiler lowering, kernel GameDef validation, and GameDef schema.
  - Added focused unit tests for compiler diagnostics, kernel validation diagnostics, and schema path reporting.
- Deviations from the original plan:
  - The full `turnFlow` → `turnOrder` discriminated-union migration was intentionally not executed in this ticket.
  - The migration remains architecturally preferred, but was re-scoped as staged follow-up work instead of a single monolithic refactor.
- Verification results:
  - `npm run typecheck` passed.
  - Focused unit tests passed:
    - `dist/test/unit/compile-top-level.test.js`
    - `dist/test/unit/validate-gamedef.test.js`
    - `dist/test/unit/schemas-top-level.test.js`
  - Full `npm test` (unit + integration) passed.
