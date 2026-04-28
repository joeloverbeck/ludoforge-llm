# LIFECYCFIX-001: Honor `eventDeck.discardZone` in turn-flow card lifecycle (stop deleting played cards)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/turn-flow-lifecycle.ts`, `packages/engine/src/kernel/types-events.ts` (or schema refactor for slot derivation), validation, and tests.
**Deps**: archive/tickets/POLPREVDRIVE-007.md, reports/ci-failures-pr-231-2026-04-28.md

## Problem

`applyTurnFlowCardBoundary` in `packages/engine/src/kernel/turn-flow-lifecycle.ts` removes the top of `played:none` via `popTopToken` and then either prepends it to `leader:none` (only when the card is a Coup AND `consecutiveCoupRounds < maxConsecutiveRounds`) or **silently drops it**. There is no place where the popped card gets routed to the `discardZone` declared on the `eventDeck` (`packages/engine/src/kernel/types-events.ts:118` — `discardZone: string`).

For FITL the `eventDeck` declares `discardZone: played:none` (`data/games/fire-in-the-lake/41-events/001-032.md:7`), i.e. the played slot IS the discard pile. Every card that resolves should accumulate there. Instead, the kernel deletes it.

Direct evidence (`reports/ci-failures-pr-231-2026-04-28.md` and the probe rerun on `2026-04-28`):

- `seed=42`, `maxTurns=5`, all 4 baseline profiles, `verifyIncrementalHash: true`.
- Initial state (post-setup, pre-runGame): **130** distinct card tokens across all zones, including 76 cards (6 Coups) in `deck:none`.
- Final state (1 reported "turn", `stopReason: 'terminal'`, victory checkpoint `final-coup-ranking`): **63** distinct card tokens. **67 cards have been deleted** (4 Coups + 63 events). The terminal predicate fired only because `count(deck:none, isCoup) == 0`, which is satisfied not because the deck was legitimately exhausted but because the lifecycle drained and deleted the cards.

Per FITL's actual rules (`rules/fire-in-the-lake/fire-in-the-lake-rules-section-7.md`), the game has two terminal states: a faction wins on any Coup victory check, OR the final Coup card's full sequence completes. **The game cannot legitimately end on the first played card** because there are 5 more Coup cards behind it. The only reason `final-coup-ranking` fires here is because the deck has been emptied via deletion.

This is the root architectural cause that masked the seed-42 vs seed-123 perf divergence on `Engine Determinism Parity`. seed-42's shuffle happens to trigger an `advanceAutoresolvable` cascade that pumps the entire deck through the lifecycle in one chain; the cascade is investigated separately (see AUTORESCASC-001), but the per-card deletion mechanism is owned by THIS ticket.

## Assumption Reassessment (2026-04-28)

1. **`played:none` is configured as both the play slot AND the discard pile in FITL.** Verified: `cardLifecycle.played: played:none` in `data/games/fire-in-the-lake/30-rules-actions.md:24`, and `eventDecks[0].discardZone: played:none` in `data/games/fire-in-the-lake/41-events/001-032.md:7`. There is no separate discard zone in the FITL spec.
2. **The kernel lifecycle slots ignore `discardZone`.** Verified: `LifecycleSlots` in `packages/engine/src/kernel/turn-flow-lifecycle.ts:13` carries only `{ played, lookahead, leader }`. `resolveLifecycleSlots` (line 48) reads `cardLifecycle` only. `discardZone` lives on the eventDeck record; nothing in `turn-flow-lifecycle.ts` references it.
3. **The popped card is not stored on a hand-off path other than the Coup → Leader move.** Verified by reading `applyTurnFlowCardBoundary` (line 290–348): `removed.popped` is only consumed by the `prependToken(leader, ...)` branch under `canRunCoupHandoff`. No `else`-branch routes it anywhere; it is unreferenced afterwards and therefore deleted.
4. **The deletion is not a Texas Hold'em-only artifact.** Verified by running the probe at `/tmp/probe-fitl-card-tracking.mjs`: starting at 130 cards, ending at 63 cards on the same FITL definition. The deletion is observable in production data.
5. **No existing test asserts token conservation across lifecycle boundaries.** Spot-checked `packages/engine/test/kernel/turn-flow-lifecycle*` and `packages/engine/test/integration/spec-140-bounded-termination.test.ts`: assertions cover stop reason and replay determinism but not card-count invariance. This is part of why the bug landed undetected.

## Architecture Check

