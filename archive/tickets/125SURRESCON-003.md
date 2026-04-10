# 125SURRESCON-003: Rewire `policy-preview.ts` to delegate to shared resolver with pre/post wrapping

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts` (internal refactor)
**Deps**: `archive/tickets/125SURRESCON-001.md`

## Problem

`policy-preview.ts` contains its own `resolveSurface()` family dispatch chain (~100 lines) and 4 private helpers that are now duplicated in `policy-surface.ts` after ticket 001. The preview implementation interleaves visibility checks and type coercion with the family dispatch, but the family-specific value resolution is identical to runtime's. This ticket separates the preview-specific concerns (pre-dispatch visibility checks, post-dispatch type coercion) from the shared dispatch.

## Assumption Reassessment (2026-04-10)

1. `policy-preview.ts` `resolveSurface()` dispatch chain is at ~lines 152-256 — confirmed via grep at line 152.
2. The 4 private helpers are at lines 436, 456, 467, 482 — confirmed.
3. Pre-dispatch visibility/sampling checks occupy ~lines 153-178 and return `{ kind: 'unavailable' }` or `{ kind: 'unknown', reason: 'hidden' }` — these are preview-specific and stay.
4. Post-dispatch type coercion maps raw `PolicyValue` to `PolicyPreviewSurfaceResolution`: `number → { kind: 'value', value }`, `boolean → { kind: 'value', value: bool ? 1 : 0 }`, `string → { kind: 'value', value: 0 }`, `undefined → { kind: 'unavailable' }` — this coercion is preview-specific and stays.
5. `PolicyPreviewSurfaceResolution` is defined at `policy-preview.ts:91` — confirmed.

## Architecture Check

1. Clean separation of concerns: shared resolver handles family dispatch (game-agnostic), preview caller handles visibility and type coercion (presentation-layer concern) — aligns with F3 (Visual Separation) in spirit.
2. No backwards-compatibility shims — the 4 local helpers are deleted, not deprecated (F14).
3. The `globalMarker` family is handled by the shared resolver. Preview callers will never encounter `globalMarker` refs in practice; if they do, the post-dispatch coercion returns `{ kind: 'unavailable' }` for `undefined` values (no special case needed).

## What to Change

### 1. Import `resolveSurfaceRefValue` and `SurfaceResolutionContext` from `policy-surface.ts`

Add the import to `policy-preview.ts`.

### 2. Restructure `resolveSurface()` as pre-dispatch → shared call → post-dispatch

```
resolveSurface(candidate, ref, seatContext):
  1. [KEEP] Pre-dispatch: visibility checks, hidden-sampling → early return unavailable/unknown
  2. [NEW]  Call resolveSurfaceRefValue(state, ref, seatId, playerId, context) → rawValue
  3. [KEEP] Post-dispatch: coerce rawValue to PolicyPreviewSurfaceResolution
```

Replace the family if-chain (~lines 178-256) with a single call to `resolveSurfaceRefValue()`, then apply the existing type coercion logic to the raw result.

### 3. Delete the 4 now-redundant private helpers

Remove:
- `resolvePerPlayerTargetIndex()` (~line 436)
- `resolveActiveCardEntryFromState()` (~line 456)
- `resolveActiveCardFamilyValue()` (~line 467)
- `resolveSeatVarRef()` (~line 482)

### 4. Add equivalence test

Create a test that, for a representative set of refs and states, asserts that `policy-preview.ts`'s wrapped result and `policy-runtime.ts`'s direct result both produce the same underlying value. This proves the spec's core invariant: for the same `(ref, state, seatId, playerId)` tuple, both resolvers return identical values.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — replace dispatch, delete helpers, update imports)
- `packages/engine/test/integration/surface-resolution-equivalence.test.ts` (new — equivalence test between preview and runtime resolvers)

## Out of Scope

- Changing `policy-preview.ts`'s outcome classification logic (`ready`/`stochastic`/`unknown`)
- Changing `policy-runtime.ts` (ticket 002)
- Changing compiled surface ref types or the compilation pipeline
- Modifying any exported types or function signatures

## Acceptance Criteria

### Tests That Must Pass

1. All `fitl-policy-agent.test.ts` integration tests pass unchanged
2. New equivalence test passes: preview and runtime produce same underlying value for all tested refs
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. For the same `(ref, state, seatId, playerId)`, preview's unwrapped value equals runtime's return value
2. No new exported types or functions added to `policy-preview.ts`
3. The 4 deleted helpers have no remaining callers in `policy-preview.ts`
4. Pre-dispatch visibility checks and post-dispatch coercion remain in `policy-preview.ts` — not extracted

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/surface-resolution-equivalence.test.ts` — equivalence test proving preview and runtime resolvers return the same underlying value for representative refs across all families

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="surface-resolution-equivalence"`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-10
- Changed:
  - no standalone implementation was performed for this ticket
- Deviations from original plan:
  - this ticket's preview delegation work was absorbed into `125SURRESCON-001` after post-implementation review confirmed that the completed shared extraction already rewired `packages/engine/src/agents/policy-preview.ts`
  - the dedicated preview/runtime equivalence test was not added as a separate artifact because the absorbed implementation was already covered by the new shared-resolver unit test plus the existing runtime/preview package suites verified under `125SURRESCON-001`
- Verification:
  - no ticket-local commands were run under this ticket
  - the absorbed work was verified under `125SURRESCON-001` with `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, `pnpm turbo test`, and `pnpm turbo typecheck`
