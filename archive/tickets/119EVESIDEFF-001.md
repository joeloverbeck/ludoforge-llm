# 119EVESIDEFF-001: Add EventSideEffectManifest and EventMoveExecutionResult types

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel type definitions
**Deps**: `specs/119-event-side-effect-manifest.md`

## Problem

Event side-effects (grants, overrides, deferred effects) lack a single typed container. The manifest type is the prerequisite for all subsequent refactoring — it defines the contract between `executeEventMove` and `applyTurnFlowEligibilityAfterMove`.

## Assumption Reassessment (2026-04-08)

1. `EventFreeOperationGrantDef` exists in `packages/engine/src/kernel/types-events.ts` (line 37) — confirmed.
2. `EventEligibilityOverrideDef` exists in `packages/engine/src/kernel/types-events.ts` (line 58) — confirmed.
3. `TurnFlowDeferredEventEffectPayload` exists in `packages/engine/src/kernel/types-turn-flow.ts` (line 219), re-exported via barrel `types.ts` — confirmed.
4. `LastingEffectApplyResult` is an internal (non-exported) interface in `event-execution.ts` (line 34) — confirmed. It will be replaced by `EventMoveExecutionResult` in ticket 002.
5. No existing type named `EventSideEffectManifest` or `EventMoveExecutionResult` in the codebase — confirmed.

## Architecture Check

1. Introducing a readonly value type that bundles existing typed fields is the minimal change to establish the contract. No alternative is simpler.
2. The manifest is game-agnostic — it references generic grant/override/deferred-effect types, not game-specific structures.
3. No backwards-compatibility shims. These are new types added alongside existing ones; the old `LastingEffectApplyResult` is replaced atomically in ticket 002.

## What to Change

### 1. Add `EventSideEffectManifest` to `types-events.ts`

Add the following exported interface after the existing `EventEligibilityOverrideDef` definition:

```typescript
export interface EventSideEffectManifest {
  /** Free operation grants declared by the event card side + branch. */
  readonly grants: readonly EventFreeOperationGrantDef[];
  /** Eligibility overrides declared by the event card side + branch, post-condition-filter. */
  readonly overrides: readonly EventEligibilityOverrideDef[];
  /** Deferred effect payload when effectTiming is 'afterGrants'. Undefined if effects execute immediately.
   *  Defined in types-turn-flow.ts (re-exported via barrel types.ts). */
  readonly deferredEventEffect?: TurnFlowDeferredEventEffectPayload;
}
```

Import `TurnFlowDeferredEventEffectPayload` from the appropriate barrel path if not already imported.

### 2. Add `EventMoveExecutionResult` to `event-execution.ts`

Add the following internal interface (not exported — it's the return type of `executeEventMove` which is already exported):

```typescript
interface EventMoveExecutionResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
  readonly sideEffectManifest: EventSideEffectManifest;
}
```

Do NOT yet change the return type of `executeEventMove` — that is ticket 002. This ticket only adds the type definitions.

### 3. Re-export `EventSideEffectManifest` from kernel barrel

Ensure `EventSideEffectManifest` is re-exported from the kernel's barrel export file (`packages/engine/src/kernel/index.ts` or equivalent) so downstream consumers can import it.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify — re-export)

## Out of Scope

- Modifying `executeEventMove` return type or behavior — that is ticket 002
- Modifying `applyTurnFlowEligibilityAfterMove` — that is ticket 003
- Removing any existing types or exports

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes with the new types added
2. `pnpm turbo lint` passes with no new violations
3. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions (pure type additions)

### Invariants

1. `EventSideEffectManifest` is fully readonly — all fields use `readonly` modifier
2. No existing type signatures are modified in this ticket
3. `EventMoveExecutionResult` is NOT exported — it is internal to `event-execution.ts`

## Test Plan

### New/Modified Tests

1. No new tests required — this is a pure type addition with no behavioral changes

### Commands

1. `pnpm turbo typecheck` — verify new types compile
2. `pnpm -F @ludoforge/engine test` — verify no regressions
3. `pnpm turbo lint` — verify no new lint violations

## Outcome

- Completed: 2026-04-08
- Changed:
  - Added `EventSideEffectManifest` to `packages/engine/src/kernel/types-events.ts`
  - Added the internal `EventMoveExecutionResult` interface to `packages/engine/src/kernel/event-execution.ts`
  - Kept `LastingEffectApplyResult` behavior and return shape unchanged for the later manifest-threading tickets
- Deviations from original plan:
  - No direct edit to `packages/engine/src/kernel/index.ts` was needed because the new exported type already flowed through the existing `types-events.ts` -> `types.ts` -> `index.ts` barrel chain
  - `LastingEffectApplyResult` was rewritten to extend `Omit<EventMoveExecutionResult, 'sideEffectManifest'>` so the new internal interface is live without changing behavior in ticket 001
- Verification:
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test`