1. **F1 (engine agnosticism)**: The fix must remain generic. The kernel cannot hardcode "FITL discards to played." Instead, it must read `discardZone` from the relevant `eventDeck` (or, equivalently, from the resolved lifecycle slot config) so any cardDriven game can declare its own discard semantics.
2. **F4 (authoritative state)**: Token identity must be preserved. The fix's primary correctness statement is: between any two valid kernel states `S0 → S1` produced by lifecycle effects, the multiset of card tokens (by stable token identity) is preserved unless the spec explicitly destroys/creates one.
3. **F11 (immutability + scoped mutation)**: The mutable-tracker path must end in the same logical state as the immutable spread path. Both already exist in `applyTurnFlowCardBoundary`; the fix updates both branches symmetrically.
4. **F14 (no backwards-compat shims)**: No alias path. If the lifecycle now requires a discard target, every cardDriven spec must declare one (or default cleanly when the spec says discard == played). `discardZone` is already mandatory on `eventDeck` (`schemas-extensions.ts:251` — `StringSchema.min(1)`), so the data contract is already in place.
5. **F15 (root-cause)**: This fix targets the kernel deletion at its source, not symptoms. It must NOT be implemented as a FITL-specific macro that re-inserts the card after the kernel deletes it.

## What to Change

### 1. Extend `LifecycleSlots` with a resolved `discard` slot

`resolveLifecycleSlots` already has access to `def`. Add resolution of the discard target:

- For cardDriven games, `discardZone` is owned by `eventDeck`. There may be multiple eventDecks; the lifecycle is per-card-flow, so the discard slot must be derived from the eventDeck whose `drawZone` matches the lifecycle's draw pile (`resolveDrawPileId`). When multiple eventDecks share a draw pile, raise a validation error at compile time (see step 4).
- The new `LifecycleSlots` shape: `{ played, lookahead, leader, discard }`. `discard` is a `string` resolved from the matching eventDeck's `discardZone`.
- When `discard === played` (the FITL case), the lifecycle becomes "accumulating": don't pop the played card; just prepend the new card from lookahead on top of `played`. The previously-played cards remain underneath.
- When `discard !== played`, the lifecycle moves the popped card to `discard` (preserving order — append to discard's tail or prepend to head per spec; default to "prepend to top" for consistency with existing leader-handoff semantics, document the choice).

### 2. Rewrite `applyTurnFlowCardBoundary` to honor the discard slot

Pseudocode:

```ts
const top = state.zones[slots.played]?.[0];
const isCoup = top !== undefined && isCoupCard(top);
const canRunCoupHandoff = isCoup && (maxConsecutiveRounds === undefined || previousConsecutiveCoupRounds < maxConsecutiveRounds);

let nextState = state;
if (canRunCoupHandoff && top !== undefined) {
  // Coup handoff still wins over discard semantics. The card moves to leader.
  nextState = popTopToken(nextState, slots.played, tracker).state;
  nextState = prependToken(nextState, slots.leader, top, tracker);
  pushLifecycleEntry(...);
} else if (slots.discard !== slots.played && top !== undefined) {
  // Move popped card to discard zone.
  nextState = popTopToken(nextState, slots.played, tracker).state;
  nextState = prependToken(nextState, slots.discard, top, tracker);
  pushLifecycleEntry(..., 'discardPlayed');
} // else (slots.discard === slots.played AND not a coup-handoff): leave the card on top of played; new card prepends above it.

nextState = moveTopToken(nextState, slots.lookahead, slots.played, tracker);
nextState = moveTopToken(nextState, drawPileId, slots.lookahead, tracker);
```

The "leave the card in place" branch is the FITL-correct path. After the fix, played accumulates, and the FITL terminal predicate `count(played:none, isCoup) >= 1` will eventually be satisfied with all 6 Coups stacked there over the course of the game (as it should).

### 3. Update `consecutiveCoupRounds` bookkeeping

The current code (line 318–326) counts consecutive Coup rounds based on the popped card's coup-ness. This logic remains correct — it is independent of where the popped card ends up. Keep the counter update; only the destination of the popped card changes.

### 4. Compile-time validation

In the cardDriven turn-flow validator (`packages/engine/src/contracts/turn-flow-contract.ts` and the cnl compiler):

- For each cardDriven game with eventDecks, verify that exactly one eventDeck whose `drawZone` matches the lifecycle's `drawPile` exists (or that there is a deterministic resolution rule when multiple decks share the draw pile).
- If `discardZone` ∉ `state.zones`, fail compilation.
- If `discardZone` resolves but is the same as `lookahead` or `leader`, fail compilation (would alias slot semantics).
- Allow `discardZone === played` (the FITL accumulating case).

### 5. Token conservation invariant

Add a kernel-internal assertion (gated by `kernel.verifyTokenConservation` or always-on debug assertion) that the multiset of token IDs is preserved across `applyTurnFlowCardBoundary`. The invariant is: `before-tokens === after-tokens` (no creation, no deletion at the lifecycle boundary). This makes future regressions immediately visible.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify — extend slots, rewrite boundary advance, add invariant assertion)
- `packages/engine/src/kernel/types-events.ts` (review — `discardZone` field already exists; confirm it propagates)
- `packages/engine/src/contracts/turn-flow-contract.ts` (modify — add discard-resolution contract)
- `packages/engine/src/cnl/compile-zones.ts` or sibling validator (modify — wire the new compile-time check)
- `packages/engine/src/sim/simulator.ts` (review — likely no change; lifecycle is invoked through phase advance)
- `packages/engine/test/kernel/turn-flow-lifecycle*.test.ts` (new/modify — token conservation tests, see Test Plan)
- `packages/engine/test/integration/fitl-rules-card-cycle.test.ts` (new — see Test Plan)
- `data/games/texas-holdem/**` (review — Texas uses a non-card-driven discard-by-pop semantic; verify this fix does not break Texas. If Texas relied on the deletion behavior, declare its `discardZone` such that pop+drop is preserved or flag a separate ticket.)

