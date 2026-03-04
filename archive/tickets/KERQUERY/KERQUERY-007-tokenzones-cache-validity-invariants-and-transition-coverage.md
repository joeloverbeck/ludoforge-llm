# KERQUERY-007: Harden tokenZones cache validity invariants and state-transition coverage

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query/runtime correctness guards
**Deps**: packages/engine/src/kernel/eval-query.ts, packages/engine/src/kernel/effects-token.ts, packages/engine/test/unit/eval-query.test.ts, packages/engine/test/unit/effects-token-move-draw.test.ts

## Problem

Current tests cover `tokenZones` semantics and same-state cache reuse, but do not explicitly lock cache correctness across state transitions. If a future code path mutates token placement in place, token-zone cache reuse could become stale and produce incorrect zone results.

## Assumption Reassessment (2026-03-04)

1. `tokenZones` cache is keyed by `GameState` object identity via `queryRuntimeCache.tokenZoneIndexByState: WeakMap<GameState, Map<TokenId, ZoneId>>` (`eval-context.ts`, `eval-query.ts`).
2. Existing tests cover same-state cache reuse and per-eval-context cache isolation, but do not yet lock behavior for shared-cache multi-state transitions.
3. Token-placement transitions are implemented in `effects-token.ts`; `apply-move.ts` orchestrates execution but is not the narrowest boundary for token container immutability assertions.
4. No active ticket in `tickets/*` currently enforces cache-validity invariants across state transitions (`KERQUERY-004`/`KERQUERY-005` do not cover this runtime correctness area).

## Architecture Check

1. Explicitly testing cache behavior across state transitions is cleaner than relying on implicit immutability assumptions.
2. The most robust architecture is to keep cache keys as immutable `GameState` identities and enforce immutable transition behavior in token effects.
3. A state-hash/version cache guard is not required for now: it adds runtime overhead and complexity while tests can directly enforce the invariant at lower cost.
4. This hardening is game-agnostic and applies to generic `GameDef`/runtime semantics only.

## What to Change

### 1. Add transition-focused tokenZones cache correctness tests

1. Add tests proving that when token location changes with a new state object, `tokenZones` reflects new zone results even when reusing the same `queryRuntimeCache`.
2. Add tests ensuring no stale zone mapping is reused after state transition.

### 2. Add invariant guard coverage for immutable token-placement updates

1. Strengthen tests around token-moving state transitions in `effects-token-move-draw.test.ts` to assert new state and zone container identity when token placement changes.
2. Keep invariant checks in generic kernel unit tests, not game fixtures.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify if needed)
- `packages/engine/src/kernel/effects-token.ts` (modify if needed)
- `packages/engine/test/unit/eval-query.test.ts` (modify/add)
- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify/add)

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
2. `packages/engine/test/unit/effects-token-move-draw.test.ts` — assert immutable token-placement transition properties required by cache safety.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/effects-token-move-draw.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-03-04
- **What Changed**:
  - Reassessed and corrected ticket assumptions/scope before implementation.
  - Added `eval-query` transition coverage proving `tokenZones` does not reuse stale mappings when reusing a shared `queryRuntimeCache` across different state objects.
  - Added token-effect immutability invariant tests asserting token-placement transitions return new state and zone containers.
- **Deviations From Original Plan**:
  - Replaced `apply-move` test target with `effects-token-move-draw` as the correct architectural boundary for token-placement immutability guarantees.
  - Did not add a runtime state-hash/version cache guard; tests now enforce the invariant directly with lower complexity and no runtime overhead.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/effects-token-move-draw.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (378/378).
  - `pnpm -F @ludoforge/engine lint` passed.
