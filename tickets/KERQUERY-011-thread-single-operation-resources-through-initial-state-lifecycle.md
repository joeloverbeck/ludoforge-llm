# KERQUERY-011: Thread single operation resources through initial-state lifecycle

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — initial-state and lifecycle runtime resource threading
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, tickets/KERQUERY-010-eliminate-dual-resource-inputs-in-trigger-dispatch.md, packages/engine/src/kernel/initial-state.ts, packages/engine/src/kernel/phase-lifecycle.ts

## Problem

`initialState` creates operation resources for setup effects, but lifecycle dispatch (`turnStart`, `phaseEnter`) currently creates fresh runtime resources per call. This weakens explicit operation boundaries and loses legitimate same-operation cache reuse opportunities during bootstrap.

## Assumption Reassessment (2026-03-04)

1. Operation-scoped resources are now canonical across eval/effect context construction.
2. Initial-state bootstrap still spans multiple lifecycle calls that do not explicitly share one resources object end-to-end.
3. No active ticket currently hardens bootstrap lifecycle as one explicit operation-resource boundary.

## Architecture Check

1. Treating bootstrap as one operation with one resources object is cleaner and improves consistency with move execution semantics.
2. This remains kernel/runtime agnostic infrastructure; no game-specific rules leak into generic layers.
3. No compatibility shims: lifecycle APIs should move directly to canonical resource threading.

## What to Change

### 1. Thread one resources object through bootstrap lifecycle

1. Update `dispatchLifecycleEvent` to accept operation resources.
2. Ensure `initialState` passes one resources object from setup effects through lifecycle dispatch calls.
3. Ensure lifecycle internal trigger dispatch uses the same object.

### 2. Remove incidental per-call resource construction in bootstrap path

1. Delete now-redundant local resource creation where operation resources are already provided.
2. Keep default creation only at explicit operation boundaries.

### 3. Add lifecycle bootstrap resource-threading tests

1. Add tests proving setup + lifecycle phases share one collector/query cache during `initialState` execution.
2. Preserve existing lifecycle semantics and traces.

## Files to Touch

- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify if required by API alignment)
- `packages/engine/test/unit/initial-state.test.ts` (modify/add)
- `packages/engine/test/unit/phase-lifecycle.test.ts` (modify/add)

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
2. `packages/engine/test/unit/phase-lifecycle.test.ts` — verify lifecycle dispatch reuses provided resources.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/initial-state.test.js packages/engine/dist/test/unit/phase-lifecycle.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