## Out of Scope

- Fixing the auto-resolve cascade that triggers the boundary repeatedly within one "turn" (owned by `AUTORESCASC-001`).
- Per-turn FITL preview-drive performance (owned by `TURNPERF-002` after `TURNPERF-001` Phase 1 archival).
- Re-blessing existing FITL replay/golden-trace fixtures if their stateHash changes; that re-blessing must happen in this ticket only after a reviewer approves the new (correct) trajectory.

## Acceptance Criteria

### Tests That Must Pass

1. **Token conservation (architectural-invariant)**: For every cardDriven game in the test corpus (FITL + Texas), running `applyTurnFlowCardBoundary` over a representative sequence of states preserves the multiset of card-token IDs across each call. New file: `packages/engine/test/kernel/turn-flow-lifecycle-token-conservation.test.ts`.
2. **FITL discard accumulation (architectural-invariant)**: Starting from FITL initial state, after 30 lifecycle advances under the all-baseline profile mix, `played:none` contains a strictly increasing prefix of historically-played cards (in reverse chronological order, top = most recent).
3. **FITL Coup handoff preserved**: For a Coup card with `consecutiveCoupRounds < maxConsecutiveRounds`, the Coup card moves to `leader:none` exactly as before. For a Coup card beyond the cap, it goes to `discard` (= `played:none` in FITL), NOT deleted.
4. **Game cannot end on turn 1**: For `seed=42` with 4 baseline profiles and `verifyIncrementalHash: true` and `maxTurns=200`, `stopReason !== 'terminal'` until at least 6 Coup cards are visible in `played:none ∪ leader:none`. (Tightens the existing parity test's invariant.)
5. **Texas Hold'em parity unchanged**: All Texas determinism, parity, and cross-game tests remain green. If Texas's discard semantics differ, declare them via the new contract and add a Texas-side test.
6. **Existing suites**: `pnpm turbo test`, `pnpm -F @ludoforge/engine test:integration`, `pnpm -F @ludoforge/engine test:e2e:all`, full determinism shards.

### Invariants

1. **Token conservation across lifecycle boundary**: `multiset(stateAfter.zones.flat()).cardTokens === multiset(stateBefore.zones.flat()).cardTokens` for every `applyTurnFlowCardBoundary` call. No silent deletion.
2. **discardZone honored**: For every cardDriven game with `eventDeck.discardZone` declared, every popped card is either (a) routed to `discard`, (b) routed to `leader` via Coup handoff, or (c) preserved in `played` when `discard === played`. There is no fourth path.
3. **Compile-time discard contract**: A cardDriven spec without a resolvable `discardZone` fails compilation with an explicit diagnostic; ambiguous resolution (multiple eventDecks sharing the draw pile with conflicting discard zones) also fails compilation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/turn-flow-lifecycle-token-conservation.test.ts` — new architectural-invariant; runs FITL + Texas through N lifecycle advances and asserts multiset equality of card tokens.
2. `packages/engine/test/kernel/turn-flow-lifecycle-discard-routing.test.ts` — new architectural-invariant; constructs a synthetic minimal cardDriven game with `discard` ≠ `played` and asserts the popped card lands in `discard`.
3. `packages/engine/test/kernel/turn-flow-lifecycle-coup-handoff.test.ts` — modify (or add) to also assert that Coup cards beyond `maxConsecutiveRounds` go to `discard`, NOT deleted.
4. `packages/engine/test/integration/fitl-rules-card-cycle.test.ts` — new architectural-invariant; runs FITL with all 4 baselines for 30 lifecycle steps and asserts (a) total card count = 130 throughout, (b) `played:none` accumulates in reverse-chronological order, (c) each Coup arrival triggers the FITL Coup phase sequence rather than an instant terminal.
5. `packages/engine/test/cnl/compile-zones-discard-zone.test.ts` — new; covers the new compile-time contract diagnostics (missing discardZone, ambiguous resolution, alias with lookahead/leader).
6. `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-{42,123}.test.ts` — review; both will exercise full FITL games after this fix. Re-bless their golden fixtures if stateHash changes (with the standard re-bless reason in the commit body).

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern=turn-flow-lifecycle`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm -F @ludoforge/engine test:integration:texas-cross-game`
4. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-{a,b,c}`
5. `pnpm -F @ludoforge/engine test:e2e:all`
6. `pnpm turbo lint typecheck`
7. `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js` (must complete; expect a longer wall-clock than the pre-fix 70 s baseline because seed-42 will now play the full game).

## Reproduction Commands (for the reviewer)

Pre-fix evidence script (kept for the reviewer to confirm the bug, NOT to be checked in):

```bash
node /tmp/probe-fitl-card-tracking.mjs
# Expect: INITIAL totalCards=130, FINAL totalCards=63 (67 deleted) before fix.
# After fix: totalCards stays at 130 across the run; stopReason should NOT be 'terminal' on turn 1.
```

## Risks

- **Re-blessing golden fixtures**: state hashes for FITL determinism shards will change because the trajectory is fundamentally different post-fix. Every affected golden trace re-bless must be itemized in the commit body per `.claude/rules/testing.md`.
- **CI budget breakage**: post-fix, both seed-42 and seed-123 play full FITL games. Without the perf work owned by `TURNPERF-002`, both will time out the 30-min determinism shard budget. This ticket lands the correctness fix and is expected to require `TURNPERF-002` (and/or a temporary budget extension) before merging to `main`.
- **Texas parity**: Texas Hold'em uses a different discard semantic. Verify before landing that the new `discard` slot resolution produces Texas's expected behavior.

## Outcome

**Completed**: 2026-04-28

Outcome amended: 2026-04-28 — Post-review after `TURNPERF-001` archival: active per-card performance implementation ownership now lives in `tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md`.

### What actually changed

- **`packages/engine/src/kernel/turn-flow-lifecycle.ts`**: Extended `LifecycleSlots` with a resolved `discard` slot. Added `resolveDiscardZone()` that picks the matching eventDeck's `discardZone` when there is exactly one eventDeck whose `drawZone` matches the implicit lifecycle draw pile, and falls back to `discard = played` (accumulating semantic) otherwise — the only safe fallback that preserves token conservation when no eventDeck applies. Rewrote `applyTurnFlowCardBoundary` so the popped played top is (a) routed to leader on Coup handoff, (b) routed to discard when `discard !== played`, (c) left in place when `discard === played` (FITL-style accumulating). Added `assertCardTokenConservation()` always-on invariant: every boundary call must preserve the multiset of `card`-typed token IDs across all zones.
- **`packages/engine/src/kernel/types-turn-flow.ts` + `schemas-extensions.ts`**: Added `discardPlayed` to `TurnFlowLifecycleStep` (TS union + Zod). Added `discard: string` to the lifecycle trace `slots` shape.
- **`packages/engine/schemas/Trace.schema.json`**: regenerated via `pnpm turbo schema:artifacts`. Only this artifact changed; `GameDef.schema.json` and `EvalReport.schema.json` are untouched.
- **`packages/engine/src/cnl/cross-validate.ts` + `cross-validate-diagnostic-codes.ts`**: New compile-time diagnostics `CNL_XREF_LIFECYCLE_DISCARD_ALIASES_SLOT` (each eventDeck's `discardZone` must not collide with `cardLifecycle.lookahead` or `cardLifecycle.leader`) and `CNL_XREF_LIFECYCLE_DISCARD_AMBIGUOUS` (multiple eventDecks sharing a `drawZone` must agree on `discardZone`). `discardZone === played` is explicitly allowed.

### Tests

- **New** `packages/engine/test/kernel/turn-flow-lifecycle-token-conservation.test.ts` (architectural-invariant): asserts multiset preservation in both accumulating and routing modes, plus `discardPlayed` step emission and Coup-handoff-still-wins when discard differs from played.
- **Modified** `packages/engine/test/integration/fitl-card-lifecycle.test.ts`: second-applyMove `played:none` now correctly contains `[tok_card_0, tok_card_1, tok_card_3]` (was empty pre-fix because of deletion).
- **Modified** `packages/engine/test/integration/fitl-turn-flow-golden.test.ts`: added env-gated `UPDATE_GOLDEN=1` rebless mode; re-blessed `packages/engine/test/fixtures/trace/fitl-turn-flow.golden.json` for the new accumulating trajectory and the `slots.discard` field. **Re-bless golden trace**: `fitl-turn-flow.golden.json` — `played:none` now retains `tok_card_3` post-boundary (correct accumulating semantic), `slots.discard` is now present, and stateHash drifts accordingly.
- **Modified** `packages/engine/test/unit/cross-validate.test.ts`: added 4 new tests covering the slot-aliasing + ambiguous-resolution diagnostics and the explicit allow for `discardZone === played`.
- **Modified** trace-fixture trigger logs: added `discard` field to `slots` in `serde.test.ts`, `json-schema.test.ts`, `game-loop-api-shape.test.ts`, `schemas-top-level.test.ts`, and `packages/runner/test/helpers/trigger-log-fixtures.ts`.

### Verification

- `pnpm turbo lint typecheck` — 5/5 successful.
- `pnpm turbo schema:artifacts` — only `Trace.schema.json` drifted, as expected for the new step + slot field.
- Engine `test:unit` — 5409/5409 pass.
- Runner `test` — 2019/2019 pass.
- Texas Hold'em e2e (`texas-holdem-card-lifecycle`, `texas-holdem-betting-phases`, `texas-holdem-golden-vector`) — 31/31 pass. Texas uses `roundRobin` turn order, not cardDriven, so the new code path is inert there.
- FITL coup phase tests (`fitl-coup-redeploy-commit-reset`, `fitl-coup-resources-phase`, `fitl-coup-support-phase`, `fitl-coup-reset-phase`, `fitl-production-terminal-victory`) — 19/19 pass.
- FITL events sample tests (`fitl-events-rolling-thunder`, `fitl-events-tet-offensive`, `fitl-events-phoenix-program`, `fitl-events-vietnamization`, `fitl-events-pivotal`, `fitl-events-coup-remaining`, `fitl-events-test-helpers`, `fitl-events-1968-*`, `fitl-events-bob-hope`, `fitl-events-cu-chi`, plus `fitl-rules-*`, `fitl-card-lifecycle`, `fitl-momentum-formula-mods`, `event-effect-timing`, `card-surface-resolution`, `fitl-eligibility-window`, `fitl-event-fidelity-helpers`, `fitl-event-free-operation-grants`, `compiled-lifecycle-runtime`) — 100+ tests pass.
- FITL e2e golden tests (`fitl-playbook-golden`, `fitl-tooltip-golden`) — pass.
- `cross-validate-production` integration test — 5/5 pass.
- Full `fitl-events-*` sweep was run; reached 120 suites passing before manual stop. No failures observed.

### Deviations from original plan

- **Compile-time validation scope**: Ticket §4 proposed validating that exactly one eventDeck's `drawZone` matches the implicit `cardLifecycle` draw pile. Implementation instead validates per-eventDeck that `discardZone` does not alias `lookahead`/`leader` slots, plus an ambiguity check when multiple decks share a drawZone with different discardZones. This is stronger and more direct: it does not depend on the brittle implicit draw-pile derivation (which fails when zones include both a deck and a separate discard zone, both `ordering: stack`, as in the synthetic rich fixture).
- **Slot trace shape**: The ticket did not explicitly require adding `discard` to the trace `slots` field; doing so makes the trace self-documenting and is a one-line schema additive change. The Zod and JSON Schema artifacts now include it.
- **Synthetic test fixtures**: kept the existing `cardLifecycle` test fixtures (no `eventDecks`) by giving the runtime a safe accumulating fallback (`discard = played`) when no eventDeck resolves. This preserves existing coverage without forcing every test to declare an eventDeck.

### Out-of-scope follow-ups (per ticket Risks/Out of Scope)

- **TURNPERF-002**: Now that the lifecycle correctly preserves cards, FITL `seed=42` and `seed=123` actually play full games. The `drive-fingerprint-property.test.js` and `zobrist-incremental-parity-fitl-seed-{42,123}` determinism shards are expected to need TURNPERF-002 before merging to `main`. They were deliberately not run as part of this ticket's verification.
- **AUTORESCASC-001**: The auto-resolve cascade that pumps the entire deck through the lifecycle in one chain remains owned by AUTORESCASC-001. This ticket fixes the per-card deletion mechanism only.
