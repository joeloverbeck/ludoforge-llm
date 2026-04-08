# 119EVESIDEFF-002: Populate manifest in executeEventMove and update return type

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel event execution
**Deps**: `archive/tickets/119EVESIDEFF-001.md`

## Problem

`executeEventMove` currently returns `LastingEffectApplyResult` with a bare `deferredEventEffect?` field. It must be changed to return `EventMoveExecutionResult` with a fully populated `sideEffectManifest` containing grants, overrides (post-condition-filter), and the deferred effect payload. This is the core computation change — all side-effects are collected once instead of being re-derived downstream.

## Assumption Reassessment (2026-04-08)

1. `executeEventMove` is defined at `event-execution.ts:533-541`, returns `LastingEffectApplyResult` — confirmed.
2. `LastingEffectApplyResult` is internal (non-exported) at line 34-39, with fields `{ state, rng, emittedEvents, deferredEventEffect? }` — confirmed.
3. `collectFreeOperationGrants(context)` exists at line 49-58 — confirmed. Takes `EventExecutionContext`, returns `readonly EventFreeOperationGrantDef[]`.
4. `collectEligibilityOverrides(context)` exists at line 60-69 — confirmed. Takes `EventExecutionContext`, returns `readonly EventEligibilityOverrideDef[]`.
5. `evaluateEligibilityOverrideCondition(def, state, move, override)` exists at line 71+ — confirmed. Used by `resolveEventEligibilityOverrides` (line 645-647) to filter overrides. Must be applied when populating `manifest.overrides`.
6. `resolvePlayableEventExecutionContext` is called within `executeEventMove` at line 542 — confirmed. The resolved context is available for populating the manifest without an additional call.

## Architecture Check

1. Reusing existing internal helpers (`collectFreeOperationGrants`, `collectEligibilityOverrides`, `evaluateEligibilityOverrideCondition`) avoids code duplication. The manifest is built from the same context already resolved in `executeEventMove`.
2. Game-agnostic — the manifest bundles generic typed fields, no game-specific logic.
3. `LastingEffectApplyResult` is replaced atomically by `EventMoveExecutionResult` — no compatibility shim. All internal callers within `event-execution.ts` that reference the old type are updated in this ticket.

## What to Change

### 1. Replace `LastingEffectApplyResult` with `EventMoveExecutionResult`

In `event-execution.ts`, remove the `LastingEffectApplyResult` interface definition (lines 34-39). The `EventMoveExecutionResult` type was added in ticket 001.

### 2. Update `executeEventMove` to build and return the manifest

After resolving the event context (line 542) and executing effects, build the manifest:

```typescript
const grants = context !== null ? collectFreeOperationGrants(context) : [];
const overrides = context !== null
  ? collectEligibilityOverrides(context).filter((override) =>
      evaluateEligibilityOverrideCondition(def, state, move, override)
    )
  : [];

const sideEffectManifest: EventSideEffectManifest = {
  grants,
  overrides,
  ...(deferredEventEffect === undefined ? {} : { deferredEventEffect }),
};
```

Return `{ state, rng, emittedEvents, sideEffectManifest }` instead of `{ state, rng, emittedEvents, deferredEventEffect }`.

Note: The `state` used for `evaluateEligibilityOverrideCondition` must be the post-effect-execution state (after lasting effects are applied), matching the current behavior of `resolveEventEligibilityOverrides` which receives the state at the time `turn-flow-eligibility` runs — which is also post-effect-execution. Verify this matches.

### 3. Update internal callers of the old return shape

Search `event-execution.ts` for any internal references to `.deferredEventEffect` on the result of `executeEventMove` or helper functions that return `LastingEffectApplyResult`. Update them to use `.sideEffectManifest.deferredEventEffect`.

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify)

## Out of Scope

- Modifying `apply-move.ts` — that is ticket 003
- Modifying `applyTurnFlowEligibilityAfterMove` — that is ticket 003
- Removing `resolveEventFreeOperationGrants`/`resolveEventEligibilityOverrides` exports — that is ticket 004

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — `executeEventMove` return type is `EventMoveExecutionResult`
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes (callers in `apply-move.ts` will temporarily access `.sideEffectManifest.deferredEventEffect` instead of `.deferredEventEffect`, but this may require ticket 003 to be applied in the same build pass)
3. `pnpm turbo lint` passes

### Invariants

1. `executeEventMove` produces the same grants, overrides, and deferred effects as the current `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` functions would — the manifest is semantically equivalent
2. `manifest.overrides` contains post-condition-filter results (not raw overrides)
3. No mutation — the manifest is a readonly value type
4. `LastingEffectApplyResult` no longer exists in the codebase

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/event-execution-manifest.test.ts` (new) — verify `executeEventMove` produces a manifest with expected structure for a representative event card (one with grants, overrides, and deferred effects)

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety
