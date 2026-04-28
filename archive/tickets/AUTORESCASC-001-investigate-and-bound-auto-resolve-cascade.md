# AUTORESCASC-001: Investigate and bound the `advanceAutoresolvable` cascade that processes the deck without player decisions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium-Large
**Engine Changes**: Yes — `packages/engine/src/kernel/microturn/advance.ts`, `packages/engine/src/kernel/microturn/apply.ts`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/phase-advance.ts`, plus tests/observability.
**Deps**: archive/tickets/LIFECYCFIX-001-card-discard-zone-honored-by-turn-flow-lifecycle.md, reports/ci-failures-pr-231-2026-04-28.md

## Problem

`advanceAutoresolvable` (`packages/engine/src/kernel/microturn/advance.ts:10`) iterates while the top of the decision stack is one of `{ stochasticResolve, outcomeGrantResolve, turnRetirement }`, applying each via `applyDecision`. The loop is bounded by `MAX_AUTO_RESOLVE_CHAIN`, but its bound is intended as a budget guard, not a design constraint — the loop must converge to a state requiring an actual player decision.

In the production FITL game, with `seed=42` and 4 baseline policy profiles, the simulator produces:

- `stopReason = 'terminal'` after `turnsCount = 1` (`final-coup-ranking` checkpoint).
- `decisionLogs.length = 0` — **the game ends without ANY player decision being made**.
- `compoundTurns.length = 0`.

That is, `runGame` enters its loop, calls `advanceAutoresolvable` once, the auto-loop chains through enough `turnRetirement` events to pump the entire deck through `applyTurnFlowCardBoundary` (which, prior to `LIFECYCFIX-001`, deletes the popped card on each call), and the terminal predicate fires. No agent ever publishes a decision.

This is a kernel correctness defect independent of `LIFECYCFIX-001`. Even after `LIFECYCFIX-001` lands and cards are no longer deleted, an unbounded `turnRetirement` chain that processes the entire deck without presenting a single card to a player is wrong: every legal card-driven game step is supposed to expose at least one player decision (via cardEvent eligibility, pivotalEvent, pass, etc.). If `turnRetirement` is firing because the kernel computed that no seat is eligible, that itself is a bug, because at minimum the active seat can `pass`.

The cascade is the exact mechanism by which seed-42 happens to "pass" the determinism shard in 70-120 s while seed-123 hangs >30 min: seed-42's shuffle order activates the cascade; seed-123's shuffle does not. Either way, the cascade is not legitimate gameplay — it is the engine bypassing the entire turn-by-turn decision protocol.

## Assumption Reassessment (2026-04-28)

1. **`turnRetirement` decisions are auto-resolved without player input.** Verified: `microturn/advance.ts:7` lists `turnRetirement` as auto-resolvable; `apply.ts` produces `applyDecision` results that, in some branches, push another `turnRetirement` onto the stack, sustaining the loop.
2. **In FITL the cascade can run indefinitely (within `MAX_AUTO_RESOLVE_CHAIN`).** Verified: `seed=42` `4-baseline` `maxTurns=5` produces `decisionLogs.length = 0`, demonstrating that the loop never escapes to a player-decision microturn before terminal fires.
3. **`MAX_AUTO_RESOLVE_CHAIN` did not throw.** Verified: the run completes with a "terminal" stop reason rather than the `MICROTURN_AUTO_RESOLVE_BUDGET_EXCEEDED` error from `advance.ts:57`. So the cascade fits within the budget, but the budget is not the issue — the issue is that the cascade should never have been chosen.
4. **Card-driven turn order is supposed to surface a decision per card.** Per the rules (`rules/fire-in-the-lake/fire-in-the-lake-rules-section-7.md`) every card-driven turn presents the active seat with a real decision (event, operation, special activity, pivotal, or pass). If the engine is "auto-retiring" turns where the active seat could otherwise pass, the engine is silently passing on the player's behalf without recording the pass as a decision.
5. **The cascade is independent of `LIFECYCFIX-001`.** Verified in the report: even with the popped-card deletion fix, the engine still processes the entire deck without player input in this seed unless the cascade's root trigger is removed. The two bugs compound, but they are distinct.
6. **No existing test asserts "exactly one player decision is presented per `cardDriven` round-of-play".** This is part of why the cascade landed undetected.

## Architecture Check

1. **F5 (one rules protocol)**: The kernel must emit each card's microturn through the publishing path so simulator, runner, and agents see the same decision frontier. An auto-cascade that consumes cards without a published microturn violates this.
2. **F8 (determinism)**: Whatever fix is chosen must preserve determinism. If the cascade is replaced with explicit pass-decisions, those passes must appear in the trace and replay identically.
3. **F10 (bounded computation)**: Auto-resolution chains must terminate; they must also terminate by reaching a player decision, not by exhausting the deck.
4. **F11 (immutability + scoped mutation)**: The fix must not introduce caller-visible mutation between auto-resolve steps.
5. **F15 (root-cause)**: The right fix is to identify why `turnRetirement` is being scheduled when at least one seat could `pass` (the universal fallback), and to remove that scheduling — not to artificially throttle `MAX_AUTO_RESOLVE_CHAIN`.

## Investigation Plan (Phase 1 — required before deciding the fix)

This ticket is staged: the diagnostic phase MUST complete before the implementation phase, because the right fix depends on what is producing the `turnRetirement` events.

1. **Instrument**: in a throwaway diagnostic build, log every `turnRetirement` push/pop with: `state.turnCount`, `currentPhase`, `eligibility` snapshot, `runtime.currentCard` (firstEligible/secondEligible/actedSeats/passedSeats/nonPassCount/firstActionClass), `consecutiveCoupRounds`, the top played card's `cardId` and `isCoup`, and the lookahead's `cardId`. Run `seed=42, profilesAll, maxTurns=5` and capture the full chain.
2. **Identify trigger**: find the exact predicate / call site that pushes a `turnRetirement` when the active seat could legally `pass`. Likely candidates:
   - `turn-flow-eligibility.ts` `computePostCardEligibility` returning everyone-ineligible after a card resolves a way that should have left at least one seat eligible.
   - `phase-advance.ts` boundary that retires the turn when actedSeats is empty (no decision yet) instead of presenting the active seat with a decision.
   - The pass-action plumbing being skipped when the active seat has 0 of every operation/event budget.
3. **Compare with seed-123**: run the same instrumentation under `seed=123` and verify that the cascade does NOT fire, confirming the trigger is shuffle-order-sensitive (i.e., a function of the next-card metadata interaction with current eligibility).
4. **Cross-check with Texas**: Texas tests have been green; either the cascade does not arise in Texas or it is harmless there. Run the same instrumentation against `data/games/texas-holdem` at a representative seed to characterise.
5. **Record findings** in `reports/auto-resolve-cascade-investigation-2026-04-XX.md`. The report MUST capture the exact triggering predicate, the seed-42 vs seed-123 divergence, and the proposed fix surface.

## Implementation Plan (Phase 2 — gated on Phase 1 findings)

Likely (but not committed) fix surface:

### 1. Replace silent auto-retirement with an explicit `pass` decision

If the cascade is caused by the engine retiring turns with `actedSeats == [] && passedSeats == []` (i.e., no seat has yet engaged the card), the fix is to require the engine to present each card's microturn to the active seat. The seat may choose `pass` (which is universal in `cardDriven` games), which moves through `applyPublishedDecision` and is recorded in `decisionLogs`.

In other words: `turnRetirement` should never fire on a card whose `actedSeats` and `passedSeats` are both empty. The active seat's `pass` is the legitimate exit, and it must be observed.

### 2. Forbid `turnRetirement` chains > 1 across cardDriven boundaries

Even when retirement IS legitimate (e.g., all seats already acted), the cascade must not span multiple cards. Add an invariant: after one `turnRetirement` resolves, the next iteration of `advanceAutoresolvable` must either present a player microturn or exit. If the next iteration would produce another `turnRetirement`, that is a kernel bug.

Encode this as a runtime assertion (gated by a debug flag and an architectural-invariant test) rather than a thrown error in production, until the underlying trigger is fully fixed.

### 3. Tighten `MAX_AUTO_RESOLVE_CHAIN`

After Phase 1, the legitimate maximum chain length will be characterizable (e.g., "1 stochastic resolve + 1 outcome grant per microturn + 1 retirement"). Lower `MAX_AUTO_RESOLVE_CHAIN` to that bound × small-constant-safety-margin so future regressions throw immediately. Add a comment in `microturn/constants.ts` documenting the rationale.

### 4. Update the trace contract

Every published microturn in a cardDriven game MUST appear in `decisionLogs`. Every `turnRetirement` decision must be paired with at least one preceding player decision (or stochastic-resolve) on the same `turnId`. Add a trace-validation pass that runs in tests.

## Files to Touch

- `packages/engine/src/kernel/microturn/advance.ts` (modify — add invariant guard + chain-length tightening)
- `packages/engine/src/kernel/microturn/constants.ts` (modify — re-document `MAX_AUTO_RESOLVE_CHAIN`)
- `packages/engine/src/kernel/microturn/apply.ts` (likely modify — fix the trigger that schedules `turnRetirement` prematurely)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (likely modify — eligibility computation that produces "everyone ineligible" for a fresh card)
- `packages/engine/src/kernel/phase-advance.ts` (likely modify — confirm phase advancement waits for a player decision)
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify — extend with a diagnostic mode that emits the cascade trace)
- `packages/engine/test/kernel/microturn/advance-cascade-invariants.test.ts` (new)
- `packages/engine/test/integration/fitl-rules-no-auto-cascade.test.ts` (new)
- `reports/auto-resolve-cascade-investigation-2026-04-XX.md` (new — Phase 1 deliverable)

## Out of Scope

- Card-deletion in lifecycle (owned by `LIFECYCFIX-001`).
- Per-turn FITL preview-drive performance (owned by `TURNPERF-001`).
- Re-architecting `cardDriven` turn flow as a whole.
- Texas Hold'em decision-stack reshaping unless the Phase 1 investigation determines it shares the bug.

## Acceptance Criteria

### Tests That Must Pass

1. **No-cascade on FITL seed=42**: `runGame(def, 42, [4 baselines], maxTurns=200, ...)` produces `decisionLogs.length >= 1` strictly before the first `turnRetirement` decision. (Architectural-invariant.)
2. **Decision-per-card invariant**: For every card flip in a cardDriven game (FITL + Texas), at least one entry in `decisionLogs` references that card's `turnId` before any `turnRetirement` for that turn fires.
3. **Bounded auto-resolve chain**: A property test running 1 000 random seeds against FITL asserts that the longest observed `advanceAutoresolvable` chain is ≤ the new tight bound.
4. **`MAX_AUTO_RESOLVE_CHAIN` is documented**: `microturn/constants.ts` includes a docblock referencing this ticket and the legitimate chain composition.
5. **Existing suites**: `pnpm turbo test`, `pnpm -F @ludoforge/engine test:integration`, `pnpm -F @ludoforge/engine test:e2e:all`, full determinism shards (post-`LIFECYCFIX-001`).
6. **Trace contract test**: `packages/engine/test/sim/trace-decision-contract.test.ts` (new) asserts that every cardDriven `turnId` has ≥ 1 player or stochastic decision before its retirement.

### Invariants

1. **No-cascade-without-decision**: In a cardDriven game, the kernel may not retire a turn whose `actedSeats ∪ passedSeats` is empty. Either a player decision is presented, or the active seat's pass is recorded explicitly.
2. **Chain bound documented**: `MAX_AUTO_RESOLVE_CHAIN` represents a legitimate ceiling for one microturn's auto-resolution work; exceeding it is a kernel bug, not a budget knob.
3. **Trace completeness**: Every microturn that advances kernel state appears in `decisionLogs` (auto-resolved or player) so post-hoc replay is faithful.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/microturn/advance-cascade-invariants.test.ts` — new architectural-invariant; constructs a synthetic minimal cardDriven game, runs `advanceAutoresolvable` 1 000 times across seeds, asserts no chain processes more than one card without a published microturn.
2. `packages/engine/test/integration/fitl-rules-no-auto-cascade.test.ts` — new architectural-invariant; FITL with 4 baselines, every card flip produces at least one player decision in `decisionLogs` before its turn retires.
3. `packages/engine/test/sim/trace-decision-contract.test.ts` — new; the trace's decisionLogs satisfy the "≥1 decision per turnId before retirement" contract.
4. `packages/engine/scripts/profile-fitl-preview-drive.mjs` — modify; add a `--logCascade` flag that emits the per-iteration auto-resolve diagnostic (used in Phase 1).
5. `packages/engine/test/integration/texas-cross-game.test.ts` — review; ensure Texas continues to pass with the tightened auto-resolve invariants.
6. `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-{42,123}.test.ts` — review; both will produce real player-decision traces. Re-bless if necessary in the SAME commit, with itemized re-bless reasons.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern=advance-cascade`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm -F @ludoforge/engine test:integration:texas-cross-game`
4. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-{a,b,c}`
5. `pnpm -F @ludoforge/engine test:e2e:all`
6. `pnpm turbo lint typecheck`

## Phase Gates

This ticket is split into two gated phases:

- **Phase 1 — Diagnose** (deliverable: `reports/auto-resolve-cascade-investigation-2026-04-XX.md`). MUST identify the exact trigger predicate and document it. NO code change in Phase 1.
- **Phase 2 — Fix** (gated on Phase 1 review). Implements the corrective change scoped per Phase 1 findings.

The user must approve Phase 1's report before Phase 2 begins.

## Risks

- **Determinism re-bless**: removing the cascade changes trajectory hashes for every cardDriven game seed. Re-blessing must be itemized.
- **CI runtime**: post-fix, every card flip produces at least one decision microturn. Combined with `LIFECYCFIX-001`, FITL parity tests will run far longer than today; coordinate the merge with `TURNPERF-001`.
- **Texas regression**: if Texas relies on the cascade behaviour (e.g., to auto-resolve certain phases), Phase 1 must catch this and Phase 2 must accommodate it without re-introducing the cardDriven bug.

## Outcome

**Completed**: 2026-04-28 (closed as already-satisfied; no engine code changes)

### Phase 1 reassessment supersedes the original Phase 2 plan

Phase 1 diagnostic ran against the live codebase post-`LIFECYCFIX-001` (`8ca1df07`). The full investigation is in `reports/auto-resolve-cascade-investigation-2026-04-28.md`. Three load-bearing claims from the original ticket failed verification:

1. **No production code path constructs a `TurnRetirementContext` frame.** Every `kind: 'turnRetirement'` literal in `packages/engine/src/**` either translates an existing stack frame to a Decision/published microturn (`microturn/publish.ts:360,773`) or applies a Decision (`microturn/apply.ts:208,764`, `microturn/drive.ts:629`, `microturn/advance.ts:48`). Construction sites for the *frame* exist only in unit-test fixtures. The `turnRetirement` branch of `isAutoresolvableKind` (`microturn/advance.ts:7-8`) is unreachable from `runGame`.
2. **The original "`decisionLogs.length = 0`" symptom does not reproduce.** A probe at `seed=42, profilesAll, maxTurns=1, traceRetention='full'` returned 159 player decisions (`actionSelection: 65, chooseNStep: 44, chooseOne: 50`), `longestTurnRetirementChain = 0`, `firstAutoresolvedDecisionIdx = -1`, and cards accumulating correctly (`played=12, deck=64, lookahead=1, leader=5`). The original "`decisionLogs.length = 0`" figure was almost certainly an instrumentation artifact: with any `traceRetention !== 'full'`, `simulator.ts:301` returns `decisions: []` regardless of how many decisions were actually published.
3. **Even if a `TurnRetirementContext` were pushed, no cascade is possible.** `microturn/apply.ts:777` clears `decisionStack` to `[]` after applying a `turnRetirement` decision, so the next iteration's `top` is `undefined` and `advanceAutoresolvable` exits.

The actual mechanism that historically pumped FITL's deck without surfacing decisions was the **silent card deletion** in `applyTurnFlowCardBoundary` driven by `advanceToDecisionPoint`'s phase-pumping loop in `phase-advance.ts:653`. That mechanism was fixed by `LIFECYCFIX-001` (cards now accumulate in `played:none` per `discardZone === played`). The "auto-resolve cascade" framing was a misdiagnosis of the same underlying bug.

### What changed

- **No engine code changes.** Resolution is `code: no-change`; the cascade described in this ticket is mechanistically impossible in the current pipeline and the cited symptom does not reproduce.
- **`reports/auto-resolve-cascade-investigation-2026-04-28.md`**: Phase 1 diagnostic report (created). Documents the code-search results, the probe configuration and output, the evidence-classification verdict (`incidence verified: no`, `mechanism verified: no`), and the recommendation to close as already-satisfied.

### Out-of-scope follow-ups

- **Decision-per-card invariant + property sweep**: owned by `LIFECYCREG-001` items 2 and 5. The architectural-invariant regression net for both `LIFECYCFIX-001` and the (non-existent in current code) `AUTORESCASC-001` cascade is owned by that ticket.
- **`MAX_AUTO_RESOLVE_CHAIN` documentation/tightening (original ticket §3)**: not actionable until a legitimate auto-resolve composition is observed in production traces. The empirical bound from this Phase 1 probe is 0; revisit only when a future ticket has data to characterize.
- **Dead-code cleanup of the `turnRetirement` branch in `microturn/advance.ts` and `apply.ts`**: deferred. The dead code is pinned by synthetic unit tests (`atomic-legal-actions.test.ts`, `rollback.test.ts`, `microturn-publication.test.ts`) and ripples through `schemas-core.ts`. Speculative cleanup; should be its own scoped ticket if revisited.

### Verification

No engine code changes, so build/lint/typecheck/test were not re-run for this ticket. The Phase 1 probe was run against the post-`LIFECYCFIX-001` build (`pnpm -F @ludoforge/engine build` at `8ca1df07`).
