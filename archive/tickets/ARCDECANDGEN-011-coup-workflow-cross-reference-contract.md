# ARCDECANDGEN-011: Coup Workflow Cross-Reference Contract

**Status**: ✅ COMPLETED
**Phase**: 3B (Coup-Domain Cross-Reference Design)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-010

## Problem (Reassessed)

- The original assumption that current code still enforced `coupPlan -> turnStructure` coupling is no longer true.
- `ARCDECANDGEN-010` already keeps cross-reference validation scoped to the intended domains and does not cross-check `coupPlan.phases[].id` against `turnStructure.phases[].id`.
- `coupPlan.finalRoundOmitPhases[]` already validates against declared `coupPlan.phases[].id` in both compiler and runtime validator.
- The remaining gap is regression safety: we need an explicit test that proves the domain separation invariant so future refactors do not reintroduce coupling.

## Goal

Codify and lock the coup workflow domain boundary:

1. Keep coup-phase identifiers independent from turn-structure phase identifiers.
2. Preserve strict coup-internal validation (`finalRoundOmitPhases[]` -> `coupPlan.phases[].id`).
3. Add targeted regression coverage for this invariant.

## Architecture Decision

### Not adopted in this ticket

- Do not introduce enum-backed coup step kinds yet.
- Reason: `coupPlan.phases[].steps[]` are currently symbolic metadata and are not consumed by kernel execution. Adding a global enum now would create a hard contract without an execution consumer, increasing coupling without architectural payoff.

### Adopted in this ticket

- Keep validation where semantics already exist:
  - `coupPlan.phases[]` shape and uniqueness.
  - `finalRoundOmitPhases[]` references only declared coup phase IDs.
- Add explicit tests to preserve the no-coupling invariant with `turnStructure.phases`.

## Files to touch

- `test/unit/validate-gamedef.test.ts`
- `test/unit/compile-top-level.test.ts` (only if current coverage proves insufficient after reassessment)

## Acceptance Criteria

- Validation never requires `coupPlan.phases[].id` to appear in `turnStructure.phases[].id`.
- `finalRoundOmitPhases[]` continues to validate only against `coupPlan.phases[].id`.
- Regression tests explicitly cover the domain separation invariant.
- `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Test Plan

1. Add/strengthen unit coverage for:
   - a valid `GameDef` where `turnStructure` phase IDs and `coupPlan` phase IDs are intentionally disjoint, with no diagnostics.
   - existing negative case for unknown `finalRoundOmitPhases[]` remains failing as expected.
2. Run focused test files first, then `npm test`.

## Outcome

- **Completion date**: February 13, 2026
- **What was actually changed**:
  - Reassessed and corrected the ticket assumptions to match current code reality (no existing `coupPlan -> turnStructure` coupling).
  - Narrowed scope to architecture-safe regression hardening instead of introducing new unused coup-step enums/contracts.
  - Added regression coverage in `test/unit/validate-gamedef.test.ts` to enforce coup/turnStructure identifier-domain separation.
- **Deviation from original plan**:
  - Did not modify compiler/runtime coup schema contracts because the originally proposed coupling fix had already been implemented in prior work.
  - Did not add new coup-step-id declaration machinery because `coupPlan.phases[].steps[]` remain symbolic metadata with no kernel execution consumer yet.
- **Verification results**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
