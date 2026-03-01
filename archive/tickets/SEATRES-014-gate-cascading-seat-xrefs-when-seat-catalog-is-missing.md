# SEATRES-014: Gate cascading seat xref diagnostics when seatCatalog is missing

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — verification + test hardening only
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

When card-driven turn flow is declared without a resolved `seatCatalog`, compiler emits the root-cause missing-seat-catalog diagnostic and then also emits many downstream seat-missing xref diagnostics. This adds noise and obscures the primary failure.

## Assumption Reassessment (2026-03-01)

1. Compiler emits `CNL_COMPILER_SEAT_CATALOG_REQUIRED` for card-driven docs without canonical seat identity.
2. `crossValidateSpec()` already gates seat-dependent checks via `seatIdentityContract.mode === 'seat-catalog'`; when mode is `none`, seat-xref cascades are suppressed.
3. Existing tests already cover core gating behavior:
`cross-validate.test.ts`:
`turn-flow eligibility seats are gated when contract mode is none`
`keeps non-seat xref checks active when contract mode is none`
`compiler-structured-results.test.ts`:
`requires seat catalog for card-driven turn flow`
4. The original ticket assumption that missing-seat-catalog cascades are currently emitted is outdated relative to repository state.

## Architecture Check

1. Root-cause-first diagnostics are cleaner and easier to act on than cascades derived from absent prerequisites.
2. Gating only seat-dependent diagnostics preserves unrelated validation signal (actions/zones/windows/vars).
3. Change is generic and game-agnostic; no game-specific behavior is encoded.

## Updated Scope

This ticket is now a verification and hardening pass, not a net-new gating implementation.

1. Confirm current gating behavior still matches intended architecture.
2. Add/strengthen deterministic tests only if a coverage gap is found.
3. Do not refactor seat-contract architecture in this ticket.

## What to Change

### 1. Keep existing seat-dependent gating architecture

1. Preserve contract-driven gating (`seatIdentityContract.mode`) as the canonical mechanism.
2. Avoid duplicate or ad-hoc suppression branches in cross-validation.
3. Keep non-seat cross-validation checks active.

### 2. Add deterministic parity tests (only where coverage is missing)

1. Verify root-cause diagnostic is retained.
2. Verify seat-xref cascades are suppressed in missing-seat-catalog mode.
3. Verify non-seat diagnostics still emit.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (no change expected)
- `packages/engine/test/unit/cross-validate.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)

## Out of Scope

- Seat-catalog schema changes
- Runtime seat-resolution behavior
- Visual config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Missing seatCatalog path emits root-cause diagnostic without seat-xref cascades.
2. Non-seat xrefs still appear in the same docs.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Root-cause diagnostics remain deterministic and primary.
2. Cross-validation signal remains high-value and non-redundant.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — add missing-seat-catalog gating cases plus non-seat parity checks.  
Rationale: verifies gating policy at cross-validator boundary.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert compile diagnostic profile for missing seat catalog remains concise.  
Rationale: enforces full compile-path behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-01
- **What actually changed**:
  - Reassessed ticket assumptions against current code/tests and corrected scope from implementation to verification/hardening.
  - Added one compile-path hardening test in `packages/engine/test/unit/compiler-structured-results.test.ts`:
    - `keeps non-seat xref diagnostics active when seat catalog is required`
- **Deviations from original plan**:
  - No `cross-validate.ts` changes were needed because seat-dependent gating was already implemented via `seatIdentityContract.mode`.
  - No new `cross-validate.test.ts` cases were required because existing coverage already validates seat-gating behavior in `none` mode.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
