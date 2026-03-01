# SEATRES-012: Enforce seatCatalog references across piece/scenario payload seat fields

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator/compiler cross-reference validation paths
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

Seat identity ownership was moved to `seatCatalog`, but several seat-bearing payload fields are not yet validated against the selected canonical seat set. This can allow incoherent seat ids in piece/scenario payloads to pass compile-time validation.

## Assumption Reassessment (2026-03-01)

1. `pieceCatalog` no longer declares seats and now validates only internal piece/inventory consistency.
2. `turnFlow` and event-related seat references are cross-validated against compiler seat targets, but scenario/piece payload seat fields are not fully covered by a single canonical seat-reference pass.
3. This gap is not covered by active tickets `SEATRES-007` through `SEATRES-011`, which focus on contract-mode tests, selector strictness, runtime fallback removal, and index lifecycle optimization.

## Architecture Check

1. A single seat-reference validation layer for seat-bearing payload fields is cleaner than fragmented checks and prevents contract drift.
2. This preserves boundaries: game-specific seat usage remains in `GameSpecDoc` data, while compiler/runtime remain generic contract consumers.
3. No aliasing/fallback compatibility paths are introduced; invalid seat ids fail fast.

## What to Change

### 1. Add canonical seat-reference validation for piece/scenario payload seat fields

1. Validate `pieceCatalog.payload.pieceTypes[*].seat` and `pieceCatalog.payload.inventory[*].seat` against selected `seatCatalog` ids.
2. Validate scenario seat-bearing fields (for example `initialPlacements[*].seat`, `outOfPlay[*].seat`, `seatPools[*].seat`) against selected `seatCatalog` ids.
3. Emit deterministic diagnostics with precise paths and alternatives.

### 2. Centralize seat-reference checks

1. Introduce/extend a reusable validator helper for seat-id references so all relevant compile/validate entry points use the same policy.
2. Keep diagnostics game-agnostic and schema-driven (no game-specific branching).

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/kernel/piece-catalog.ts` (modify only if canonical-seat hooks are wired there)
- `packages/engine/test/unit/data-assets.test.ts` (modify/add)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)

## Out of Scope

- Runtime seat resolution performance work
- Numeric selector strictness work
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Any seat id in piece/scenario payload fields outside selected `seatCatalog` fails with deterministic diagnostics.
2. Valid seat ids in those fields compile/validate without regression.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `seatCatalog` remains the sole seat identity source of truth.
2. All seat-bearing payload references are validated against the selected canonical seat set.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add invalid-seat references across scenario seat fields.  
Rationale: enforces canonical-seat references in scenario payloads.
2. `packages/engine/test/unit/data-assets.test.ts` — add piece catalog seat-reference mismatch tests vs selected seat catalog.  
Rationale: prevents piece/scenario seat-domain drift.
3. `packages/engine/test/unit/compiler-structured-results.test.ts` — compile-path parity for canonical-seat failures/successes.  
Rationale: confirms end-to-end compiler behavior, not just isolated validators.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/data-assets.test.js`
4. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
