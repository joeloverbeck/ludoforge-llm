# 152SIMLOOPRIM-003: Migrate `diagnose-spec-143-heap.mjs` to consume `runGameSteps`

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — campaign tooling only
**Deps**: `archive/tickets/152SIMLOOPRIM-001.md`

## Problem

After 152SIMLOOPRIM-001 and `archive/tickets/152SIMLOOPRIM-002.md` land, the heap-profiling diagnostic `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs:535` is the last verified custom full-simulation-loop site outside `runGameSteps`. Spec 152's F5 invariant — that no consumer drives `runGame`-style iteration manually — is not achievable until this script also consumes the canonical primitive.

This ticket replaces the script's `while (true)` body with a `for (const step of runGameSteps({...}))` consumer while preserving its periodic snapshot/sample emissions.

## Assumption Reassessment (2026-05-02)

1. The diagnostic script at `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs:535` has a `while (true)` calling `advanceAutoresolvable`, `terminalResult`, `publishMicroturn` (with `isNoBridgeableMicroturnError` rollback handling), and `applyPublishedDecisionFromCanonicalState`. Loop shape is verified to match the simulator's pre-refactor body.
2. The script imports kernel/sim primitives from compiled `dist/` (per the campaign-tooling pattern in this repo) — no source-side build dependency.
3. The script has periodic-snapshot emissions: `if (SNAPSHOT_EVERY_DECISIONS > 0 && totalDecisionCount > 0 && totalDecisionCount % SNAPSHOT_EVERY_DECISIONS === 0)` triggers `takeSnapshot('decision-${totalDecisionCount}')`. The migration must preserve this cadence.
4. `runGameSteps` from 001 yields `auto`/`player`/`recovery`/`terminal` steps and exposes the same kernel-call surface (auto-resolution, microturn publish, apply, lifecycle-stall, terminal) — the script's per-step instrumentation hooks all map cleanly to step boundaries.
5. The script's `totalDecisionCount` accumulator increments by `autoResult.autoResolvedLogs.length` on auto-resolution and by `+1` on each player decision — same accounting as `runVerifiedGameWithDiagnostics`.
6. `diagnose-nolegalmoves.mjs` (sibling diagnostic in `campaigns/fitl-arvn-agent-evolution/`) calls `runGame` directly and does NOT have a custom loop — explicitly out of scope.

## Architecture Check

1. **F5 (One Rules Protocol, Many Clients)**: removes the last residual full-simulation-loop site outside `runGameSteps`; the spec's invariant is achievable.
2. **Periodic snapshot emissions preserved**: cadence checks happen post-step-yield, reading `decisionCount` and `step.kind`. The cadence count is unchanged because step-emitted decision counts match the pre-migration accounting.
3. **F8 (Determinism)**: campaign script's deterministic seeding behavior is preserved — `runGameSteps` is deterministic given deterministic inputs.
4. **No backwards-compat shim**: campaign script is internal tooling; the change is local to one file.

## What to Change

### 1. Replace the `while (true)` body (starting at `diagnose-spec-143-heap.mjs:535`) with a `for (const step of runGameSteps(...))` consumer

Build the input from the script's existing seed/def/agent setup; pass through any kernel options the script currently sets.

Accumulate `totalDecisionCount` per step kind:

```js
for (const step of runGameSteps(input)) {
  if (step.kind === 'auto') {
    totalDecisionCount += step.autoResolvedLogs.length;
  } else if (step.kind === 'player') {
    totalDecisionCount += 1;
  }
  // periodic snapshot check fires after each step that updates decisionCount
  if (SNAPSHOT_EVERY_DECISIONS > 0 && totalDecisionCount > 0 && totalDecisionCount % SNAPSHOT_EVERY_DECISIONS === 0) {
    const snapshotPath = takeSnapshot(`decision-${totalDecisionCount}`);
    periodicSnapshots.push({ decisionCount: totalDecisionCount, reason, snapshotPath });
  }
  if (step.kind === 'terminal' || step.kind === 'maxTurns' || step.kind === 'noLegalMoves') {
    stopReason = step.stopReason;
    state = step.state;
    terminal = step.kind === 'terminal' ? step.result : null;
    break;
  }
}
```

### 2. Preserve final-summary reporting

The post-loop reporting block (`stopReason`, `state.stateHash`, `state.turnCount`, periodic-snapshot summary) is unchanged. Only the loop body changes.

### 3. Drop the manual probe-hole / no-bridgeable rollback handling

Once the script consumes `runGameSteps`, the generator owns rollback semantics — the script no longer needs to call `isNoBridgeableMicroturnError` or run its own rollback. Remove the manual try/catch around `publishMicroturn` and let the generator emit `recovery` steps that the script can ignore (or count, if useful for diagnostic context).

## Files to Touch

- `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` (modify)

## Out of Scope

- Other campaign diagnostics (`diagnose-nolegalmoves.mjs` already calls `runGame` directly; not a target).
- Changes to engine source — campaign-tooling-only diff.
- Changes to the heap-snapshot output format or filenames.
- Performance regressions are acceptable for a heap diagnostic; functional parity is the bar.

## Acceptance Criteria

### Tests That Must Pass

1. **Manual**: running `node campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs <args>` produces the same final summary (`stopReason`, `finalStateHash`, `turnCount`, total decisionCount) as before the migration for an identical (def, seed, maxTurns) input. Capture a pre-migration baseline summary first.
2. **Manual**: periodic snapshots are still emitted at the configured `SNAPSHOT_EVERY_DECISIONS` cadence with the same `decision-N` filenames.
3. Existing engine suite stays green: `pnpm -F @ludoforge/engine test`.
4. Existing suite: `pnpm turbo lint typecheck`.

### Invariants

1. `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` does not contain its own `while (true)` simulation loop (a `grep -n 'while (true)' <file>` returns zero matches after the migration).
2. Snapshot emission cadence preserved — same trigger condition, same filename pattern.
3. `totalDecisionCount` derives only from `runGameSteps`-yielded steps.

## Test Plan

### New/Modified Tests

None — campaign script has no automated test harness.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. **Pre-migration baseline**: `node campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed=<seed> --max-turns=<n> > baseline.txt` (run on `main` before checkout)
3. **Post-migration verify**: `node campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed=<same-seed> --max-turns=<same-n> > after.txt`; `diff baseline.txt after.txt` should show only timing/heap-byte differences, not summary differences.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`
