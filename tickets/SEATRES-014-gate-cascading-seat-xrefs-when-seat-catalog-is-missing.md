# SEATRES-014: Gate cascading seat xref diagnostics when seatCatalog is missing

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cross-validate diagnostic gating
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

When card-driven turn flow is declared without a resolved `seatCatalog`, compiler emits the root-cause missing-seat-catalog diagnostic and then also emits many downstream seat-missing xref diagnostics. This adds noise and obscures the primary failure.

## Assumption Reassessment (2026-03-01)

1. Compiler emits `CNL_COMPILER_SEAT_CATALOG_REQUIRED` for card-driven docs without canonical seat identity.
2. Cross-validation still runs seat-dependent checks (`eligibility.seats`, `passRewards[*].seat`, event seat refs), producing cascading seat-missing diagnostics in the same failure path.
3. Active `SEATRES-008` covers incoherent-contract gating, but not the specific missing-seat-catalog root-cause path introduced by `SEATRES-006`.

## Architecture Check

1. Root-cause-first diagnostics are cleaner and easier to act on than cascades derived from absent prerequisites.
2. Gating only seat-dependent diagnostics preserves unrelated validation signal (actions/zones/windows/vars).
3. Change is generic and game-agnostic; no game-specific behavior is encoded.

## What to Change

### 1. Add seat-dependent diagnostic gating for missing seat catalog

1. Detect missing canonical seat reference set in cross-validate seat-dependent branches.
2. Skip seat-missing xrefs when root cause (`seatCatalog` required/selection failure) is already present.
3. Preserve non-seat cross-validation checks unchanged.

### 2. Add deterministic parity tests

1. Verify root-cause diagnostic is retained.
2. Verify seat-xref cascades are suppressed in missing-seat-catalog mode.
3. Verify non-seat diagnostics still emit.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
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
