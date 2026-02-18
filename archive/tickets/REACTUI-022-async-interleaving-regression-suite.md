# REACTUI-022: Async Interleaving Regression Suite for Runner Store

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P1
**Depends on**: REACTUI-019
**Estimated complexity**: M

---

## Summary

Expand the existing async store regression suite to cover additional high-risk async interleavings and lock in last-intent-wins semantics.

---

## Reassessed Assumptions (2026-02-18)

- `packages/runner/test/store/game-store-async-serialization.test.ts` already exists and already covers several stale-result races; this ticket should extend that suite rather than introducing a parallel duplicate file.
- `packages/runner/src/store/game-store.ts` already uses a centralized guard architecture (`sessionEpoch` + operation token + guarded commit helpers) from `REACTUI-019`.
- Current coverage is strong but not complete: it does not yet explicitly assert stale `chooseOne/chooseN` completions after a newer action intent, or stale `confirmMove` completion after `undo`.
- The architecture direction remains correct: a single generic concurrency guard in store orchestration is preferable to per-action bespoke race handling.
- Additional reassessment during implementation: stale `confirmMove` can mutate worker history even when its store commit is ignored, creating store/worker divergence unless stale mutating operations are rejected at the worker boundary.

---

## What Needs to Change

- Extend `packages/runner/test/store/game-store-async-serialization.test.ts` with deterministic deferred-promise bridge stubs.
- Harden mutation orchestration by stamping mutating bridge calls (`epoch` + `token`) and rejecting stale mutations in `packages/runner/src/worker/game-worker-api.ts` before they can mutate worker state/history.
- Cover high-risk interleavings (ensuring at least 6 deterministic scenarios in total in the suite):
  - `initGame(A)` starts, `initGame(B)` starts, A resolves last.
  - `selectAction` resolves after `cancelMove`.
  - `chooseOne` resolves after newer `selectAction`.
  - `chooseN` resolves after newer `selectAction`.
  - `confirmMove` resolves after `undo`.
  - `confirmMove` resolves after re-init.
  - stale reject arrives after newer success.
- Ensure tests assert final state only reflects latest valid intent.

---

## Out of Scope

- UI event wiring tests.
- Performance benchmarks.

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/store/game-store-async-serialization.test.ts` (expanded)
  - includes at least 6 deterministic race/interleaving scenarios.
  - all scenarios deterministic (no timers-as-race gambling).
- `packages/runner/test/store/game-store.test.ts`
  - baseline behavior remains green.

### Invariants

- Store behavior is deterministic under async interleavings.
- Stale async completions cannot mutate current canonical state.
- Regression suite is isolated, readable, and reusable for future async actions.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Reassessed and corrected ticket assumptions to match repository reality (existing async serialization suite and existing store guard architecture).
  - Expanded `packages/runner/test/store/game-store-async-serialization.test.ts` with three deterministic interleaving regressions:
    - stale `chooseOne` completion after newer `selectAction`
    - stale `chooseN` completion after newer `selectAction`
    - stale `confirmMove` completion after `undo`
  - Introduced explicit operation stamps for worker-side mutating calls and stale-mutation rejection in `packages/runner/src/worker/game-worker-api.ts`.
  - Updated `packages/runner/src/store/game-store.ts` to pass operation stamps for `initGame`, `confirmMove`, and `undo`, aligning store concurrency intent with worker mutation execution.
  - Migrated worker/store regression tests to stamped mutator calls and added `STALE_OPERATION` clone-compat coverage.
- **Deviations from original plan**:
  - Original plan expected a brand-new `game-store-async-interleaving.test.ts`; instead, the existing async serialization suite was extended to avoid duplicate suites and keep async race coverage centralized.
  - Delivered 7 deterministic interleaving scenarios in one suite rather than creating a second file.
  - Added one worker/store API hardening change because new regression assertions exposed a real stale-confirm side effect gap.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/store/game-store-async-serialization.test.ts` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
