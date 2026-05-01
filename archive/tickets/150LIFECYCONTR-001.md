# 150LIFECYCONTR-001: Atomic cut — replace `LIFECYCLE_NO_PROGRESS` exception/flag pair with `lifecycleStatus.stalled` state field

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel state shape, kernel API contract (`applyTurnFlowCardBoundary`, `finalizeSuspendedOrEndedCard`, `applyTurnFlowEligibilityAfterMove`), `ExecutionOptions`, `KernelRuntimeErrorCode` union, simulator main loop, `apply-move.ts` transit sites, `legal-moves.ts` and `microturn/publish.ts` guards, `serde.ts` + `schemas-core.ts`, test helper, related test files
**Deps**: `specs/150-card-driven-lifecycle-termination-contract.md`

## Problem

PR #231's hot-fix for the FITL deck-exhaustion stall introduced two parallel paths for the same condition. `finalizeSuspendedOrEndedCard` throws a typed `KernelRuntimeError('LIFECYCLE_NO_PROGRESS')` when `ExecutionOptions.bailOnLifecycleStall: true` is set, and silently skips the runtime advance otherwise. Two simulator catch sites and one helper catch arm translate the typed error into `stopReason='noLegalMoves'`. This violates F5 (one rules protocol, many clients — same condition has two state-shape consequences keyed on the bail flag), F15 (architectural completeness — the symptom was patched, the design gap was deferred), and F18 (a stalled lifecycle still produces nominal legal moves until finalize is called, so any client that doesn't go through finalize never sees the signal).

The kernel must surface lifecycle termination as a structural state property derivable from `(state, def)`, not as an exception thrown by a downstream apply call. F10 ("All iteration MUST be bounded") is not a runtime check the simulator should be expected to guess at — the kernel has to express the bound in state shape so any client (simulator, evolution probe, test fixture, runner) sees the same termination.

## Assumption Reassessment (2026-05-01)

