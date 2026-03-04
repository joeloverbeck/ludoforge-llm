# KERQUERY-008: Introduce operation-scoped eval resources and shared query-cache threading

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime context construction, apply/legality/preflight query evaluation surfaces
**Deps**: archive/tickets/KERQUERY/KERQUERY-006-query-runtime-cache-owned-by-evalcontext.md, archive/tickets/KERQUERY/KERQUERY-007-tokenzones-cache-validity-invariants-and-transition-coverage.md, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/action-applicability-preflight.ts, packages/engine/src/kernel/action-actor.ts, packages/engine/src/kernel/action-executor.ts, packages/engine/src/kernel/legal-moves.ts, packages/engine/src/kernel/trigger-dispatch.ts

## Problem

`createEvalContext()` currently defaults to creating a fresh `queryRuntimeCache` each time. This preserves isolation but misses legitimate intra-operation reuse where multiple eval contexts are part of one runtime operation (for example actor/executor/preflight/pipeline checks during one apply/legality pass), causing repeated token-zone index rebuilding.

## Assumption Reassessment (2026-03-04)

1. `KERQUERY-006` already moved token-zone caching into `EvalContext` ownership and removed module-global singleton cache.
2. `KERQUERY-007` already locks cache transition validity invariants and includes coverage for shared-cache state transition behavior.
3. Existing tests already cover:
   - repeated `tokenZones` evaluation reuse inside one eval context,
   - non-reuse across independent eval contexts,
   - stale-cache prevention across state transitions when a cache is intentionally shared.
4. Apply runtime already threads a shared execution collector in parts of the flow; query-cache threading is still mostly incidental/per-context and not operation-scoped by contract.
5. Current call paths still create multiple eval contexts inside one logical operation (notably preflight + selector resolution + pipeline checks + recursive trigger checks) without a first-class shared eval-resource object.

## Architecture Check

1. A first-class operation-scoped eval resources object (collector + query cache) is cleaner than ad hoc per-call context defaults and enables explicit deterministic reuse boundaries.
2. This stays fully game-agnostic in kernel runtime infrastructure; no GameSpecDoc/game-specific branching is introduced.
3. Canonical constructors/call paths should move to operation resources directly (no compatibility aliases in runtime entrypoints touched by this ticket).

## What to Change

### 1. Define operation-scoped eval resources contract

1. Introduce runtime resource object (for example `EvalRuntimeResources`) that owns:
   - execution collector
   - query runtime cache
2. Add canonical constructors/helpers for:
   - creating new operation resources
   - creating `EvalContext` from operation resources

### 2. Thread resources across same-operation eval call paths

1. Update apply/preflight/actor/executor/legal-moves/trigger-dispatch call paths so related sub-evaluations share one operation resource instance.
2. Preserve isolation between independent operations by creating a fresh resource object per operation boundary.

### 3. Codify operation resource threading semantics in tests

1. Extend `eval-context` tests to verify operation-resource construction and context derivation semantics.
2. Extend/add integration-adjacent unit tests in preflight/legal/apply paths to verify same-operation context construction shares cache and independent operations do not.
3. Keep existing cache-validity tests from `KERQUERY-007`; avoid duplicating already-covered semantics.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/action-actor.ts` (modify)
- `packages/engine/src/kernel/action-executor.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify only if required by threading boundary)
- `packages/engine/test/unit/eval-context.test.ts` (modify/add)
- `packages/engine/test/unit/eval-query.test.ts` (modify only if needed for new operation-resource coverage)
- `packages/engine/test/unit/action-applicability-preflight.test.ts` (modify/add if missing)
- `packages/engine/test/unit/apply-move.test.ts` and/or `packages/engine/test/unit/legal-moves.test.ts` (modify/add targeted threading regressions)

## Out of Scope

- State-transition cache invalidation policy and immutable-update guards (`KERQUERY-007`)
- Query-cache API encapsulation boundary work (`KERQUERY-009`)
- Game-specific rules, scenarios, map logic, or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Contexts created from one operation resource share query cache and collector consistently across same-operation sub-evaluations.
2. Contexts from different operation resources do not share query cache.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Cache reuse boundaries are explicit and operation-scoped, not incidental.
2. Runtime/GameDef remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-context.test.ts` — verify operation resource construction and `createEvalContext` derivation contracts.
2. `packages/engine/test/unit/action-applicability-preflight.test.ts` (or nearest focused unit) — verify actor/executor/evalCtx in one preflight share operation resources.
3. `packages/engine/test/unit/legal-moves.test.ts` and/or `packages/engine/test/unit/apply-move.test.ts` — verify same-operation threading and operation-boundary isolation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/action-applicability-preflight.test.js packages/engine/dist/test/unit/legal-moves.test.js packages/engine/dist/test/unit/apply-move.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-04
- **What Changed**:
  - Added `EvalRuntimeResources` in `eval-context.ts` and made `createEvalContext` derive `collector` and `queryRuntimeCache` from operation-scoped resources.
  - Threaded shared eval runtime resources through same-operation kernel call paths:
    - `apply-move.ts` (validation + execution preflight, pipeline resolution, trigger dispatch chain)
    - `action-applicability-preflight.ts`
    - `action-actor.ts`
    - `action-executor.ts`
    - `legal-moves.ts`
    - `trigger-dispatch.ts`
  - Updated direct `createEvalContext` call sites that previously passed ad hoc collector/cache inputs to use runtime resources.
  - Added/updated tests to lock operation-scoped resource contracts and cache reuse behavior.
- **Deviations From Original Plan**:
  - Added focused coverage in `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` for explicit resource threading; this was not in the original narrow test list but was required to verify preflight path behavior directly.
  - `event-execution.ts` was only minimally touched for constructor contract alignment; no additional event-path threading changes were required.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js packages/engine/dist/test/unit/trigger-dispatch.test.js packages/engine/dist/test/unit/legal-moves.test.js packages/engine/dist/test/unit/apply-move.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
