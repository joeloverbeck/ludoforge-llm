# Spec 119: Event Side-Effect Manifest

**Status**: COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: None
**Estimated effort**: 2-3 days
**Source**: `reports/architectural-abstractions-2026-04-08-fitl-events.md` — Candidate Abstraction #1

## Overview

When an event card is played, its side-effects (free operation grants, eligibility overrides, lasting effects, deferred effect payloads) are currently resolved at two independent points:

1. **`event-execution.ts`** resolves the event context and executes effects, producing lasting effects and deferred payloads.
2. **`turn-flow-eligibility.ts`** independently re-resolves the same event card from the same move to extract grants and overrides — calling back into `resolveEventFreeOperationGrants()` and `resolveEventEligibilityOverrides()`.

The `deferredEventEffect` payload is manually threaded through `apply-move.ts` between the two modules.

This spec introduces an **`EventSideEffectManifest`** — a single typed value produced once by `event-execution.ts` containing all event side-effects. `turn-flow-eligibility.ts` consumes this manifest instead of re-deriving grants and overrides. `apply-move.ts` threads the manifest instead of the bare `deferredEventEffect`.

## Problem Statement

### Current Data Flow

```
apply-move.ts
  ├── calls executeEventMove(def, state, rng, move)
  │     └── returns { state, rng, emittedEvents, deferredEventEffect? }
  │           (resolves event context internally, executes effects, creates lasting effects)
  │
  └── calls applyTurnFlowEligibilityAfterMove(def, state, move, deferredEventEffect)
        ├── extractPendingFreeOperationGrants(def, state, move, ...)
        │     └── calls resolveEventFreeOperationGrants(def, state, move)  ← RE-RESOLVES event card
        └── extractPendingEligibilityOverrides(def, state, move, ...)
              └── calls resolveEventEligibilityOverrides(def, state, move) ← RE-RESOLVES event card
```

The event card is resolved from the move **three times**: once in `executeEventMove` and once each in the two `extract*` functions. All three call `resolvePlayableEventExecutionContext(def, state, move)` internally.

### Why This Is a Problem

1. **Redundant computation**: The same event context is resolved 3 times per event play. Currently safe because resolution is pure and deterministic, but fragile under future changes.
2. **Implicit protocol**: The handoff between event-execution and turn-flow-eligibility is not a typed contract — it's an implicit agreement that both modules will resolve the same event card the same way from the same move.
3. **Manual plumbing**: `deferredEventEffect` is threaded through `apply-move.ts` via optional properties and conditional spreads (lines 1288-1290, 1439). Adding a new side-effect category would require the same plumbing.
4. **Temporal coupling**: `effects-turn-flow.ts` and `turn-flow-eligibility.ts` co-change 28 times in 6 months — the highest co-change pair among exercised modules.

### Evidence

- **Signal 1 (Import analysis)**: Both `turn-flow-eligibility.ts` and `event-execution.ts` import from `resolvePlayableEventExecutionContext` and produce grants/overrides from the same event card.
- **Signal 2 (Temporal coupling)**: 28 co-change commits between `effects-turn-flow.ts` and `turn-flow-eligibility.ts` in 6 months.

## Proposed Solution

### New Type: `EventSideEffectManifest`

Location: `packages/engine/src/kernel/types-events.ts`

```typescript
export interface EventSideEffectManifest {
  /** Free operation grants declared by the event card side + branch. */
  readonly grants: readonly EventFreeOperationGrantDef[];
  /** Eligibility overrides declared by the event card side + branch, filtered by condition. */
  readonly overrides: readonly EventEligibilityOverrideDef[];
  /** Deferred effect payload when effectTiming is 'afterGrants'. Undefined if effects execute immediately.
   *  Defined in `types-turn-flow.ts` (re-exported via barrel `types.ts`). */
  readonly deferredEventEffect?: TurnFlowDeferredEventEffectPayload;
}
```

Note: Lasting effects (`ActiveLastingEffect[]`) are NOT included in the manifest. They are applied to `state.activeLastingEffects` directly within `executeEventMove` as part of the state transition. They do not need to be threaded to turn-flow-eligibility.

### Modified: `executeEventMove`

Location: `packages/engine/src/kernel/event-execution.ts`

Current return type:
```typescript
interface LastingEffectApplyResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
  readonly deferredEventEffect?: TurnFlowDeferredEventEffectPayload;
}
```

New return type:
```typescript
interface EventMoveExecutionResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
  readonly sideEffectManifest: EventSideEffectManifest;
}
```

`executeEventMove` already resolves the event context. It will additionally call `collectFreeOperationGrants()` and `collectEligibilityOverrides()` (already internal functions) to populate the manifest. The `overrides` field must contain **post-filter** results: `collectEligibilityOverrides()` output must be filtered through `evaluateEligibilityOverrideCondition()` (as `resolveEventEligibilityOverrides` currently does at line 645-647) before being placed in the manifest.

### Modified: `applyTurnFlowEligibilityAfterMove`

Location: `packages/engine/src/kernel/turn-flow-eligibility.ts`

Current signature:
```typescript
export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  deferredEventEffect?: TurnFlowDeferredEventEffectPayload,
  options?: { readonly originatingPhase?: GameState['currentPhase'] },
): TurnFlowTransitionResult
```

New signature:
```typescript
export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  sideEffectManifest?: EventSideEffectManifest,
  options?: { readonly originatingPhase?: GameState['currentPhase'] },
): TurnFlowTransitionResult
```

