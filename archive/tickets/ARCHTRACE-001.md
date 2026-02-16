# ARCHTRACE-001: Fix Trace Parity Across Turn-Order Modes

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel trace propagation bugfix
**Deps**: None

## Reassessed Assumptions (Code/Test Reality Check)

Validated against current `src/kernel` and `test/`:

- The ticket's original assumption is only partially current.
- Collector propagation is already present for:
1. Direct action execution path (`applyMoveCore` -> `executeMoveAction` effect contexts).
2. Trigger dispatch and trigger cascades (`dispatchTriggers` runtime collector propagation).
3. Core non-simultaneous auto-advance (`applyMoveCore` -> `advanceToDecisionPoint(..., policy, collector)`).
- Remaining discrepancy:
1. Simultaneous post-commit auto-advance in `applySimultaneousSubmission` still calls `advanceToDecisionPoint(def, resetState, lifecycleAndAdvanceLog)` without passing `policy`/collector, so lifecycle trace entries can be dropped from returned `effectTrace`.
- Existing tests currently cover simultaneous submission/commit ordering, but do not assert lifecycle/effect trace parity across turn-order strategies.

## What Needs To Change / Be Implemented

`applyMove` must emit equivalent lifecycle/effect tracing regardless of turn-order strategy for equivalent execution flows.

Current confirmed gap:
- In simultaneous mode, the post-commit `advanceToDecisionPoint` path does not receive the move execution collector/policy, so `effectTrace` can miss lifecycle traces.

Required implementation:
1. In `src/kernel/apply-move.ts`, create one move execution policy+collector in `applySimultaneousSubmission` and pass both into the final post-commit `advanceToDecisionPoint` call.
2. Keep behavior/API unchanged except corrected trace capture (no aliasing/back-compat shims).
3. Add regression tests in `test/unit/apply-move.test.ts`:
- simultaneous commit with `trace: true` includes lifecycle `effectTrace` entries emitted during auto-advance.
- round-robin and simultaneous expose equivalent lifecycle trace categories for a matched scripted flow.
4. Run relevant unit tests plus regression suite(s) to confirm no behavior drift.

## Invariants That Should Pass

1. `trace: true` must capture lifecycle transitions in all turn-order modes.
2. For equivalent execution flows, no lifecycle trace class is missing solely due to turn-order mode.
3. `trace: false` behavior remains unchanged.
4. Determinism and state hash behavior remain unchanged.

## Tests That Should Pass

1. New unit test: simultaneous-mode `applyMove` with auto-advance includes `lifecycleEvent` entries in `effectTrace`.
2. New unit test: round-robin and simultaneous produce equivalent lifecycle trace categories for matched scripted flow.
3. Regression: existing apply-move and phase-advance unit suites still pass.
4. Regression: existing broader test targets selected for this change pass (document exact commands in Outcome when completed).

## Outcome

- Completion date: 2026-02-16
- What actually changed:
1. `src/kernel/apply-move.ts`: simultaneous post-commit auto-advance now passes an execution collector into `advanceToDecisionPoint(...)`.
2. `src/kernel/apply-move.ts`: lifecycle auto-advance trace entries are merged into simultaneous `effectTrace`, and lifecycle warnings are merged into the return warnings list.
3. `src/kernel/apply-move.ts`: centralized move-execution runtime wiring (`collector`, transition-budget validation, and `executionPolicy`) so `applyMoveCore` and simultaneous auto-advance use one canonical construction path.
4. `src/kernel/apply-move.ts`: simultaneous path now validates `maxPhaseTransitionsPerMove` consistently, even before commit completion.
5. `src/kernel/apply-move.ts`: simultaneous commit fan-in now reuses one shared execution runtime (collector + policy + budget) across all committed submissions and the final auto-advance step.
6. `test/unit/apply-move.test.ts`: added two lifecycle trace regression tests, one simultaneous-mode option-validation regression test, and one shared-budget fan-in regression test.
- Deviations from original plan:
1. Extended beyond the initial surgical fix to remove duplicated execution-runtime setup in `apply-move`, reducing future parity drift risk.
- Verification results:
1. `npm run build && node dist/test/unit/apply-move.test.js` passed.
2. `npm run lint` passed.
3. `npm run test:all` passed.
