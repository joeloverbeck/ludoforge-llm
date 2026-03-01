# SEATRES-012: Enforce seatCatalog references across piece/scenario payload seat fields

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - validator/compiler cross-reference validation paths
**Deps**: archive/tickets/SEATRES-006-introduce-seat-catalog-contract-and-decouple-seat-identity.md

## Problem

Seat identity ownership was moved to `seatCatalog`, but seat-bearing payload fields in selected `pieceCatalog` and `scenario` assets are still only partially validated. Today we enforce internal piece/scenario invariants (for example pieceType/inventory seat consistency and scenario pieceType-seat consistency), but we do not enforce that those seat ids belong to the selected canonical seat set.

## Assumption Reassessment (2026-03-01)

1. **Corrected**: `pieceCatalog` still declares seat fields (`pieceTypes[*].seat`, `inventory[*].seat`) and validates internal consistency; it is not seat-less.
2. `turnFlow`/event/victory seat references already cross-validate against canonical compiler seat targets, but `pieceCatalog` and `scenario` seat-bearing payload fields are not yet validated against selected `seatCatalog` ids.
3. `validate-spec-scenario` tests currently cover space/piece mismatch/conservation checks, but not canonical `seatCatalog` membership checks for piece/scenario seat fields.
4. This remains outside active tickets `SEATRES-013+` (selector ambiguity and later seat-resolution lifecycle/runtime contracts).

## Architecture Reassessment

1. Adding one reusable seat-reference validator used by both validator and compiler paths is cleaner than duplicating ad hoc checks.
2. This strengthens the single source-of-truth contract: `seatCatalog` defines legal seat ids; piece/scenario payloads are consumers only.
3. This is stricter and intentional: no fallback/alias behavior; invalid seat ids fail fast with deterministic diagnostics.

## Updated Scope

### In Scope

1. Validate `pieceCatalog.payload.pieceTypes[*].seat` and `pieceCatalog.payload.inventory[*].seat` against selected `seatCatalog` ids.
2. Validate scenario seat-bearing fields against selected `seatCatalog` ids, specifically:
   - `payload.initialPlacements[*].seat`
   - `payload.outOfPlay[*].seat`
   - `payload.seatPools[*].seat`
3. Use a shared helper so validator and compiler paths apply identical seat-reference policy and deterministic alternatives.

### Out of Scope

- Runtime seat resolution performance/lifecycle work.
- Selector strictness work.
- Visual config changes.
- Changing `pieceCatalog` schema ownership of piece/inventory seat fields.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/` (add shared seat-reference helper)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)

## Acceptance Criteria

### Tests That Must Pass

1. Any seat id in targeted piece/scenario payload fields outside selected `seatCatalog` fails with deterministic diagnostics (path + alternatives when available).
2. Valid seat ids in those fields compile/validate without regression.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `seatCatalog` remains the sole seat identity source of truth.
2. Piece/scenario seat-bearing payload fields are validated against selected canonical seat ids when a seat catalog is selected.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` - add invalid canonical-seat references in scenario fields (`initialPlacements`, `outOfPlay`, `seatPools`) and a valid control.
Rationale: enforces validator-path canonical seat references.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` - add compile-path canonical seat-reference rejection for piece/scenario fields and valid control.
Rationale: confirms end-to-end compiler parity, not just validator behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Added shared seat-reference validation helper at `packages/engine/src/cnl/seat-reference-validation.ts`.
  - Wired canonical seat-reference checks into validator data-asset flow (`validate-extensions.ts`) for:
    - `pieceCatalog.payload.pieceTypes[*].seat`
    - `pieceCatalog.payload.inventory[*].seat`
    - `scenario.payload.initialPlacements[*].seat`
    - `scenario.payload.outOfPlay[*].seat`
    - `scenario.payload.seatPools[*].seat`
  - Wired the same shared checks into compiler data-asset derivation (`compile-data-assets.ts`) so compiler and validator enforce the same seat contract.
  - Refined scenario cross-reference validation contracts to use typed payloads (`ScenarioPayload` / `MapPayload` / `PieceCatalogPayload`) in `validate-zones.ts`, and removed unsafe record-casts from `validate-extensions.ts`.
  - Simplified extraction logic in `validate-zones.ts` to operate on validated typed payloads, improving contract clarity and maintainability.
  - Added regression tests in:
    - `packages/engine/test/unit/validate-spec-scenario.test.ts`
    - `packages/engine/test/unit/compiler-structured-results.test.ts`
  - Added a validator regression ensuring one diagnostic is emitted per invalid `initialPlacements` entry path (no duplicated traversal side effects).
- **Deviations From Original Plan**:
  - Dropped `packages/engine/test/unit/data-assets.test.ts` changes because canonical seat-reference behavior is exercised where scenario-driven seat-catalog selection happens (validator/compile scenario flows), which is the authoritative contract boundary.
  - Did not modify `packages/engine/src/kernel/piece-catalog.ts`; enforcement is intentionally centralized in CNL cross-asset validation to keep schema-level payload validation generic and non-scenario-specific.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test --force` passed.