Internal changes:
- `extractPendingFreeOperationGrants` receives `manifest.grants` instead of calling `resolveEventFreeOperationGrants(def, state, move)`
- `extractPendingEligibilityOverrides` receives `manifest.overrides` instead of calling `resolveEventEligibilityOverrides(def, state, move)`
- Deferred effect payload comes from `manifest.deferredEventEffect` instead of a separate parameter

### Modified: `apply-move.ts`

Location: `packages/engine/src/kernel/apply-move.ts`

Replace the manual `deferredEventEffect` threading (lines 1288-1290, 1439) with manifest threading:

```typescript
// Before:
const result = executeEventMove(def, state, rng, move, ...);
// ... later ...
applyTurnFlowEligibilityAfterMove(def, state, move, result.deferredEventEffect, ...);

// After:
const result = executeEventMove(def, state, rng, move, ...);
// ... later ...
applyTurnFlowEligibilityAfterMove(def, state, move, result.sideEffectManifest, ...);
```

### Functions That Become Internal-Only

After this change, these exported functions are no longer needed by external callers:
- `resolveEventFreeOperationGrants` — called by `turn-flow-eligibility.ts` (source) and `event-execution-targets.test.ts` (test), replaced by manifest
- `resolveEventEligibilityOverrides` — called by `turn-flow-eligibility.ts` (source), `fitl-events-1968-nva.test.ts` (test), and `event-execution-targets.test.ts` (test), replaced by manifest

Remove exports and migrate the 2 test files to assert against the manifest produced by `executeEventMove` instead of calling the resolve functions directly.

## FOUNDATIONS Alignment

- **F5 (One Rules Protocol)**: Aligned — the manifest establishes a single computation point for event side-effects, consumed by all downstream modules.
- **F8 (Determinism)**: Aligned — eliminates re-derivation, removing a class of potential divergence. The manifest is computed once from deterministic inputs.
- **F11 (Immutability)**: Aligned — `EventSideEffectManifest` is a readonly value type. No mutation.
- **F14 (No Backwards Compatibility)**: Aligned — this is a clean refactor. Old signatures are replaced, not shimmed.
- **F15 (Architectural Completeness)**: Aligned — addresses a root protocol gap (implicit agreement between modules) with an explicit typed contract.

## Counter-Evidence

This approach would be wrong if:
- **Conditional coupling exists**: If `turn-flow-eligibility.ts` needs to filter or transform grants/overrides based on state that changed between `executeEventMove` and `applyTurnFlowEligibilityAfterMove` (e.g., if grant installation can fail and overrides should only apply when grants succeed). Currently no evidence of such coupling — the re-derivation appears incidental.
- **Other callers need the resolution functions**: If modules beyond `turn-flow-eligibility.ts` call `resolveEventFreeOperationGrants` or `resolveEventEligibilityOverrides`, the manifest may not cover all use cases. Verified: only `turn-flow-eligibility.ts` (source) and 2 test files call these — both test files will be migrated.

Note: `shouldDeferIncompleteDecisionValidationForMove()` (event-execution.ts:464-485) is a 4th caller of `resolvePlayableEventExecutionContext`, but it is internal to `event-execution.ts` and operates before event execution to check deferral eligibility. It does not produce side-effects and is unaffected by the manifest refactor.

## Migration Strategy

All changes are atomic per Foundation 14 (No Backwards Compatibility) — no transitional state.

1. Add `EventSideEffectManifest` type to `types-events.ts`
2. Modify `executeEventMove` to return `EventMoveExecutionResult` with `sideEffectManifest` instead of bare `deferredEventEffect`
3. Modify `applyTurnFlowEligibilityAfterMove` to accept `EventSideEffectManifest` instead of `TurnFlowDeferredEventEffectPayload`
4. Modify `apply-move.ts` to thread `result.sideEffectManifest` instead of `result.deferredEventEffect`
5. Remove `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides` exports; migrate 2 test files (`fitl-events-1968-nva.test.ts`, `event-execution-targets.test.ts`) to assert against the manifest

## Test Strategy

**No behavioral changes.** The manifest is an internal refactor — the same side-effects are produced, just computed once instead of three times. The ~114 existing event card test files in `packages/engine/test/integration/fitl-events*` should continue passing without modifications.

**Test migration required**: 2 test files directly import the resolve functions being removed:
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — imports `resolveEventEligibilityOverrides`
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — imports both `resolveEventFreeOperationGrants` and `resolveEventEligibilityOverrides`

These tests must be migrated to assert against the manifest produced by `executeEventMove` instead of calling the resolve functions directly.

### Verification

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety across packages
3. `pnpm turbo lint` — no new lint violations

### Additional Tests

Consider adding a focused unit test verifying that `executeEventMove` produces a manifest with the expected structure for a representative event card (e.g., one with grants, overrides, and deferred effects).

## Outcome

- Completed: 2026-04-09
- What changed:
  - Added `EventSideEffectManifest` as the shared event side-effect contract and introduced the internal `EventMoveExecutionResult` shape in the kernel event types and execution path.
  - Threaded the manifest through `executeEventMove`, `apply-move.ts`, and turn-flow eligibility handling so event grants, overrides, and deferred payloads are computed once and consumed from a single contract.
  - Removed the obsolete resolve-helper public surface and migrated the direct test consumers to assert against `executeEventMove(...).sideEffectManifest`.
- Deviations from original plan:
  - The implementation landed as a staged ticket series. Ticket 002 had to absorb the minimal consumer migration originally deferred to ticket 003 to preserve an atomic Foundations-aligned boundary, and ticket 003 was rewritten to own the remaining runtime cleanup before ticket 004 removed exports and test imports.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `pnpm turbo typecheck`
  - Passed `pnpm turbo lint`
  - Passed `pnpm -F @ludoforge/engine test`
  - Passed `pnpm run check:ticket-deps`
