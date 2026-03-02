# SEATRES-020: Deduplicate piece-seat reference diagnostics across scenario loops

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator cross-asset seat reference diagnostic emission
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Validator seat-reference checks currently run per scenario reference and include piece-catalog seat fields in that loop. When multiple scenarios reference the same `(pieceCatalogAssetId, seatCatalogAssetId)` pair, identical diagnostics for the same piece-catalog path are emitted repeatedly, creating noisy/non-minimal diagnostics.

## Assumption Reassessment (2026-03-02)

1. **Confirmed**: `validateDataAssets()` currently calls `collectInvalidSeatReferences()` inside a per-scenario loop and includes optional `pieceCatalog` seat checks in the same call.
2. **Confirmed**: `pieceCatalog.payload.pieceTypes[*].seat` and `pieceCatalog.payload.inventory[*].seat` paths are asset-scoped (not scenario-scoped), so repeated scenarios that select the same `(pieceCatalogAssetId, seatCatalogAssetId)` pair duplicate identical diagnostics.
3. **Corrected**: since `SEATRES-012`, `collectInvalidSeatReferences()` is shared across validator/compiler paths; this ticket targets validator emission policy in `validate-extensions.ts` only.
4. **Confirmed**: `validate-spec-scenario` tests currently assert seat-reference errors exist, but do not assert deduplication behavior across multiple scenario assets sharing the same pair.

## Architecture Check

1. Emitting scenario seat diagnostics per scenario while emitting piece-catalog diagnostics once per unique `(pieceCatalogAssetId, seatCatalogAssetId)` pair is cleaner than duplicating piece checks inside each scenario iteration.
2. This preserves game-agnostic architecture: only cross-asset validation emission policy changes; no game-specific logic is introduced.
3. This is stricter/minimal diagnostics behavior and introduces no compatibility aliasing or fallback.

## What to Change

### 1. Separate scenario-seat and piece-seat validation emission paths

1. Keep scenario seat-field validation per scenario (`initialPlacements`/`outOfPlay`/`seatPools`).
2. Validate piece-catalog seat fields once per unique `(pieceCatalogAssetId, seatCatalogAssetId)` pair.
3. Keep using the shared `collectInvalidSeatReferences()` helper; adjust caller orchestration instead of adding a second seat-validation implementation.

### 2. Preserve deterministic diagnostics and alternatives

1. Keep existing paths/messages/suggestions stable.
2. Ensure no duplicate diagnostics are emitted for identical path/code combinations.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Compiler seat-catalog selection behavior
- Runtime seat-resolution behavior
- Diagnostic code taxonomy changes

## Acceptance Criteria

### Tests That Must Pass

1. Multiple scenarios sharing the same piece/seat-catalog pair emit each piece-catalog seat-missing diagnostic once.
2. Scenario seat-field diagnostics remain per-scenario as appropriate.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator diagnostics remain deterministic and path-precise.
2. Seat-catalog remains the canonical seat source for cross-asset seat references.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add multi-scenario shared-piece-catalog case asserting no duplicate piece-catalog seat diagnostics.  
Rationale: locks deterministic non-duplicated validator output.
2. `packages/engine/test/unit/validate-spec-scenario.test.ts` — keep per-scenario seat-field checks asserting scenario-level emissions still occur.  
Rationale: preserves intended scenario-path coverage.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
  - Updated `validateDataAssets()` in `packages/engine/src/cnl/validate-extensions.ts` to deduplicate piece-catalog seat diagnostics by unique `(pieceCatalogAssetId, seatCatalogAssetId)` pair while preserving per-scenario scenario-seat diagnostics.
  - Implemented pair deduplication using structured maps (`seatCatalogId -> pieceCatalogId set`) to avoid delimiter-collision risk from string-concatenated compound keys.
  - Preserved the shared `collectInvalidSeatReferences()` helper usage and adjusted only call orchestration (no duplicated seat-validation logic introduced).
  - Added a unit regression in `packages/engine/test/unit/validate-spec-scenario.test.ts` that creates two scenarios sharing one piece/seat-catalog pair and asserts each invalid piece seat path emits exactly one diagnostic.
- **Deviations From Original Plan**:
  - None. Implemented exactly within the ticket scope (`validate-extensions.ts` + `validate-spec-scenario.test.ts`).
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
