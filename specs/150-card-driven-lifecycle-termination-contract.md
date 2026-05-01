# Spec 150: Card-Driven Turn-Flow Lifecycle Termination Contract

**Status**: PROPOSED
**Priority**: P1 (closes the F10 gap that the PR #231 hot-fix patched with an opt-in flag; deliver before any future card-driven game is added so the contract is consistent across all clients)
**Complexity**: M (kernel state-shape addition, public-API contract change for `applyTurnFlowCardBoundary`, simulator + helper consumer updates; no GameSpecDoc YAML change, no compiler IR change)
**Dependencies**:
- Foundation 1 (Engine Agnosticism) — the contract MUST express termination as a generic kernel signal, not a card-driven-specific exception. Same primitive serves any future zone-rotation game.
- Foundation 8 (Determinism Is Sacred) — the termination signal is a deterministic function of `(state, def)`; same inputs yield the same termination state across replays.
- Foundation 10 (Bounded Computation) — this is the principle the spec exists to honor. A turn-flow cannot iterate without forward progress; the spec formalizes how the kernel surfaces that bound.
- Foundation 11 (Immutability) — the termination signal is carried in the immutable `GameState`, not in caller-side bookkeeping.
- Foundation 15 (Architectural Completeness) — the PR #231 fix added a typed exception (`LIFECYCLE_NO_PROGRESS`) plus an opt-in `ExecutionOptions.bailOnLifecycleStall` flag and a parallel "skip the runtime advance" branch for direct callers. That is two paths for the same condition; this spec consolidates them into one structural state.
- Foundation 18 (Constructibility Is Part of Legality) — when no card lifecycle progress is possible, no further legal microturns SHOULD be enumerable from the same canonical state. The contract makes that derivable from state shape, not from an exception thrown by a downstream apply call.
- Spec 144 (microturn pass-fallback) — the pass-fallback recovery path already establishes the precedent that the kernel can surface "no further play" as a state condition rather than an error; this spec extends that precedent to lifecycle termination.

**Source**:
- PR #231 root-cause investigation (`reports/ci-failures-pr-231-2026-05-01.md` if written; otherwise the conversation log of that PR's gate-1 diagnosis). Instrumented evidence: with FITL's accumulating-played semantic from LIFECYFIX-001, the simulator spun at ~13 finalize-calls/sec on the same already-resolved card after the deck and lookahead emptied, never advancing turn 2. `applyCardBoundary` count at 1205+ in 90 s with `playedSize=77, lookaheadSize=0, turnCount=1` frozen across all subsequent calls.
- The shipped PR #231 fix: `applyTurnFlowCardBoundary` returns `progressed: boolean`; `finalizeSuspendedOrEndedCard` throws typed `KernelRuntimeError('LIFECYCLE_NO_PROGRESS')` when `bailOnLifecycleStall: true` is set on `ExecutionOptions`; otherwise skips the runtime advance and returns the rewardState unchanged. Two simulator catch sites translate the typed error to `stopReason='noLegalMoves'`. `runVerifiedGameWithDiagnostics` has its own opt-in catch.
- LIFECYFIX-001 (`archive/tickets/LIFECYCFIX-001-card-discard-zone-honored-by-turn-flow-lifecycle.md`) — the correctness fix that exposed the gap. The ticket fixed token deletion at the boundary but did not introduce a paired termination contract; the kernel was implicitly relying on played going empty to drive `noLegalMoves` via legal-moves enumeration.
- FITL canonical rules: `rules/fire-in-the-lake/fire-in-the-lake-rules-section-2.md` §2.3.7 (cards accumulate on played by design) and §7.3 (game ends after final coup; the spec does not contemplate "deck exhausted without final coup," confirming the kernel needs a generic stall guard).

## Brainstorm Context

**Original framing.** Card-driven turn-flow games (FITL, Imperium-style scenarios, future similar) drive progression by rotating cards through a fixed lifecycle: `drawDeck → lookahead → played`. After LIFECYFIX-001, a card on the played pile may stay there (accumulating-discard semantic) instead of being silently destroyed. When the draw deck and lookahead are both empty, `applyTurnFlowCardBoundary` makes no forward progress: lookahead has no card to promote, the deck has no card to reveal, and the played top — which has just been resolved by the eligibility runtime — stays in place.

The eligibility runtime, however, does not know the lifecycle stalled. `finalizeSuspendedOrEndedCard` resets `currentCard.actedSeats = []` after every card-end, so on the next move every faction is again seen as eligible-but-already-acted-by-prior-card, the next move triggers `endedReason='rightmostPass'` again, finalize fires again, and the cycle never exits. F10 says the kernel MUST bound iteration; this is the kernel violating its own contract by accident.

**Motivation.**
1. **F10 enforcement.** "All iteration MUST be bounded" is not a runtime check we can rely on the simulator to guess at. The kernel has to express the bound structurally so any client (simulator, evolution probe, test fixture, runner) sees the same termination.
2. **F1 + F5 uniformity.** Right now PR #231's fix has two branches keyed on `bailOnLifecycleStall`: one throws a typed exception (simulator opt-in), one silently skips runtime advance (test default). Same condition, two state-shape consequences. F5 ("One Rules Protocol, Many Clients") wants this collapsed to one structural signal everyone observes.
3. **F18 derivability.** Constructibility says legal moves must be derivable from state. Today, a stalled lifecycle still produces nominal legal moves (the agents can "act on" the played top again because the eligibility runtime resets) — the kernel only signals stalled via an exception thrown when finalize is called. A client that doesn't go through finalize never sees the signal.
4. **F15 root-cause completeness.** The PR #231 hot-fix patched the symptom; this spec closes the design gap.

**Prior art surveyed.**
- **F18 pass-fallback recovery (Spec 144).** When the kernel cannot publish a constructible action, it rolls back to the nearest `actionSelection` frame, blacklists the offending action, and re-publishes — emitting a structured trace event. Same architectural shape: the kernel embeds the recovery signal in state + trace, never as a thrown error the client must catch. This spec extends the same shape to lifecycle termination.
- **Magic: the Gathering Comprehensive Rules §103.4 ("If a player would draw from an empty library, that player loses the game").** The card lifecycle ends explicitly as a game-state condition, not an error; the rules engine treats it as a deterministic terminal. The same generic shape — the kernel makes "lifecycle has stalled" a state property — generalizes to FITL's deck exhaustion.
- **Spec 144 generic `tags: [pass]` fallback action** — the kernel publishes a generic terminal-style microturn rather than throwing. Reuse the precedent: when the lifecycle stalls, the kernel publishes a no-op microturn (or marks the state terminal) rather than an exception.

**Synthesis.** Add a kernel-owned `lifecycleStalled: boolean` field to the card-driven turn-flow runtime state (or equivalent: a state property `cardDrivenLifecycleStatus: 'active' | 'stalled'`). When `applyTurnFlowCardBoundary` would make no forward progress, it sets the field on the returned state instead of throwing. The contract is:

1. Once `lifecycleStalled === true`, the kernel publishes no further player microturns from that state. Legal-move enumeration returns empty. The next call to `terminalResult` MAY return a synthesized terminal value `{ kind: 'lifecycleStalled' }` (or the simulator detects the field and stops with `stopReason='noLegalMoves'`). The exact translation is a downstream policy choice; the kernel's job is to make the field deterministic and queryable.
2. `applyTurnFlowCardBoundary` continues to be deterministic and pure — same input → same output, same `progressed` value. The new field is a function of the same inputs.
3. The PR #231 typed `KernelRuntimeError('LIFECYCLE_NO_PROGRESS')` is **deleted** in this spec's atomic cut (F14: no compatibility shim). The simulator's two catch sites and the helper's catch site are replaced by reading the state field.
4. `bailOnLifecycleStall` on `ExecutionOptions` is **deleted**. There is no caller-side opt-in — the field is always present and always meaningful.

**Alternatives explicitly considered (and rejected).**
- **Keep the typed exception model (status quo from PR #231).** Two paths in finalize, two simulator catch sites, helpers must mirror — F5 and F15 violations. Rejected.
- **Synthesize a terminal-result entry in `def.terminal.checkpoints`.** Auto-add "deck exhausted = draw" to every card-driven game's terminal checkpoints at compile time. Rejected — F1 violation (kernel synthesizes per-game terminals based on `def.eventDecks` shape) and F7 violation (the spec is the data, not auto-augmented at compile).
- **Rely on legal-moves naturally returning empty.** Make `finalize` skip the runtime advance and let the caller iterate — eventually the simulator's `noLegalMoves` mechanism kicks in. Rejected: this is what the PR #231 "skip runtime advance" branch does for non-bail callers, and it requires the simulator to NOT spin (which only happens because of the all-false eligibility hack, which has the next-spec test compatibility problem). The kernel must say "stalled," not "wait for the caller to figure it out."
- **State-level new `stopReason` value.** Promote `stopReason: 'lifecycleStalled'` rather than reusing `'noLegalMoves'`. Rejected for now — the simulator already has `'noLegalMoves'` for any "no further play" terminal; adding a new value forks downstream consumers (analytics, evolution-quality scoring, runner UI). The state field is the kernel signal; the simulator's translation to `'noLegalMoves'` is a documented invariant.

**User constraints reflected.**
- F1 ✅: the field is named after the lifecycle, not after FITL or any specific game.
- F8 ✅: deterministic; same `(state, def)` → same field value.
- F10 ✅: this is the principle the spec exists to honor.
- F11 ✅: the field lives on a new `GameState` derivative, returned via the immutable `applyTurnFlowCardBoundary` result.
- F14 ✅: deletes the PR #231 exception/flag pair in the same change.
- F15 ✅: addresses the root cause — the kernel owns the termination signal, not the caller.
- F18 ✅: legal-move enumeration from a stalled state returns empty; constructibility holds.

## Overview

```ts
// kernel/types-turn-flow.ts (or equivalent)
export interface CardDrivenLifecycleStatus {
  /**
   * True iff the most recent `applyTurnFlowCardBoundary` call made no
   * forward progress (no card retired via coup-handoff or discard, no
   * lookahead promoted, no draw revealed). Once true, the kernel MUST NOT
   * publish further player microturns from this state.
   */
  readonly stalled: boolean;
}

// kernel/turn-flow-lifecycle.ts (signature change)
export const applyTurnFlowCardBoundary = (
  def: GameDef,
  state: GameState,
  options?: { readonly tracker?: DraftTracker },
): {
  readonly state: GameState;            // state.turnOrderState.runtime.lifecycleStatus = { stalled: boolean }
  readonly traceEntries: readonly TriggerLogEntry[];
};

// kernel/legal-moves.ts (consumer)
// When lifecycleStatus.stalled === true, enumerateLegalMoves returns [].

// sim/simulator.ts (consumer)
// Top-of-loop check after advanceAutoresolvable: if lifecycleStatus.stalled === true,
// stopReason='noLegalMoves' and break. No try/catch needed.

// kernel/runtime-error.ts
// 'LIFECYCLE_NO_PROGRESS' code is DELETED.

// kernel/types-core.ts
// ExecutionOptions.bailOnLifecycleStall is DELETED.
```

Public-API change: `applyTurnFlowCardBoundary` no longer drops the `progressed` boolean from its return; instead the `state.turnOrderState.runtime.lifecycleStatus.stalled` field IS the progressed signal (inverted semantics, but stronger contract — it persists until the next progress-making boundary).

## What to Change

### 1. State shape — `kernel/types-turn-flow.ts` (or equivalent)

Add to `TurnFlowRuntimeState`:
```ts
readonly lifecycleStatus: CardDrivenLifecycleStatus;
```

Default value at `initializeTurnFlowEligibilityState`: `{ stalled: false }`.

### 2. `kernel/turn-flow-lifecycle.ts:applyTurnFlowCardBoundary`

- Compute `progressed` exactly as PR #231 does.
- Update `state.turnOrderState.runtime.lifecycleStatus.stalled = !progressed`.
- Drop the `progressed` field from the result type — the returned `state` already carries it.
- Once `stalled === true`, subsequent calls that observe `stalled === true` MUST short-circuit and return state unchanged (idempotent).

### 3. `kernel/turn-flow-eligibility.ts:finalizeSuspendedOrEndedCard`

- Delete the throw of `LIFECYCLE_NO_PROGRESS`.
- Delete the bailOnLifecycleStall parameter and the `nextEligibility = all-false` branch.
- The runtime advance still proceeds; the new `lifecycleStatus.stalled = true` field IS the termination signal. `nextEligibility` is computed normally so test/probe callers observe the post-effects state structurally identical to the simulator.

### 4. `kernel/legal-moves.ts:legalMoves` and `microturn/publish.ts:publishMicroturn*`

- Top-of-function: if `cardDrivenRuntime(state).lifecycleStatus.stalled === true`, return empty / throw `MICROTURN_NO_BRIDGEABLE` per the existing F18 contract. The lifecycleStatus field IS the F18 derivability signal.

### 5. `sim/simulator.ts`

- Delete the two `catch (error) { isKernelErrorCode(error, 'LIFECYCLE_NO_PROGRESS') }` blocks.
- Add a top-of-loop check after `advanceAutoresolvable`: `if (cardDrivenRuntime(state)?.lifecycleStatus.stalled) { stopReason = 'noLegalMoves'; break; }`. This MUST come before `terminalResult` so a configured terminal can still fire on the same state if both apply (e.g., final-coup scoring resolves, then the lifecycle stall is observed — the configured terminal wins).
- Delete `bailOnLifecycleStall: true` from the default kernelOptions.

### 6. `test/helpers/zobrist-incremental-property-helpers.ts:runVerifiedGameWithDiagnostics`

- Delete `bailOnLifecycleStall: true` from kernelOptions.
- Delete the `if (err.code === 'LIFECYCLE_NO_PROGRESS')` catch arm.
- Add the same top-of-loop `lifecycleStatus.stalled` check the simulator does.
- (Or migrate this helper to consume the `runGame` loop directly, per Spec 152's reuse contract — the two specs compose cleanly.)

### 7. `kernel/runtime-error.ts`

- Delete `'LIFECYCLE_NO_PROGRESS'` from `KernelRuntimeErrorCode` and `KernelRuntimeErrorContextByCode`.

### 8. `kernel/types-core.ts`

- Delete `bailOnLifecycleStall?: boolean` from `ExecutionOptions`.

### 9. `kernel/serde.ts` + `kernel/schemas-core.ts`

- Add `lifecycleStatus` to the serialization protocol for `TurnFlowRuntimeState`.
- Add Zod literal schema for `lifecycleStatus.stalled`.

### 10. Tests

- Update `test/kernel/turn-flow-lifecycle-no-progress.test.ts` to assert the field instead of throw shape.
- Update `test/integration/spec-140-compound-turn-summary.test.ts` and `test/integration/spec-140-foundations-conformance.test.ts` to reference the lifecycleStatus field if useful (the existing `turnStopReason === 'retired'` relaxation continues to work).
- Add a dedicated integration test: "FITL deck exhaustion produces `lifecycleStatus.stalled === true` AND `stopReason === 'noLegalMoves'` on `runGame`."

## Out of Scope

- Hot-path perf budget for accumulating-zone workloads (separate spec, Spec 153 candidate).
- Card-driven *initialization* status field — initial state where draw deck has 0 cards by author error is a compile-time validation concern, F12.
- A new `stopReason: 'lifecycleStalled'` value — the simulator continues to emit `'noLegalMoves'`. If analytics needs a finer distinction, that's a separate trace-enrichment spec.
- Updating the runner UI to show "deck exhausted" — the runner consumes `stopReason` via trace, no kernel change needed.

## Acceptance Criteria

### Tests That Must Pass

1. New unit: `applyTurnFlowCardBoundary` on a deck-and-lookahead-empty state returns `state.turnOrderState.runtime.lifecycleStatus.stalled === true`.
2. New unit: same call on a healthy state returns `stalled === false`.
3. New integration: FITL with seed where deck exhausts before terminal — `runGame` returns `stopReason === 'noLegalMoves'`, `finalState.turnOrderState.runtime.lifecycleStatus.stalled === true`.
4. Replay-identity preserved: re-running the same seed produces the same `lifecycleStatus.stalled` trajectory.
5. F18: `legalMoves(state-with-stalled-lifecycle)` returns `[]`.
6. Test that `applyMove` directly applied to a state that subsequently stalls returns the post-effects state with `stalled === true` and no thrown error.
7. The full pre-fix slow-parity, fitl-events, fitl-rules, and determinism shards all pass with the simplified consumer code (no more catch blocks).

### Invariants

1. The exception type `LIFECYCLE_NO_PROGRESS` and the option `bailOnLifecycleStall` no longer exist in source. (Per F14, no compatibility shim.)
2. The simulator main loop has zero try/catch blocks for kernel-runtime stalls (the `isNoBridgeableMicroturnError` rollback path is unrelated and stays).
3. `cardDrivenRuntime(state).lifecycleStatus.stalled` is true ⇔ the most recent boundary call made no progress AND no subsequent boundary call has made progress since.

## Test Plan

### New/Modified Tests

- `test/kernel/turn-flow-lifecycle-status.test.ts` — replaces `turn-flow-lifecycle-no-progress.test.ts` from PR #231, asserts the field-based contract.
- `test/integration/lifecycle-stalled-deck-exhaustion.test.ts` — runGame end-to-end check on a FITL fixture configured for short-deck exhaustion.
- All existing PR #231 catch-block-removal sites get covered by the existing slow-parity suite running green without changes.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test` (full unit + integration).
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` (the lanes that were the original CI failure).
4. `pnpm -F @ludoforge/engine test:integration:fitl-events` and `fitl-rules`.
5. Determinism shards: full set per `engine-determinism.yml`.
6. `pnpm turbo lint typecheck`.
7. Grep for residue: `grep -rn 'LIFECYCLE_NO_PROGRESS\|bailOnLifecycleStall' packages/engine/src` → must return zero hits.

## Notes

The PR #231 fix landed because CI was burning. This spec is the architectural completeness pass that should follow once CI is green and the team has bandwidth for the consumer-site rewrites. None of the consumers are large; the disruption is mostly mechanical.
