# LEGACTTOO-011: Texas Hold'em Verbalization + Cross-Game Validation Golden Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + test fixtures only
**Deps**: LEGACTTOO-002, LEGACTTOO-007, LEGACTTOO-010

## Problem

Texas Hold'em needs its own complete verbalization block, and cross-game property tests must validate that the tooltip pipeline works correctly for both games simultaneously — proving engine-agnosticism. Without this, we only have FITL coverage and no confidence that the pipeline generalizes.

## Assumption Reassessment (2026-03-07)

1. Texas Hold'em game spec files live at `data/games/texas-holdem/` with files `00-metadata.md` through `90-terminal.md`.
2. LEGACTTOO-002 (archived) created `data/games/texas-holdem/05-verbalization.md` with a minimal starter block (3 labels, 1 stage, 1 macro, 1 sentence plan, 3 suppress patterns).
3. Texas Hold'em has 2-10 players, card tokens, chip variables (`pot`, `chipStack`, `currentBet`, `streetBet`, `totalBet`), betting actions (`fold`, `check`, `call`, `raise`, `allIn`), and phases (`hand-setup`, `preflop`, `flop`, `turn`, `river`, `showdown`, `hand-cleanup`).
4. The existing integration test file is `tooltip-pipeline-integration.test.ts` (not `tooltip-golden.test.ts`).

## Architecture Check

1. Pure game data authoring + test fixtures — no engine code changes.
2. Cross-game validation proves engine-agnosticism: same pipeline handles FITL (wargame) and Hold'em (card game) without game-specific code.
3. Property tests are the capstone validation for the entire Spec 55 feature set.

## What to Change

### 1. Complete `data/games/texas-holdem/05-verbalization.md`

**Labels section**:
- Action IDs: `fold` → "Fold", `check` → "Check", `call` → "Call", `raise` → "Raise", `allIn` → "All-In"
- Zones (compiled form): `"deck:none"` → "Deck", `"community:none"` → "Community Cards", `"muck:none"` → "Muck", `"burn:none"` → "Burn Pile"
- Global variables: `pot` → "Pot", `currentBet` → "Current Bet", `lastRaiseSize` → "Last Raise Size", `dealerSeat` → "Dealer Seat", `smallBlind` → "Small Blind", `bigBlind` → "Big Blind", `ante` → "Ante", `blindLevel` → "Blind Level", `handsPlayed` → "Hands Played", `handPhase` → "Hand Phase", `activePlayers` → "Active Players"
- Per-player variables: `chipStack` → "Chip Stack", `streetBet` → "Street Bet", `totalBet` → "Total Bet", `showdownScore` → "Showdown Score"
- Boolean state: `handActive` → "Hand Active", `allIn` → "All-In", `eliminated` → "Eliminated"

**Stages section** (actual phase IDs):
- `hand-setup` → "Hand setup"
- `preflop` → "Pre-flop"
- `flop` → "Flop"
- `turn` → "Turn"
- `river` → "River"
- `showdown` → "Showdown"
- `hand-cleanup` → "Hand cleanup"

**Macros section** (actual macro IDs from `20-macros.md`):
- `deal-community` → { class: "deal", summary: "Deal community cards" }
- `hand-rank-score` → { class: "scoring", summary: "Evaluate best 5-card hand" }
- `post-forced-bets-and-set-preflop-actor` → { class: "betting", summary: "Post blinds and antes" }
- `find-next-to-act` → { class: "betting", summary: "Find next player to act" }
- `reset-reopen-state-for-live-seats` → { class: "betting", summary: "Reset action flags for live players" }
- `reset-reopen-state-for-eligible-actors` → { class: "betting", summary: "Reopen action for eligible players after raise" }
- `betting-round-completion` → { class: "betting", summary: "Check if betting round is complete" }
- `advance-after-betting` → { class: "betting", summary: "Advance to next phase after betting" }
- `eliminate-busted-players` → { class: "cleanup", summary: "Eliminate players with zero chips" }
- `escalate-blinds` → { class: "cleanup", summary: "Increase blind levels" }
- `mark-preflop-big-blind-acted` → { class: "betting", summary: "Mark big blind option as exercised" }
- `find-next-non-eliminated` → { class: "utility", summary: "Find next non-eliminated player" }
- `award-uncontested-pot` → { class: "scoring", summary: "Award pot to last remaining player" }
- `distribute-contested-pots` → { class: "scoring", summary: "Distribute pot at showdown" }

**Sentence plans section**:
- `addVar.pot` → { "+N": "Add N to pot" }
- `transferVar.chipStack` → { "-N": "Pay N from stack" }

**Suppress patterns section**:
- `*Count`, `*Tracker`, `__*`, `temp*`, `actingPosition`, `bettingClosed`, `preflopBigBlind*`, `oddChipRemainder`, `actedSinceLastFullRaise`, `seatIndex`

### 2. Create cross-game property tests

**Determinism**: For each game, compile spec → describe all actions 100 times → assert identical RuleCards.

**Completeness**: For each game, every TooltipMessage in every action's RuleCard is either realized or suppressed — no unrealized messages.

**Trace preservation**: Every sentence in every RuleCard step has a non-empty `astPath`.

**Suppression coverage**: No `*Count`, `*Tracker`, `__*` variable names appear in any tooltip output for either game.

**Bounded output**: No RuleCard in either game exceeds 50 content lines (synopsis + step lines, excluding headers and modifiers).

### 3. Golden test for Hold'em Raise

Verify full pipeline: compile Hold'em spec → normalize Raise action → plan → realize → compare to expected English.

## Files to Touch

- `data/games/texas-holdem/05-verbalization.md` (modify — complete verbalization content)
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify — add Hold'em golden tests)
- `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` (new — property tests across both games)

## Out of Scope

- FITL verbalization authoring (LEGACTTOO-010)
- Engine code changes (all engine work is in prior tickets)
- Runner UI changes (LEGACTTOO-009)
- Adding new Hold'em actions or macros

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em game spec compiles successfully with complete verbalization block.
2. Golden test: Raise → synopsis matches "Raise -- Choose raise amount" (or similar).
3. Golden test: Call, Fold, Check → synopses match expected English.
4. Property: determinism — same GameDef → same RuleCard (100 iterations, both games).
5. Property: completeness — every TooltipMessage realized or suppressed (both games).
6. Property: trace preservation — every step sentence has non-empty `astPath` (both games).
7. Property: suppression coverage — no telemetry leaks in either game's tooltip output.
8. Property: bounded output — no RuleCard exceeds 50 content lines (both games).
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No engine code changes in this ticket.
2. Texas Hold'em game spec remains valid and compilable.
3. The tooltip pipeline produces correct output for both games using the same engine code — no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — add Hold'em golden tests (Raise, Call, Fold, Check).
2. `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` — property tests: determinism, completeness, trace preservation, suppression coverage, bounded output. Runs against both FITL and Hold'em compiled specs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test` (full suite — both engine and runner)
