# 119EVESIDEFF-003: Thread manifest through apply-move and turn-flow-eligibility

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel move application and turn-flow eligibility
**Deps**: `tickets/119EVESIDEFF-002.md`

## Problem

`apply-move.ts` manually threads `deferredEventEffect` from `executeEventMove` to `applyTurnFlowEligibilityAfterMove` via optional properties and conditional spreads. `turn-flow-eligibility.ts` re-resolves the event card to extract grants and overrides independently. After ticket 002, `executeEventMove` returns a manifest — this ticket updates both consumers to use it.

## Assumption Reassessment (2026-04-08)

1. `apply-move.ts` threads `deferredEventEffect` at lines 1288-1290 (conditional spread) and line 1439 (passed to `applyTurnFlowEligibilityAfterMove`) — confirmed.
2. `applyTurnFlowEligibilityAfterMove` signature at `turn-flow-eligibility.ts:891-899` accepts `deferredEventEffect?: TurnFlowDeferredEventEffectPayload` as 4th parameter — confirmed.
3. `extractPendingFreeOperationGrants` (line 336) calls `resolveEventFreeOperationGrants` at line 353 — confirmed.
4. `extractPendingEligibilityOverrides` (line 262) calls `resolveEventEligibilityOverrides` at line 271 — confirmed.
5. `turn-flow-eligibility.ts` imports `resolveEventEligibilityOverrides` and `resolveEventFreeOperationGrants` from `./event-execution.js` at lines 3-7 — confirmed.

## Architecture Check

1. Threading the manifest instead of the bare deferred effect eliminates the implicit protocol between modules. The typed contract makes the data flow explicit and type-safe.
2. Game-agnostic — `EventSideEffectManifest` contains generic types, no game-specific logic.
3. No backwards compatibility — the old `deferredEventEffect` parameter is replaced atomically, not aliased.

## What to Change

### 1. Update `apply-move.ts` to thread the manifest

Replace the `deferredEventEffect` conditional spread (lines 1288-1290) with manifest threading. Where the code currently does:

```typescript
...(lastingActivation.deferredEventEffect === undefined
  ? {}
  : { deferredEventEffect: lastingActivation.deferredEventEffect }),
```

Replace with threading `lastingActivation.sideEffectManifest` through to `applyTurnFlowEligibilityAfterMove`.

At line 1439, change:

```typescript
applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move, executed.deferredEventEffect, ...)
```

to:

```typescript
applyTurnFlowEligibilityAfterMove(def, executed.stateWithRng, move, executed.sideEffectManifest, ...)
```

Search for any other references to `deferredEventEffect` in `apply-move.ts` and update them similarly.

### 2. Update `applyTurnFlowEligibilityAfterMove` signature

Change the 4th parameter from:

```typescript
deferredEventEffect?: TurnFlowDeferredEventEffectPayload
```

to:

```typescript
sideEffectManifest?: EventSideEffectManifest
```

Add the `EventSideEffectManifest` import from `./types-events.js` (or the barrel).

### 3. Update `extractPendingFreeOperationGrants` to receive grants from manifest

Instead of calling `resolveEventFreeOperationGrants(def, state, move)` internally, receive the grants array as a parameter. Pass `manifest?.grants ?? []` from the caller.

### 4. Update `extractPendingEligibilityOverrides` to receive overrides from manifest

Instead of calling `resolveEventEligibilityOverrides(def, state, move)` internally, receive the overrides array as a parameter. Pass `manifest?.overrides ?? []` from the caller.

### 5. Update deferred effect consumption

Where `turn-flow-eligibility.ts` currently uses the `deferredEventEffect` parameter, change to `sideEffectManifest?.deferredEventEffect`.

### 6. Remove unused imports

Remove the `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` imports from `turn-flow-eligibility.ts` (lines 3-7). The `resolveBoundaryDurationsAtTurnEnd` import on the same line should be kept if still used.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)

## Out of Scope

- Removing `resolveEventFreeOperationGrants`/`resolveEventEligibilityOverrides` exports from `event-execution.ts` — that is ticket 004
- Modifying test files — that is ticket 004

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — no type errors from changed signatures
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes (~114 event test files produce identical results)
3. `pnpm turbo lint` passes

### Invariants

1. `applyTurnFlowEligibilityAfterMove` no longer calls into `event-execution.ts` resolve functions — it receives all data via the manifest
2. `apply-move.ts` no longer threads bare `deferredEventEffect` — only the manifest
3. The same grants, overrides, and deferred effects are applied as before — behavioral equivalence
4. No mutation — manifest is passed as a readonly value

## Test Plan

### New/Modified Tests

1. No new tests required — this is an internal refactor. The existing ~114 event test files validate behavioral equivalence.

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety across packages
3. `pnpm turbo lint` — no new lint violations