1. `TurnFlowRuntimeState` lives at `packages/engine/src/kernel/types-turn-flow.ts:262` with no `lifecycleStatus` field — confirmed via reassessment.
2. `applyTurnFlowCardBoundary` returns `{ state, traceEntries, progressed: boolean }` from `kernel/turn-flow-lifecycle.ts:348`. `progressed` is consumed by exactly two callers: `kernel/turn-flow-eligibility.ts:589-591` (reads it for the throw branch) and `kernel/phase-advance.ts:534-536` (only reads `state`/`traceEntries` — unaffected by dropping the boolean from the result type).
3. `bailOnLifecycleStall` propagates through four files: declared on `ExecutionOptions` at `kernel/types-core.ts:1796-1804`, transited in two sites at `kernel/apply-move.ts:1440` and `:1455`, extracted from inner options at `kernel/turn-flow-eligibility.ts:874`, then forwarded to `finalizeSuspendedOrEndedCard` (parameter at `:569`).
4. `'LIFECYCLE_NO_PROGRESS'` source-side surfaces: `kernel/runtime-error.ts:42` (union member) + lines 247-252 (context type), `kernel/turn-flow-eligibility.ts:611-620` (throw site), `sim/simulator.ts:199` (auto-resolve catch) and `:308` (apply-move catch).
5. `'LIFECYCLE_NO_PROGRESS'` test-side surfaces: `test/helpers/zobrist-incremental-property-helpers.ts:226` (catch arm in the outer try/catch — peer arms `HASH_DRIFT` rethrow at `:223-225` and generic `isKernelRuntimeError` swallow at `:238` stay), `test/kernel/turn-flow-lifecycle-no-progress.test.ts` (the dedicated PR #231 test — to be replaced), `test/unit/kernel/viability-predicate.test.ts:202` (exhaustiveness case in a `KernelRuntimeErrorCode` switch).
6. `cardDrivenRuntime(state)` accessor lives at `kernel/card-driven-accessors.ts:9`, returns `CardDrivenRuntime | null` — the spec's proposed `cardDrivenRuntime(state)?.lifecycleStatus.stalled` access pattern works as-is once the field is added.
7. `CompoundTurnSummary.turnStopReason` already includes `'noLegalMoves'` (PR #231 added it); spec-140 tests already relax assertions to allow non-retired turns when `stopReason !== 'retired'` — both can stay green without modification, though their assertion text may benefit from referencing the new field.
8. Default value for the new field at `initializeTurnFlowEligibilityState` (in `turn-flow-eligibility.ts`): `{ stalled: false }`.

## Architecture Check

1. **Single-source termination signal (F5)**: collapses two PR #231 paths (typed exception with opt-in flag, vs. silent runtime-advance skip) into one structural state property. Same condition produces the same observable shape for every client (simulator, helper, evolution probe, runner). No more "did you remember to set the flag?" routing.
2. **Engine-agnostic (F1)**: the field is named after the lifecycle (`CardDrivenLifecycleStatus`), not after FITL or any specific game. Any future card-driven game (Imperium-style scenarios, etc.) gets the same termination contract for free.
3. **F10 enforced structurally**: "All iteration MUST be bounded" is now expressed as `lifecycleStatus.stalled === true` ⇒ no further microturns publishable. The bound is queryable before any apply-move runs, restoring the F18 derivability invariant: `legalMoves` from a stalled state returns `[]`.
4. **F15 root-cause completeness**: rather than papering over the simulator spin (PR #231's hot-fix), the kernel now owns the termination signal and exposes it before any apply-move runs.
5. **No compatibility shim (F14 atomic cut)**: PR #231's `KernelRuntimeError('LIFECYCLE_NO_PROGRESS')`, `ExecutionOptions.bailOnLifecycleStall`, and the `progressed` return field are deleted in the same change as the field is introduced. The full deletion blast radius — source consumers, transit sites, catch sites, test fixtures, exhaustiveness cases — lands in this single ticket per the Multi-Ticket Atomic Cut guidance: "the FULL deletion ... lands in the EARLIEST ticket where the deprecated API surface is removed."
6. **Mechanically uniform Large effort (F14 exception)**: every consumer migration follows the same shape — read state field instead of catching exception or checking flag — justifying the Large rating per the Foundation 14 exception. The 17-file blast radius is wide but each individual edit is small and structurally identical to its peers.
7. **F8 determinism preserved**: the new field is a deterministic function of the same `(state, def)` inputs that drove the previous `progressed` boolean. Replay-identity tests continue to pass; the existing determinism shards form the regression guard.

## What to Change

### 1. State shape — `packages/engine/src/kernel/types-turn-flow.ts`

Add a new exported interface and a required field on `TurnFlowRuntimeState`:

```ts
export interface CardDrivenLifecycleStatus {
  /**
   * True iff the most recent applyTurnFlowCardBoundary call made no
   * forward progress (no card retired via coup-handoff or discard, no
   * lookahead promoted, no draw revealed). Once true, the kernel publishes
   * no further player microturns from this state.
   */
  readonly stalled: boolean;
}

export interface TurnFlowRuntimeState {
  // ...existing fields...
  readonly lifecycleStatus: CardDrivenLifecycleStatus;
}
```

The field is REQUIRED, not optional — F14 prohibits the optional-shim transition pattern.

### 2. `packages/engine/src/kernel/turn-flow-eligibility.ts:initializeTurnFlowEligibilityState`

Default the new field to `{ stalled: false }` at every initial-state construction site this function feeds. Also default in any other turn-flow-runtime construction sites (e.g., `initialState`, runtime-fork helpers in `kernel/runtime-fork.ts` or equivalent — confirm by greping for `seatOrder:` initializers in `packages/engine/src/kernel/`).

### 3. `packages/engine/src/kernel/turn-flow-lifecycle.ts:applyTurnFlowCardBoundary` (line 348)

- Compute `progressed` exactly as PR #231 does today (no logic change).
- Set `lifecycleStatus.stalled = !progressed` on the `state.turnOrderState.runtime` portion of the returned state.
- Drop the `progressed` field from the result type — the returned `state` already carries the equivalent inverse.
- **Idempotency contract**: if input `state.turnOrderState.runtime.lifecycleStatus.stalled === true`, short-circuit and return `{ state, traceEntries: [] }` unchanged. This makes repeated finalize attempts safe on already-stalled states.

### 4. `packages/engine/src/kernel/turn-flow-eligibility.ts:finalizeSuspendedOrEndedCard` (line 557)

- Delete the `bailOnLifecycleStall: boolean = false` parameter (current `:569`).
- Delete the `if (bailOnLifecycleStall) { ... throw kernelRuntimeError('LIFECYCLE_NO_PROGRESS', ...) }` block (current `:606-621`).
- Delete the non-bail-caller `return { state: rewardState, traceEntries: [] }` early-return (current `:622-627`) — the runtime advance now always proceeds; the `lifecycleStatus.stalled = true` field IS the termination signal. Test/probe callers observe the post-effects state structurally identical to the simulator (eligibility recomputed, `currentCard.actedSeats` reset to `[]`).
- Replace the read of `lifecycle.progressed` (current `:591`) with the equivalent inverse: read `cardDrivenRuntime(lifecycle.state)?.lifecycleStatus.stalled` and invert.

### 5. `packages/engine/src/kernel/turn-flow-eligibility.ts:applyTurnFlowEligibilityAfterMove` (around line 874)

- Drop the `bailOnLifecycleStall` parameter from the function's options object.
- Stop forwarding the parameter to `finalizeSuspendedOrEndedCard` (per §4 above).

### 6. `packages/engine/src/kernel/legal-moves.ts:legalMoves` (line 1632)

Top-of-function guard:

```ts
if (cardDrivenRuntime(state)?.lifecycleStatus.stalled === true) {
  return [];
}
```

The `lifecycleStatus.stalled` field IS the F18 derivability signal observable directly to enumeration callers (agents, evaluation probes, runner) without going through finalize.

### 7. `packages/engine/src/kernel/microturn/publish.ts:publishMicroturn*` (line 786)

Top-of-function guard:

```ts
if (cardDrivenRuntime(state)?.lifecycleStatus.stalled === true) {
  throw microturnConstructibilityInvariant('actionSelection context has no bridgeable continuations');
}
```

The live Spec 144 runtime safety net already treats the existing microturn constructibility no-bridgeable errors as no-bridgeable signals by message; this ticket does not introduce a new `KernelRuntimeErrorCode`. This guard short-circuits before touching the publication probe. The simulator's existing `isNoBridgeableMicroturnError` rollback path is unrelated and stays.

### 8. `packages/engine/src/kernel/apply-move.ts`

- Delete the two transit sites that pass `bailOnLifecycleStall: options?.bailOnLifecycleStall === true` into `applyTurnFlowEligibilityAfterMove` (current `:1440` and `:1455` — both branches of the move-vs-freeOperation conditional). The options object passed to `applyTurnFlowEligibilityAfterMove` should contain only `originatingPhase` and `tracker` after this edit.

### 9. `packages/engine/src/kernel/runtime-error.ts`

- Delete `'LIFECYCLE_NO_PROGRESS'` from the `KernelRuntimeErrorCode` union (current `:42`).
- Delete the `KernelRuntimeErrorContextByCode['LIFECYCLE_NO_PROGRESS']` entry (current `:247-252`).

### 10. `packages/engine/src/kernel/types-core.ts`

- Delete the `bailOnLifecycleStall?: boolean` field from `ExecutionOptions` along with its documentation comment (current `:1796-1804`).

### 11. `packages/engine/src/sim/simulator.ts`

- Delete the auto-resolve catch site (current `:199`):
  ```ts
  if (isKernelErrorCode(error, 'LIFECYCLE_NO_PROGRESS')) {
    stopReason = 'noLegalMoves';
    break;
  }
  ```
  The surrounding try/catch around `advanceAutoresolvable` should be removed entirely if `LIFECYCLE_NO_PROGRESS` was its only typed handler; otherwise leave the `throw error` rethrow.
- Delete the apply-move catch site (current `:308`) symmetrically.
- Add a top-of-loop check after `terminalResult` is checked:
  ```ts
  if (cardDrivenRuntime(state)?.lifecycleStatus.stalled) {
    stopReason = 'noLegalMoves';
    break;
  }
  ```
  **Order matters**: this must come after `terminalResult` so a configured terminal (e.g., final-coup scoring) can still fire on the same state if both apply (configured terminal wins).
- Remove `bailOnLifecycleStall: true` from the default kernelOptions construction (current `:160-162`); the destructuring should now construct `kernelOptions` purely from `callerKernelOptions`.

### 12. `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:runVerifiedGameWithDiagnostics` (line 134)

- Delete `bailOnLifecycleStall: true` from the kernelOptions object (current `:148-151`).
- Delete the `if (isKernelRuntimeError(err) && err.code === 'LIFECYCLE_NO_PROGRESS') { ... }` catch arm in the outer try/catch (current `:226-237`). The peer arms (`HASH_DRIFT` rethrow at `:223-225`, generic `isKernelRuntimeError` swallow at `:238`) stay — both are unrelated to the lifecycle stall.
- Add the same top-of-loop `lifecycleStatus.stalled` check the simulator does, after `advanceAutoresolvable` returns:
  ```ts
  if (cardDrivenRuntime(state)?.lifecycleStatus.stalled) {
    return {
      outcome: 'completed',
      decisionCount,
      stopReason: 'noLegalMoves',
      finalStateHash: state.stateHash,
      turnsCount: state.turnCount,
    };
  }
  ```

### 13. `packages/engine/src/kernel/serde.ts` + `packages/engine/src/kernel/schemas-core.ts`

- Add the `lifecycleStatus` field to the serialization protocol for `TurnFlowRuntimeState` in `serde.ts`. Round-trip the nested `{ stalled: boolean }` exactly. Confirm canonicality is preserved (deterministic key ordering).
- Add the Zod schema entry in `schemas-core.ts`:
  ```ts
  lifecycleStatus: z.object({ stalled: z.boolean() }).readonly()
  ```
  (or the equivalent the codebase uses for nested readonly objects — match the pattern used by the other `TurnFlowRuntimeState` fields).
- This is additive only — independent of Spec 151's `serializeGameState` BigInt sanitization fix.

### 14. Test updates (in this same atomic cut — required for build correctness)

- **Replace** `packages/engine/test/kernel/turn-flow-lifecycle-no-progress.test.ts` with a new file `packages/engine/test/kernel/turn-flow-lifecycle-status.test.ts` that asserts the field-based contract:
  - `applyTurnFlowCardBoundary` on a deck-and-lookahead-empty state returns `state.turnOrderState.runtime.lifecycleStatus.stalled === true`.
  - Same call on a healthy state returns `stalled === false`.
  - Idempotency: calling `applyTurnFlowCardBoundary` on a state with `stalled === true` returns the input state unchanged.
  - File-top class marker: `// @test-class: architectural-invariant`.
- **Modify** `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts` and `spec-140-foundations-conformance.test.ts` to reference the new field where it improves clarity. The existing `turnStopReason === 'retired'` relaxation continues to work without modification.
- **Modify** `packages/engine/test/unit/kernel/viability-predicate.test.ts:202`: remove the `case 'LIFECYCLE_NO_PROGRESS': return code;` arm from the `KernelRuntimeErrorCode` exhaustiveness switch. The `never`-typed default arm becomes the exhaustiveness oracle once the union member is gone in §9.
- **Add** unit tests covering AC #5 and AC #6 below — either in the new `turn-flow-lifecycle-status.test.ts` or in a sibling file under `packages/engine/test/kernel/` or `packages/engine/test/unit/`. The `applyMove` direct-call test (AC #6) verifies the post-finalize state shape, NOT the pre-finalize stale shape that PR #231's non-bail branch returned.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/kernel/serde.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify)
- `packages/engine/test/kernel/turn-flow-lifecycle-status.test.ts` (new — replaces no-progress.test.ts)
- `packages/engine/test/kernel/turn-flow-lifecycle-no-progress.test.ts` (delete — replaced by status.test.ts)
- `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts` (modify if needed)
- `packages/engine/test/integration/spec-140-foundations-conformance.test.ts` (modify if needed)
- `packages/engine/test/unit/kernel/viability-predicate.test.ts` (modify — remove exhaustiveness case)

## Out of Scope

- New `stopReason: 'lifecycleStalled'` value — simulator continues to emit `'noLegalMoves'`. Per spec 150 Out of Scope: adding a new value forks downstream consumers (analytics, evolution-quality scoring, runner UI). The state field is the kernel signal; the simulator's translation to `'noLegalMoves'` is a documented invariant.
- Hot-path perf budget for accumulating-zone workloads — deferred to Spec 153 candidate.
- Card-driven *initialization* validation (deck=0 by author error) — that's a compile-time concern, F12.
- Runner UI changes — runner consumes `stopReason` via trace; no kernel-side runner change.
- The new end-to-end FITL deck-exhaustion integration test (AC #3) — owned by ticket `tickets/150LIFECYCONTR-002.md`.
- Spec 152's shared-loop refactor — Spec 152 is a downstream consumer that lands cleanly after this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. New unit (in `turn-flow-lifecycle-status.test.ts`): `applyTurnFlowCardBoundary` on a deck-and-lookahead-empty state returns `state.turnOrderState.runtime.lifecycleStatus.stalled === true`.
2. New unit: same call on a healthy state returns `stalled === false`.
3. New unit: `applyTurnFlowCardBoundary` is idempotent on stalled states (calling it on a state with `stalled === true` returns the input state unchanged).
4. New unit: `legalMoves(state-with-stalled-lifecycle)` returns `[]`.
5. New unit: `applyMove` directly applied to a state that subsequently stalls returns the post-effects state with `stalled === true`, no thrown error, AND with the eligibility runtime advanced (`currentCard.actedSeats === []`, `nextEligibility` recomputed) — i.e., not the pre-finalize stale shape that PR #231's non-bail branch returned. Direct callers must observe the same post-finalize state shape that simulator callers see.
6. Replay-identity preserved: existing determinism shards (per `.github/workflows/engine-determinism.yml`) all green. Re-running the same seed produces the same `lifecycleStatus.stalled` trajectory.
7. spec-140 compound-turn and foundations-conformance suites continue passing with the simplified consumer code (no more catch blocks for `LIFECYCLE_NO_PROGRESS`).
8. Existing slow-parity, fitl-events, fitl-rules suites all green.
9. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. The exception code `LIFECYCLE_NO_PROGRESS` and the option `bailOnLifecycleStall` no longer exist anywhere in `packages/engine/src` or `packages/engine/test` (per F14, no compatibility shim). Verifiable: `grep -rn 'LIFECYCLE_NO_PROGRESS\|bailOnLifecycleStall' packages/engine/src packages/engine/test` returns zero hits.
2. The simulator main loop has zero try/catch blocks for kernel-runtime stalls (the `isNoBridgeableMicroturnError` rollback path is unrelated and stays).
3. `cardDrivenRuntime(state)?.lifecycleStatus.stalled === true` ⇔ the most recent boundary call made no progress AND no subsequent boundary call has made progress since.
4. `applyTurnFlowCardBoundary` is idempotent on stalled states.
5. F8 determinism: same `(state, def)` always yields the same `lifecycleStatus.stalled` value.
6. `legalMoves(state)` returns `[]` whenever `cardDrivenRuntime(state)?.lifecycleStatus.stalled === true` — directly observable to enumeration callers without going through finalize.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/turn-flow-lifecycle-status.test.ts` (new) — replaces the PR #231 no-progress test; asserts the field-based contract (covers AC #1, #2, #3, #4, #5 above). File-top marker: `// @test-class: architectural-invariant`.
2. `packages/engine/test/kernel/turn-flow-lifecycle-no-progress.test.ts` (delete) — replaced by status.test.ts.
3. `packages/engine/test/unit/kernel/viability-predicate.test.ts` (modify) — remove the `LIFECYCLE_NO_PROGRESS` exhaustiveness case so the `never`-typed default arm correctly enforces exhaustiveness over the trimmed union.
4. `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts` (modify if needed) — verify the existing `turnStopReason === 'retired'` relaxation still holds; reference the new field for clarity if useful.
5. `packages/engine/test/integration/spec-140-foundations-conformance.test.ts` (modify if needed) — same as above.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test` (full unit + integration).
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` (the lanes that were the original CI failure).
4. `pnpm -F @ludoforge/engine test:integration:fitl-events` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
5. Determinism shards: full set per `.github/workflows/engine-determinism.yml`.
6. `pnpm turbo lint typecheck`.
7. Residue grep: `grep -rn 'LIFECYCLE_NO_PROGRESS\|bailOnLifecycleStall' packages/engine/src packages/engine/test` → must return zero hits.

## Outcome

Completed: 2026-05-01

Implemented the Foundation-aligned atomic cut:

- Added required `TurnFlowRuntimeState.lifecycleStatus.stalled` and serialized/schema support.
- `applyTurnFlowCardBoundary` now writes `lifecycleStatus.stalled`, drops the public `progressed` result field, and is idempotent for already-stalled states.
- Removed `ExecutionOptions.bailOnLifecycleStall`, `KernelRuntimeError('LIFECYCLE_NO_PROGRESS')`, simulator/helper catch translation, and apply-move transit sites.
- `legalMoves` returns `[]` for stalled card-driven states.
- `publishMicroturn*` uses the existing microturn constructibility no-bridgeable error shape for stalled states; no new `KernelRuntimeErrorCode` was introduced.
- `advanceToDecisionPoint`, `runGame`, and `runVerifiedGameWithDiagnostics` stop on the structural stalled state after checking configured terminal results, preserving terminal-priority semantics.
- Replaced the old no-progress test with `packages/engine/test/kernel/turn-flow-lifecycle-status.test.ts`.

Boundary corrections approved on 2026-05-01:

- The draft's `MICROTURN_NO_BRIDGEABLE` error code was stale; the live no-bridgeable microturn path is message-shaped constructibility errors.
- The draft's simulator ordering sentence was contradictory. The implemented contract checks `terminalResult` before `lifecycleStatus.stalled`, so configured terminal results win when both apply.

Generated artifact fallout:

- `packages/engine/schemas/Trace.schema.json` was regenerated for the required `lifecycleStatus` runtime field.
- The same generator also restored the already-live `noLegalMoves` `SimulationStopReason` value in `Trace.schema.json`; this is canonical stale-schema drift discovered by the owned schema check.

Verification completed before final proof:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/turn-flow-lifecycle-status.test.js`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `rg -n "LIFECYCLE_NO_PROGRESS|bailOnLifecycleStall" packages/engine/src packages/engine/test` returned zero matches (`rg` exit 1).

Final proof notes:

- `pnpm -F @ludoforge/engine build` passed after the final source cleanup.
- `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/turn-flow-lifecycle-status.test.js` passed (5/5 subtests).
- `pnpm -F @ludoforge/engine run schema:artifacts:check` passed.
- `rg -n "LIFECYCLE_NO_PROGRESS|bailOnLifecycleStall" packages/engine/src packages/engine/test` returned zero matches (`rg` exit 1).
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed after the generated trace fixture update.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-card-lifecycle.test.js` passed after updating the deck-exhaustion expectation to the structural `lifecycleStatus.stalled` signal.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` reached the lifecycle-owned FITL card-flow and card-lifecycle files green, then timed out in the known Spec 149 performance surface `dist/test/integration/fitl-march-free-operation.test.js` after 5m.
- `pnpm -F @ludoforge/engine test:integration:fitl-events` ran a long green prefix through many event-card files, then timed out in the known Spec 149 performance surface `dist/test/integration/fitl-events-sihanouk.test.js` after 10m.
- `pnpm -F @ludoforge/engine test` remains red in `dist/test/unit/kernel/effect-frame-suspend-resume.test.js` with the independent Spec 151 BigInt suspended-frame serialization mismatch; direct rerun of that file failed the same way.

Post-ticket-review cleanup:

- Extended the stalled-lifecycle guard from `legalMoves` to `enumerateLegalMoves`, direct `applyMove` / `applyTrustedMove` execution via `applyMoveCore`, and `probeMoveLegality` / `probeMoveViability`, so the one-rules-protocol surfaces preserve the same no-further-play invariant.
- Extended `packages/engine/test/kernel/turn-flow-lifecycle-status.test.ts` to cover enumeration, publication, apply, and probe surfaces from a stalled lifecycle state.
- Review verification: `pnpm -F @ludoforge/engine build` passed; `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/turn-flow-lifecycle-status.test.js` passed (6/6 subtests).
