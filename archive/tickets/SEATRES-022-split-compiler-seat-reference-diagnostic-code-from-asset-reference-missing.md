# SEATRES-022: Split compiler seat-reference diagnostics from asset-reference diagnostics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler diagnostic taxonomy for seat-reference failures
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Compiler currently emits seat-reference failures under `CNL_COMPILER_DATA_ASSET_REF_MISSING`, which is also used for missing asset-id references. This mixes two distinct failure domains and weakens observability/tooling clarity.

## Assumption Reassessment (2026-03-01)

1. `CNL_COMPILER_DATA_ASSET_REF_MISSING` is currently emitted for scenario `map/pieceCatalog/seatCatalog` id misses.
2. Seat-id misses in piece/scenario payload seat fields now also emit `CNL_COMPILER_DATA_ASSET_REF_MISSING`.
3. `compiler-structured-results.test.ts` currently asserts `CNL_COMPILER_DATA_ASSET_REF_MISSING` for both seat-id misses and asset-id misses, so taxonomy is intentionally coupled in tests today.
4. Tickets `SEATRES-013` through `SEATRES-019` are no longer active in `tickets/`; this ticket must stand alone and should not assume dependency on active seat-resolution taxonomy work.

## Architecture Check

1. Domain-specific diagnostic codes are cleaner and more extensible for CI/tooling/UX than overloaded generic codes.
2. This change is fully game-agnostic and concerns compiler contract semantics only.
3. No backward-compat aliasing: seat-reference failures should emit their own canonical code.

## What to Change

### 1. Introduce dedicated compiler code for canonical seat-reference misses

1. Add a new compiler diagnostic code for seat-reference missing (for example, `CNL_COMPILER_SEAT_REF_MISSING`).
2. Emit the new code for seat-id reference failures in piece/scenario payload fields.

### 2. Keep asset-reference diagnostics scoped to asset-id lookup failures

1. Continue using `CNL_COMPILER_DATA_ASSET_REF_MISSING` only for missing `mapAssetId` / `pieceCatalogAssetId` / `seatCatalogAssetId` references.
2. Update affected tests to assert separated code domains.

### 3. Architectural guardrails for long-term extensibility

1. Keep failure-domain ownership explicit:
`compile-data-assets.ts` emits seat-reference diagnostics with the seat-specific code, while id-based asset lookup continues using data-asset-ref code.
2. Do not introduce compatibility aliases or dual-emission.
3. Keep validator taxonomy unchanged (out of scope) to avoid cross-surface coupling in this ticket.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify/add)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify/add if required by registry checks)

## Out of Scope

- Validator diagnostic taxonomy
- Seat-catalog selection policy changes
- Runtime error contract changes

## Acceptance Criteria

### Tests That Must Pass

1. Seat-reference failures emit dedicated seat-reference compiler code.
2. Asset-id lookup failures continue emitting `CNL_COMPILER_DATA_ASSET_REF_MISSING`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic codes are domain-specific and deterministic.
2. Canonical seat-reference enforcement remains unchanged; only taxonomy/reporting is refined.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert dedicated code for seat-reference misses and existing code for asset-id misses.  
Rationale: protects diagnostic-domain separation.
2. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — include new diagnostic code in registry expectations if required.  
Rationale: keeps diagnostic inventory synchronized.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-02
- **What changed**:
  - Added compiler diagnostic code `CNL_COMPILER_SEAT_REF_MISSING`.
  - Updated `compile-data-assets.ts` to emit `CNL_COMPILER_SEAT_REF_MISSING` for canonical seat-id reference misses in piece/scenario payload fields.
  - Kept `CNL_COMPILER_DATA_ASSET_REF_MISSING` scoped to missing `mapAssetId` / `pieceCatalogAssetId` / `seatCatalogAssetId` lookups.
  - Updated unit tests to enforce diagnostic-domain split and prevent regression back to overloaded taxonomy.
  - Updated this ticket’s assumptions/scope to reflect current repository state before implementation.
- **Deviations from original plan**:
  - No registry-audit test code change was required; the existing audit remains valid with the new constant added to the canonical registry file.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
