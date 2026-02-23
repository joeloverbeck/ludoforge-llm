# FITLRULES2-005: Limited Operation Enforcement Verification (Rule 2.3.5)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test coverage only
**Deps**: FITLRULES2-001 (already satisfied)

## Problem

Rule 2.3.5 requires a Limited Operation (LimOp) to execute in exactly one destination/target space domain and disallow any accompanying Special Activity (SA).

## Assumption Reassessment

The original ticket assumptions were partially stale versus current repository state.

1. Existing LimOp coverage was already substantial.
- Structural and runtime LimOp selector enforcement already existed in `packages/engine/test/integration/fitl-limited-ops.test.ts` and `packages/engine/test/integration/fitl-coin-operations.test.ts`.
- Turn-flow option matrix enforcement for second eligible (including LimOp class behavior) already existed in `packages/engine/test/integration/fitl-option-matrix.test.ts`.

2. LimOp gating implementation is split across direct profile logic and shared macros.
- The original wording implied profile-local checks only in `data/games/fire-in-the-lake/30-rules-actions.md`.
- Current architecture correctly uses both direct checks in profiles and shared macros in `data/games/fire-in-the-lake/20-macros.md`.

3. “Special Activity suppression may be profile-level or kernel-level” was underspecified.
- Current behavior already rejects illegal SA compounding paths at runtime.
- Missing piece was an explicit FITL regression test that asserts a move labeled `actionClass: 'limitedOperation'` cannot be submitted with `compound.specialActivity`.

## Updated Scope

Complete as a verification-and-hardening ticket with **test-only** changes:

1. Confirm LimOp selector constraints are already encoded and covered.
2. Add explicit regression coverage for LimOp + SA prohibition on submission.
3. Do not change engine/runtime or FITL YAML data unless a failing test demonstrates a true gap.

## Architecture Decision

No architectural refactor was warranted.

- Current architecture already centralizes most LimOp semantics appropriately:
  - Turn-flow action-class gating controls allowed second-eligible classes.
  - Operation profile/macro selectors enforce LimOp space constraints.
  - Runtime compound SA checks reject disallowed pairings.
- Adding a focused regression test is higher-value than introducing redundant logic.
- This preserves a clean, extensible model without aliasing or compatibility shims.

## Invariants

1. LimOp space/target selection remains bounded to one destination/target selection domain per operation profile/macro contract.
2. LimOp cannot accompany SA.
3. Non-LimOp operation behavior remains unchanged.

## Tests

1. Existing structural/runtime LimOp tests retained.
2. Added explicit integration regression:
- `packages/engine/test/integration/fitl-limited-ops.test.ts`
- Case: rejects `actionClass: 'limitedOperation'` move when `compound.specialActivity` is provided.

## Deliverables

- Updated ticket assumptions and scope to match current architecture/tests.
- Added targeted LimOp + SA suppression regression coverage.

## Outcome

**Completion date**: 2026-02-23

**What actually changed**:
- Added one integration regression test in `packages/engine/test/integration/fitl-limited-ops.test.ts` to explicitly assert LimOp cannot be submitted with compound SA.
- No engine code or FITL data changes were required.

**Deviation from original plan**:
- Original ticket framed this as broad investigation with potential profile gaps; in current repo, those gaps were already closed, so scope narrowed to explicit invariant hardening via test.

**Verification results**:
- `pnpm -F @ludoforge/engine test` passed.
- `pnpm -F @ludoforge/engine lint` passed.
