# 63GRAARRAUT-007: Migrate legal-moves.ts and free-operation-viability.ts to use createProbeOverlay

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/legal-moves.ts, kernel/free-operation-viability.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

`legal-moves.ts` and `free-operation-viability.ts` both construct temporary probe overlays of the grants array by directly filtering/mapping/concatenating the array. This duplicates the probe overlay logic that the authority module now provides via `createProbeOverlay`.

## Assumption Reassessment (2026-04-08)

1. `legal-moves.ts` filters the grants array at lines 653 and 1058 during legal-move enumeration — confirmed.
2. `free-operation-viability.ts` constructs probe overlay state with modified `pendingFreeOperationGrants` at lines 829 and 848 — confirmed.
3. `createProbeOverlay` will be available from `grant-lifecycle.ts` after ticket 001 — prerequisite.

## Architecture Check

1. Centralizing probe overlay construction ensures consistent overlay behavior across both enumeration paths.
2. `createProbeOverlay` is a simple concatenation — probe callers continue to discard the overlay after enumeration.
3. No game-specific logic introduced (Foundation 1). No backwards-compatibility shims (Foundation 14).

## What to Change

### 1. Migrate `legal-moves.ts` probe overlays

At lines 653 and 1058, replace the direct `.filter()` calls that construct temporary probe grant arrays with `createProbeOverlay()` from `grant-lifecycle.ts`. The filter logic determines which grants to include — construct the probe grants array from the filter result, then pass to `createProbeOverlay`.

### 2. Migrate `free-operation-viability.ts` probe overlays

At line 829, replace the direct construction of `pendingFreeOperationGrants: authorizedPendingProbeGrants` with a `createProbeOverlay` call. At line 848, replace the `.map()` that transforms grants for the probe state with appropriate array-level operations.

### 3. Import cleanup

Add import for `createProbeOverlay` from `grant-lifecycle.ts` in both files. Remove any imports that are no longer needed after the migration.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)

## Out of Scope

- Changing legal-move enumeration logic
- Changing viability analysis logic
- Changing which grants are included in probe overlays (selection criteria unchanged)
- Modifying other caller modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. Neither `legal-moves.ts` nor `free-operation-viability.ts` directly constructs probe overlay grants arrays

### Invariants

1. Legal-move enumeration produces identical results (same legal moves, same order)
2. Viability analysis produces identical results
3. Probe overlays are transient — never persisted to committed state
4. No direct `pendingFreeOperationGrants` array construction remains in either file for probe purposes

## Test Plan

### New/Modified Tests

None — existing tests cover legal-move enumeration and viability analysis. Correctness is verified by the full suite passing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Implemented the probe-overlay migration in the two owned caller modules and added one narrow authority helper needed to preserve the live exploration contract.

- `packages/engine/src/kernel/legal-moves.ts` now uses `createProbeOverlay()` for both ready-grant scoped probe states instead of directly rebuilding `pendingFreeOperationGrants` with `filter(...)`.
- `packages/engine/src/kernel/free-operation-viability.ts` now uses `createProbeOverlay()` for the authorization probe overlays. The exploration-only `zoneFilter` stripping path moved into a new authority helper, `stripZoneFilterFromProbeGrant()`, in `packages/engine/src/kernel/grant-lifecycle.ts`.
- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` now includes a focused proof test for `stripZoneFilterFromProbeGrant()` to lock down the non-mutating exploration rewrite.

This was a small deviation from the ticket's literal mechanism: `createProbeOverlay()` alone was not sufficient for the `free-operation-viability.ts` exploration path because that path also rewrites the probe grant payload by removing `zoneFilter`. Centralizing that rewrite in a narrow authority helper preserved the live behavior without leaving a caller-local special case behind.

Verification run:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

Result: passed (`474` tests passed). `schema:artifacts:check` ran as part of the engine test command and remained in sync; no generated artifact changes were needed.
