# REACTUI-022: Async Interleaving Regression Suite for Runner Store

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-019
**Estimated complexity**: M

---

## Summary

Add a dedicated regression suite that stress-tests async interleavings in store actions and guards against future race-condition regressions.

---

## What Needs to Change

- Create `packages/runner/test/store/game-store-async-interleaving.test.ts` with deterministic deferred-promise bridge stubs.
- Cover high-risk interleavings:
  - `initGame(A)` starts, `initGame(B)` starts, A resolves last.
  - `selectAction` resolves after `cancelMove`.
  - `chooseOne/chooseN` resolves after newer action selection.
  - `confirmMove` resolves after `undo` or re-init.
  - stale reject arrives after newer success.
- Ensure tests assert final state only reflects latest valid intent.

---

## Out of Scope

- UI event wiring tests.
- Performance benchmarks.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/store/game-store-async-interleaving.test.ts` (new)
  - includes at least 6 race/interleaving scenarios.
  - all scenarios deterministic (no timers-as-race gambling).
- `packages/runner/test/store/game-store.test.ts`
  - baseline behavior remains green.

### Invariants

- Store behavior is deterministic under async interleavings.
- Stale async completions cannot mutate current canonical state.
- Regression suite is isolated, readable, and reusable for future async actions.

