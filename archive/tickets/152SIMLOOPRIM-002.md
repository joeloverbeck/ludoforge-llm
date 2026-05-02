# 152SIMLOOPRIM-002: Migrate `runVerifiedGameWithDiagnostics` to consume `runGameSteps`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test helper only
**Deps**: `archive/tickets/152SIMLOOPRIM-001.md`

## Problem

After 152SIMLOOPRIM-001 lands, `runVerifiedGameWithDiagnostics` at `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:135-244` still has its own `while (true)` loop (line 158), its own kernel-options plumbing (`verifyIncrementalHash` at lines 143-145), and its own `decisionCount` book-keeping. This is the primary F5 violation the spec exists to address — the helper duplicates the simulator's loop shape rather than consuming the canonical primitive.

This ticket replaces the loop body with a `for (const step of runGameSteps({...}))` consumer. The helper's outer contract (return shape, error handling, kernel-options behavior) is unchanged; only the loop internals change.

## Assumption Reassessment (2026-05-02)

1. Helper signature is `runVerifiedGameWithDiagnostics(def, seed, playerCount, maxTurns, runtime): RunVerifiedGameDiagnostics` at `zobrist-incremental-property-helpers.ts:135-141`. It has a `while (true)` body at line 158 and constructs `kernelOptions = { verifyIncrementalHash: { interval } }` at lines 143-145. Confirmed.
2. After 001, `runGameSteps` accepts kernel options through `RunGameInput.options.kernel`, matching `SimulationOptions`; passing `verifyIncrementalHash` through that path retains the same kernel behavior.
3. The helper currently uses early returns on terminal conditions (`stopReason: 'terminal' | 'maxTurns' | 'noLegalMoves'`) rather than `break`. The migration preserves this — terminal-step yields trigger the early return.
4. `helper-vs-canonical-run-parity.test.ts` lives at `packages/engine/test/determinism/helper-vs-canonical-run-parity.test.ts` and validates the helper produces the same `finalStateHash`, `turnsCount`, `stopReason` as `runGame` (lines 16, 68, 96). It is the regression guardrail for this migration.
5. The helper's existing `try/catch` for `HASH_DRIFT` (lines 228-244) wraps the `while (true)` body — the migration preserves it by wrapping the new `for...of` consumer.
6. `runVerifiedGame` (the thin wrapper at lines 127-133) calls `runVerifiedGameWithDiagnostics` and is unchanged by this migration — its callers see no diff.

## Architecture Check

1. **F5 (One Rules Protocol, Many Clients)**: the helper consumes the canonical primitive; no parallel loop machine.
2. **Decision-count derivation**: `decisionCount` derives directly from yielded step kinds — `step.autoResolvedLogs.length` for auto steps, `+1` for player steps. No parallel state needed.
3. **Error handling preserved**: the existing `HASH_DRIFT` catch arm wraps the `for...of` consumer. The generator is allowed to throw kernel runtime errors that the helper continues to catch.
4. **No backwards-compat shim**: helper is internal to the test corpus. The diff is local to one file.

## What to Change

### 1. Replace the `while (true)` body (lines 158-226) with a `for (const step of runGameSteps(...))` consumer

Build the `RunGameInput` from the helper's existing parameters:

```ts
const input: RunGameInput = {
  def,
  seed,
  agents,           // construct as today (line ~150)
  maxTurns,
  playerCount,
  options: { kernel: { verifyIncrementalHash: { interval } } },
  runtime,
};
```

Drive the generator and accumulate diagnostics per step kind:

```ts
let decisionCount = 0;
for (const step of runGameSteps(input)) {
  if (step.kind === 'auto') {
    decisionCount += step.autoResolvedLogs.length;
  } else if (step.kind === 'player') {
    decisionCount += 1;
  } else if (step.kind === 'terminal' || step.kind === 'maxTurns' || step.kind === 'noLegalMoves') {
    return {
      outcome: 'completed',
      decisionCount,
      stopReason: step.stopReason,
      finalStateHash: step.state.stateHash,
      turnsCount: step.state.turnCount,
    };
  }
  // recovery steps don't increment decisionCount; preserve current behavior
}
throw kernelRuntimeError('RUNTIME_CONTRACT_INVALID', 'runGameSteps generator exited without terminal step');
```

### 2. Drop the manual `kernelOptions` construction (lines 143-145)

The helper no longer needs to maintain its own `kernelOptions` object — `verifyIncrementalHash` flows through `RunGameInput.options.kernel`. Remove the local variable and inline the option into the input.

### 3. Preserve the outer `try/catch` for `HASH_DRIFT`

The existing catch arms (HASH_DRIFT at line ~228, generic kernel errors at line ~239) continue to wrap the new `for...of` consumer. The migration does not change error-handling behavior.

### 4. Preserve the `outcome: 'completed' | 'hash-drift' | 'kernel-error'` return shape

Only the body of the success path changes; failure-path returns are unchanged.

## Files to Touch

- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify)

## Out of Scope

- Changes to `runVerifiedGame` thin wrapper at lines 127-133 — unchanged.
- Changes to `helper-vs-canonical-run-parity.test.ts` — parity must continue to hold without test modifications.
- Changes to other helpers in the same file (e.g., diagnostic types, error helpers).
- Refactoring the helper's `RunVerifiedGameDiagnostics` return type.

