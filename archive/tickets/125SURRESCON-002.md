# 125SURRESCON-002: Rewire `policy-runtime.ts` to delegate to shared resolver

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts` (internal refactor)
**Deps**: `archive/tickets/125SURRESCON-001.md`

## Problem

`policy-runtime.ts` contains its own `resolveSurface()` family dispatch chain (~90 lines) and 4 private helpers that are now duplicated in `policy-surface.ts` after ticket 001. This ticket replaces the runtime's internal dispatch with a call to the shared `resolveSurfaceRefValue()`, eliminating the duplication on the runtime side.

## Assumption Reassessment (2026-04-10)

1. `policy-runtime.ts` `resolveSurface()` dispatch chain is at ~lines 222-315 — confirmed via grep at line 222.
2. The 4 private helpers are at lines 380, 400, 412, 423 — confirmed.
3. `resolveSurface()` in runtime returns `PolicyValue` directly without wrapping — confirmed from the interface at line 65.
4. Runtime's state-hash-based caching wraps around `resolveSurface()` — the caching layer calls `resolveSurface()` internally, so replacing the dispatch body does not affect caching.
5. The preview-delegating runtime variant at line 318 (`resolveSurface(candidate, ref, seatContext)` → `previewRuntime.resolveSurface(...)`) is a separate overload for candidate-scoped resolution and is not part of the family dispatch being replaced.

## Architecture Check

1. Direct delegation to `resolveSurfaceRefValue()` preserves the runtime's existing return type (`PolicyValue`) with no wrapping or coercion needed — the shared function already returns `PolicyValue`.
2. No game-specific logic is introduced — the runtime remains an agnostic evaluation harness (F1).
3. No backwards-compatibility shims — the 4 local helpers are deleted, not deprecated (F14).

## What to Change

### 1. Import `resolveSurfaceRefValue` and `SurfaceResolutionContext` from `policy-surface.ts`

Add the import to `policy-runtime.ts`.

### 2. Replace the family dispatch body in `resolveSurface()`

Inside the `resolveSurface(ref, stateOverride, seatContext)` implementation (~line 222), replace the family if-chain (lines ~233-315) with a single call to `resolveSurfaceRefValue()`, constructing the `SurfaceResolutionContext` from the runtime's existing `input` and local variables.

### 3. Delete the 4 now-redundant private helpers

Remove:
- `resolvePerPlayerTargetIndex()` (~line 380)
- `resolveSeatVarRef()` (~line 400)
- `resolveActiveCardEntry()` (~line 412)
- `resolveActiveCardFamily()` (~line 423)

### 4. Update `PolicyValue` import if moved in ticket 001

If ticket 001 moved the `PolicyValue` type definition to `policy-surface.ts`, update `policy-runtime.ts` to import from there.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify — replace dispatch, delete helpers, update imports)

## Out of Scope

- Changing `policy-runtime.ts`'s caching strategy
- Changing the candidate-scoped `resolveSurface()` overload (line 318)
- Changing `policy-preview.ts` (ticket 003)
- Modifying any exported types or function signatures

## Acceptance Criteria

### Tests That Must Pass

1. All `fitl-policy-agent.test.ts` integration tests pass unchanged
2. All `card-surface-resolution.test.ts` tests pass unchanged (if present)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `resolveSurface()` in runtime returns identical values as before for all `(ref, state, seatId, playerId)` inputs
2. No new exported types or functions added to `policy-runtime.ts`
3. The 4 deleted helpers have no remaining callers in `policy-runtime.ts`

## Test Plan

### New/Modified Tests

1. No new tests — existing integration tests cover the runtime resolver thoroughly

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-10
- Changed:
  - no standalone implementation was performed for this ticket
- Deviations from original plan:
  - this ticket's owned runtime delegation work was absorbed into `125SURRESCON-001` after post-implementation review confirmed that the completed shared extraction already rewired `packages/engine/src/agents/policy-runtime.ts`
- Verification:
  - no ticket-local commands were run under this ticket
  - the absorbed work was verified under `125SURRESCON-001` with `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, `pnpm turbo test`, and `pnpm turbo typecheck`
