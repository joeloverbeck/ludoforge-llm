# 119EVESIDEFF-002: Populate manifest in executeEventMove and update return type

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel event execution, apply-move threading, turn-flow eligibility
**Deps**: `archive/tickets/119EVESIDEFF-001.md`

## Problem

`executeEventMove` currently returns `LastingEffectApplyResult` with a bare `deferredEventEffect?` field. It must be changed to return `EventMoveExecutionResult` with a fully populated `sideEffectManifest` containing grants, overrides (post-condition-filter), and the deferred effect payload. This is the core computation change — all side-effects are collected once instead of being re-derived downstream.

## Assumption Reassessment (2026-04-09)

1. `executeEventMove` is defined at `event-execution.ts:533-541`, returns `LastingEffectApplyResult` — confirmed.
2. `LastingEffectApplyResult` is internal (non-exported) at line 34-39, with fields `{ state, rng, emittedEvents, deferredEventEffect? }` — confirmed.
3. `collectFreeOperationGrants(context)` exists at line 49-58 — confirmed. Takes `EventExecutionContext`, returns `readonly EventFreeOperationGrantDef[]`.
4. `collectEligibilityOverrides(context)` exists at line 60-69 — confirmed. Takes `EventExecutionContext`, returns `readonly EventEligibilityOverrideDef[]`.
5. `evaluateEligibilityOverrideCondition(def, state, move, override)` exists at line 71+ — confirmed. Used by `resolveEventEligibilityOverrides` (line 645-647) to filter overrides. Must be applied when populating `manifest.overrides`.
6. `resolvePlayableEventExecutionContext` is called within `executeEventMove` — confirmed. The resolved context is available for populating the manifest without an additional call.
7. `apply-move.ts` still consumes `executed.deferredEventEffect` and `turn-flow-eligibility.ts` still accepts a bare `deferredEventEffect` parameter plus re-resolves grants/overrides — confirmed.
8. Replacing `LastingEffectApplyResult` in isolation would leave the repo in a broken mid-migration state unless the minimal downstream consumer migration lands in the same change — confirmed.

## Architecture Check

1. Reusing existing internal helpers (`collectFreeOperationGrants`, `collectEligibilityOverrides`, `evaluateEligibilityOverrideCondition`) avoids code duplication. The manifest is built from the same context already resolved in `executeEventMove`.
2. Game-agnostic — the manifest bundles generic typed fields, no game-specific logic.
3. `LastingEffectApplyResult` is replaced atomically by `EventMoveExecutionResult` — no compatibility shim. Because current downstream consumers still depend on the old shape, this ticket also owns the minimal `apply-move.ts` and `turn-flow-eligibility.ts` migration required for Foundations 14 atomicity.

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

### 3. Update downstream consumers to thread the manifest

Update `apply-move.ts` to thread `result.sideEffectManifest` instead of `result.deferredEventEffect`, and update `turn-flow-eligibility.ts` to accept `EventSideEffectManifest` as its fourth parameter.

`extractPendingFreeOperationGrants` must consume `manifest.grants` instead of calling `resolveEventFreeOperationGrants(def, state, move)`.

`extractPendingEligibilityOverrides` must consume `manifest.overrides` instead of calling `resolveEventEligibilityOverrides(def, state, move)`.

Deferred effect handling in `turn-flow-eligibility.ts` must read `sideEffectManifest?.deferredEventEffect`.

### 4. Add focused manifest assertions on the existing test surface

Extend the existing event-execution target tests so they assert the manifest shape and contents for a representative event card with grants, overrides, and deferred effects. Prefer reusing the current `packages/engine/test/unit/kernel/event-execution-targets.test.ts` ownership surface over creating a new isolated file.

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (modify)

## Out of Scope

- Removing `resolveEventFreeOperationGrants`/`resolveEventEligibilityOverrides` exports — that is ticket 004
- Migrating the dedicated public-export tests away from resolve helpers — that remains ticket 004 unless atomic fallout proves otherwise

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — `executeEventMove` return type is `EventMoveExecutionResult`
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes with `apply-move.ts` and `turn-flow-eligibility.ts` consuming the manifest
3. `pnpm turbo lint` passes

### Invariants

1. `executeEventMove` produces the same grants, overrides, and deferred effects as the current `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` functions would — the manifest is semantically equivalent
2. `manifest.overrides` contains post-condition-filter results (not raw overrides)
3. No mutation — the manifest is a readonly value type
4. `LastingEffectApplyResult` no longer exists in the codebase
5. `apply-move.ts` no longer consumes bare `.deferredEventEffect`
6. `applyTurnFlowEligibilityAfterMove` consumes `EventSideEffectManifest` rather than a bare deferred-effect parameter

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — verify `executeEventMove` produces a manifest with expected structure for a representative event card (one with grants, overrides, and deferred effects)

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety
3. `pnpm turbo lint` — no new lint violations

## Outcome

- Completed: 2026-04-09
- What changed:
  - `executeEventMove` now returns `EventMoveExecutionResult` with a populated `sideEffectManifest` on every path.
  - `LastingEffectApplyResult` was removed and the minimal downstream consumer migration landed in `apply-move.ts` and `turn-flow-eligibility.ts`.
  - Focused manifest assertions were added to `packages/engine/test/unit/kernel/event-execution-targets.test.ts`.
- Deviations from original plan:
  - During reassessment, the original ticket boundary proved too narrow to satisfy Foundations 14 atomically because live consumers still depended on the old `.deferredEventEffect` shape.
  - After user-confirmed 1-3-1 resolution on 2026-04-09, this ticket absorbed the minimal consumer migration that ticket 003 had originally staged.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `node --test dist/test/unit/kernel/event-execution-targets.test.js`
  - Passed `pnpm turbo typecheck`
  - Passed `pnpm turbo lint`
  - Passed `pnpm -F @ludoforge/engine test`
  - Passed `pnpm run check:ticket-deps`
