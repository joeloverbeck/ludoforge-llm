# KERQUERY-007: Harden tokenZones cache validity invariants and state-transition coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query/runtime correctness guards
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/effects-token.ts, packages/engine/test/unit/eval-query.test.ts, packages/engine/test/unit/apply-move.test.ts

## Problem

Current tests cover `tokenZones` semantics and same-state cache reuse, but do not explicitly lock cache correctness across state transitions. If a future code path mutates token placement in place, token-zone cache reuse could become stale and produce incorrect zone results.

## Assumption Reassessment (2026-03-04)

1. State transitions in kernel effects typically produce new state/zone containers via immutable updates.
2. `tokenZones` cache correctness depends on this invariant being preserved over time.
3. No active ticket in `tickets/*` currently enforces cache-validity invariants across state transitions (`KERQUERY-004`/`KERQUERY-005` do not cover this runtime correctness area).

## Architecture Check

1. Explicitly testing cache invalidation/transition behavior is cleaner than relying on implicit immutability assumptions.
2. This hardening is fully game-agnostic and applies to generic `GameDef`/runtime semantics only.
3. No backward-compat aliases or shims; this codifies canonical invariants and fails fast on regressions.

## What to Change

### 1. Add transition-focused tokenZones cache correctness tests

1. Add tests proving that when token location changes with a new state object, `tokenZones` reflects new zone results.
2. Add tests ensuring no stale zone mapping is reused after state transition.

### 2. Add invariant guard coverage for immutable token-placement updates

1. Strengthen tests around token-moving state transitions to assert new zone container/object identity is produced where required.
2. Ensure this invariant is checked in generic kernel test suites, not game fixtures.

### 3. Optional defensive runtime guard (if architecture deems necessary)

1. Consider a lightweight cache validity guard keyed by state version/hash when available.
2. Keep guard generic and internal to kernel runtime.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify if needed)
- `packages/engine/src/kernel/apply-move.ts` (modify if needed)
- `packages/engine/src/kernel/effects-token.ts` (modify if needed)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)

## Out of Scope

- Query transform contract registry redesign (`KERQUERY-005`)
- Downstream query contract consumer coverage (`KERQUERY-004`)
- Game-specific scenario/spec/visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. `tokenZones` returns updated zones after token movement across state transitions (no stale cache reuse).
2. State-transition tests assert immutable update guarantees needed for cache correctness.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache validity cannot depend on undocumented mutable state behavior.
2. Kernel/runtime correctness remains game-agnostic and independent of `GameSpecDoc` game-specific content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — add state-transition cache invalidation coverage for `tokenZones`.
2. `packages/engine/test/unit/apply-move.test.ts` — assert immutable token-placement transition properties required by cache safety.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/apply-move.test.js`
3. `pnpm -F @ludoforge/engine test`