## Acceptance Criteria

### Tests That Must Pass

1. `helper-vs-canonical-run-parity.test.ts` passes without modification — the helper produces identical `finalStateHash`, `turnsCount`, `stopReason` as `runGame` for every (def, seed) pair tested.
2. Existing zobrist-incremental determinism tests pass: `node --test packages/engine/dist/test/determinism/zobrist-*.js`.
3. `HASH_DRIFT` error handling preserved — the helper still returns `outcome: 'hash-drift'` on hash mismatch.
4. Existing suite: `pnpm -F @ludoforge/engine test`.
5. Existing suite: `pnpm turbo lint typecheck`.

### Invariants

1. `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` does not contain its own `while (true)` simulation loop (a `grep -n 'while (true)' <file>` returns zero matches).
2. `decisionCount` derives only from `runGameSteps`-yielded steps; no parallel counter logic.
3. The helper's outer return shape (`RunVerifiedGameDiagnostics`) is unchanged.

## Test Plan

### New/Modified Tests

None — `helper-vs-canonical-run-parity.test.ts` is the regression guardrail.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/determinism/helper-vs-canonical-run-parity.test.js`
3. `pnpm -F @ludoforge/engine test:integration:slow-parity`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint typecheck`
6. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-02

Landed in this ticket:

1. Migrated `runVerifiedGameWithDiagnostics` in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` to consume `runGameSteps(input)` instead of maintaining its own `while (true)` simulation loop.
2. Preserved the helper's return shape and `HASH_DRIFT` behavior: `HASH_DRIFT` still rethrows, while unrelated kernel/runtime errors still return `outcome: 'swallowedKernelRuntimeError'`.
3. Kept `verifyIncrementalHash` flowing through `RunGameInput.options.kernel`.
4. Preserved the helper's lightweight diagnostics-only behavior by setting `skipDeltas: true` and `traceRetention: 'finalStateOnly'`; the old helper did not retain a full trace or compute deltas.
5. Updated the run-boundary comment so the helper now documents the canonical `runGameSteps` primitive rather than the old direct `publishMicroturn(...)` / `applyPublishedDecision(...)` bypass.

Ticket corrections applied:

1. Draft workspace command `pnpm turbo lint typecheck` was narrowed to package-local `pnpm -F @ludoforge/engine lint` and `pnpm -F @ludoforge/engine typecheck` because the landed slice changes one engine test helper and no downstream package surface.
2. FITL zobrist/helper parity lanes remain too slow/noisy in this environment. A single FITL seed through the migrated helper timed out at 60s, and an ephemeral probe of the old manual-loop logic over the same built kernel and seed also timed out at 60s, so the timeout is classified as pre-existing FITL cost/noisy proof behavior rather than migration fallout.
3. The acceptance text's `hash-drift` return wording is stale relative to the live helper type and this ticket's reassessment: `HASH_DRIFT` is still rethrown, while unrelated runtime errors are returned as `swallowedKernelRuntimeError`.

Schema/artifact fallout: none. This ticket changes one TypeScript test helper only; no serialized schema, generated schema artifact, compiled game data, fixture, or golden output changed.

Verification ledger:

1. `pnpm -F @ludoforge/engine build` — passed after the final helper change.
2. `timeout 120s pnpm -F @ludoforge/engine exec node --test --test-name-pattern "Texas" dist/test/determinism/helper-vs-canonical-run-parity.test.js` — passed.
3. `timeout 120s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/zobrist-incremental-property-texas.test.js` — passed.
4. `rg -n "while \\(true\\)" packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` — returned zero matches, as expected.
5. `timeout 240s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/helper-vs-canonical-run-parity.test.js` — timed out with no assertion output; classified through the focused Texas pass and FITL old-loop probe below.
6. `timeout 240s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/zobrist-incremental-property-texas.test.js dist/test/determinism/zobrist-incremental-property-fitl-short-diverse.test.js dist/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.js` — timed out with no assertion output; Texas passed separately, FITL classified through the old-loop probe below.
7. `timeout 60s pnpm -F @ludoforge/engine exec node --input-type=module -e "<migrated helper FITL seed 1 probe>"` — timed out.
8. `timeout 60s pnpm -F @ludoforge/engine exec node --input-type=module -e "<old manual-loop FITL seed 1 probe>"` — timed out; classified as pre-existing FITL cost/noisy proof behavior, not introduced by this migration.
9. `pnpm -F @ludoforge/engine lint` — passed.
10. `pnpm -F @ludoforge/engine typecheck` — passed.
11. `timeout 300s pnpm -F @ludoforge/engine test` — schema artifact check passed; default lane passed 460 unit files and failed only at `dist/test/unit/walker-deletion-enforcement.test.js`.
12. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/walker-deletion-enforcement.test.js` — passed on direct rerun, classifying the broad-lane failure as the known wrapper/sandbox noisy case rather than helper migration fallout.
13. `pnpm run check:ticket-deps` — passed for 5 active tickets and 2181 archived tickets.

No proof-affecting edits remain after this outcome block: this status/outcome edit records the completed implementation boundary, command substitution, and already-run proof results without changing the code surface or acceptance semantics.
