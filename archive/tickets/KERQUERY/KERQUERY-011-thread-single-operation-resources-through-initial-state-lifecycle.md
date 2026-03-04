# KERQUERY-011: Thread single operation resources through initial-state lifecycle

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — initial-state and lifecycle runtime resource threading
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, archive/tickets/KERQUERY/KERQUERY-010-eliminate-dual-resource-inputs-in-trigger-dispatch.md, packages/engine/src/kernel/initial-state.ts, packages/engine/src/kernel/phase-lifecycle.ts

## Problem

`initialState` creates operation resources for setup effects, but lifecycle dispatch (`turnStart`, `phaseEnter`) currently creates fresh runtime resources per call. This weakens explicit operation boundaries and loses legitimate same-operation cache reuse opportunities during bootstrap.

## Assumption Reassessment (2026-03-04)

1. Operation-scoped resources are now canonical across eval/effect context construction.
2. `initialState` currently creates one `EvalRuntimeResources` for setup effects, but calls `dispatchLifecycleEvent` with only a collector, so each lifecycle call creates a fresh query cache.
3. `dispatchLifecycleEvent` currently owns resource construction internally via `createEvalRuntimeResources({ collector })`, which hides operation boundaries and prevents explicit end-to-end bootstrap reuse.
4. The ticket’s referenced test file `packages/engine/test/unit/phase-lifecycle.test.ts` does not exist; lifecycle dispatch coverage currently lives indirectly via other unit paths (for example `trigger-dispatch` and `initial-state` tests).
5. `dispatchLifecycleEvent` currently clones state on return even when no lifecycle/trigger changes occur, which defeats cross-call query-cache reuse keyed by state identity.
6. No active ticket currently hardens bootstrap lifecycle as one explicit operation-resource boundary.

## Architecture Check

1. Treating bootstrap as one operation with one resources object is cleaner and improves consistency with move execution semantics.
2. Lifecycle dispatch should accept canonical `EvalRuntimeResources` directly (not collector-only inputs), so operation ownership is explicit and query-cache reuse is deterministic.
3. This remains kernel/runtime agnostic infrastructure; no game-specific rules leak into generic layers.
4. No compatibility shims: lifecycle APIs should move directly to canonical resource threading.

## What to Change

### 1. Thread one resources object through bootstrap lifecycle

1. Update `dispatchLifecycleEvent` to accept operation resources (`EvalRuntimeResources`) as the canonical runtime input.
2. Ensure `initialState` passes one resources object from setup effects through lifecycle dispatch calls.
3. Ensure lifecycle internal trigger dispatch uses the same object.
4. Preserve state identity when lifecycle dispatch produces no state/rng changes so same-operation cache reuse remains possible across sequential lifecycle calls.

### 2. Remove incidental per-call resource construction in bootstrap path

1. Delete now-redundant local resource creation where operation resources are already provided by the caller.
2. Keep default creation only at explicit operation boundaries.

### 3. Add lifecycle bootstrap resource-threading tests

1. Add tests proving setup + lifecycle phases share one collector/query cache during `initialState` execution.
2. Add focused lifecycle unit coverage for “use provided resources identity” so the dispatch contract is explicit.
3. Preserve existing lifecycle semantics and traces.

## Files to Touch

- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify for lifecycle API alignment)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify for lifecycle API alignment)
- `packages/engine/src/kernel/boundary-expiry.ts` (modify for lifecycle API alignment)
- `packages/engine/src/kernel/apply-move.ts` (modify for boundary-expiry API alignment)
- `packages/engine/test/unit/initial-state.test.ts` (modify/add)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (add)
- `packages/engine/test/unit/boundary-expiry.test.ts` (modify for canonical runtime resources input)

## Out of Scope

- Query cache internal API encapsulation (`KERQUERY-009`)
- Broad lifecycle behavior changes unrelated to resource threading
- Game-specific setup/event logic

## Acceptance Criteria

### Tests That Must Pass

1. `initialState` bootstrap executes under one explicit operation-resources object across setup + lifecycle dispatch.
2. Lifecycle and trigger outputs remain deterministic and unchanged semantically.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Operation resource boundaries are explicit and deterministic.
2. GameDef/runtime remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/initial-state.test.ts` — verify end-to-end bootstrap resource threading.
2. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — verify lifecycle dispatch reuses provided resources.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/initial-state.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Refactored `dispatchLifecycleEvent` to accept canonical `EvalRuntimeResources` instead of collector-only ownership.
  - Threaded one shared runtime resources object through `initialState` setup + bootstrap lifecycle dispatch (`turnStart`, `phaseEnter`).
  - Aligned lifecycle-adjacent call sites (`phase-advance`, `effects-turn-flow`, `boundary-expiry`, `apply-move`) to the canonical runtime-resources contract.
  - Added lifecycle identity preservation when dispatch produces no state/rng changes, enabling cross-call query-cache reuse for unchanged state objects.
  - Added targeted lifecycle resource-threading unit coverage and bootstrap trace coverage.
- **Deviations From Original Plan**:
  - Added a small `dispatchLifecycleEvent` identity-preservation optimization because unconditional state cloning prevented the intended query-cache reuse even with shared resources.
  - Updated `boundary-expiry` and `apply-move` to align with the canonical resource contract; these files were not in the original narrow scope but were required for clean API consistency.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/initial-state.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js packages/engine/dist/test/unit/boundary-expiry.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
