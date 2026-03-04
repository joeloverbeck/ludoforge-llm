# KERQUERY-008: Introduce operation-scoped eval resources and shared query-cache threading

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime context construction, apply/legality/preflight query evaluation surfaces
**Deps**: archive/tickets/KERQUERY/KERQUERY-006-query-runtime-cache-owned-by-evalcontext.md, archive/tickets/KERQUERY/KERQUERY-007-tokenzones-cache-validity-invariants-and-transition-coverage.md, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/action-applicability-preflight.ts, packages/engine/src/kernel/action-actor.ts, packages/engine/src/kernel/action-executor.ts, packages/engine/src/kernel/legal-moves.ts, packages/engine/src/kernel/trigger-dispatch.ts

## Problem

`createEvalContext()` currently defaults to creating a fresh `queryRuntimeCache` each time. This is correct for isolation, but can miss legitimate intra-operation reuse where multiple eval contexts are part of one runtime operation (for example actor/executor/preflight/pipeline checks in the same move analysis pass). The result is repeated token-zone index rebuilding and avoidable runtime overhead.

## Assumption Reassessment (2026-03-04)

1. `KERQUERY-006` moved token-zone caching into `EvalContext` ownership and removed module-global singleton cache.
2. `KERQUERY-007` addresses transition-validity invariants; it does not define operation-scoped resource sharing policy.
3. Current runtime call paths still construct multiple eval contexts inside one logical operation. Without explicit shared resources, cache reuse is narrower than intended and architecture intent is underspecified.

## Architecture Check

1. A first-class operation-scoped eval resources object (collector + query cache) is cleaner than ad hoc per-call context defaults and enables deterministic reuse policy.
2. This is fully game-agnostic and remains in kernel/runtime infrastructure; no GameSpecDoc game-specific logic leaks into engine internals.
3. No backwards-compat aliases/shims: canonical constructors and call paths should migrate directly.

## What to Change

### 1. Define operation-scoped eval resources contract

1. Introduce a runtime resource object (for example `EvalRuntimeResources`) that owns:
   - execution collector
   - query runtime cache
2. Add canonical constructors for:
   - creating new operation resources
   - creating `EvalContext` from operation resources

### 2. Thread resources across same-operation eval call paths

1. Update key call paths (apply/legality/preflight/trigger/event surfaces) to share one operation resource instance across related sub-evaluations.
2. Preserve current semantics and isolation between independent operations.

### 3. Codify reuse semantics in tests

1. Add tests proving that contexts built from the same operation resources reuse token-zone cache.
2. Add tests proving independent operation resources do not share cache.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/action-actor.ts` (modify)
- `packages/engine/src/kernel/action-executor.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify if needed)
- `packages/engine/test/unit/eval-context.test.ts` (modify/add)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)

## Out of Scope

- State-transition cache invalidation policy and immutable-update guards (`KERQUERY-007`)
- Query transform contracts and downstream query consumer contracts (`KERQUERY-004` / `KERQUERY-005`)
- Game-specific rules, scenarios, map logic, or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Contexts created from one operation resource share query cache and avoid redundant token-zone index rebuilds.
2. Contexts from different operation resources do not share query cache.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Cache reuse boundaries are explicit and operation-scoped, not incidental.
2. Runtime and GameDef remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-context.test.ts` — verify operation-scoped resource construction and context derivation contracts.
2. `packages/engine/test/unit/eval-query.test.ts` — verify cache reuse across contexts sharing one operation resource and non-reuse across separate resources.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
