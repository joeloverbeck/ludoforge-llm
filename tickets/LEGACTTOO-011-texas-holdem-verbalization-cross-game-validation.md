# LEGACTTOO-011: Texas Hold'em Verbalization + Cross-Game Validation Golden Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + test fixtures only
**Deps**: LEGACTTOO-002, LEGACTTOO-007, LEGACTTOO-010

## Problem

Texas Hold'em needs its own complete verbalization block, and cross-game property tests must validate that the tooltip pipeline works correctly for both games simultaneously — proving engine-agnosticism. Without this, we only have FITL coverage and no confidence that the pipeline generalizes.

## Assumption Reassessment (2026-03-06)

1. Texas Hold'em game spec files live at `data/games/texas-holdem/` with files `00-metadata.md` through `90-terminal.md` plus `visual-config.yaml`.
2. LEGACTTOO-002 will create `data/games/texas-holdem/05-verbalization.md` with a starter block.
3. Texas Hold'em has 2-10 players, card tokens, chip variables (pot, stack, bet), betting actions (raise, call, fold, check, all-in), and dealing/community card stages.

## Architecture Check

1. Pure game data authoring + test fixtures — no engine code changes.
2. Cross-game validation proves engine-agnosticism: same pipeline handles FITL (wargame) and Hold'em (card game) without game-specific code.
3. Property tests are the capstone validation for the entire Spec 55 feature set.

## What to Change

### 1. Complete `data/games/texas-holdem/05-verbalization.md`

**Labels section**:
- Player labels: generic `player1` through `player10`, or position names (`dealer`, `smallBlind`, `bigBlind`)
- Card-related: `deck` → "Deck", `communityCards` → "Community Cards", `hand` → "Hand"
- Chip variables: `pot` → "Pot", `stack` → "Stack", `currentBet` → "Current Bet"
- Zones: `deck-main` → "Deck", `community` → "Community", `hand-*` → "Hand"

**Stages section**:
- `dealHands` → "Deal hands"
- `bettingRound` → "Betting round"
- `dealCommunity` → "Deal community cards"
- `showdown` → "Showdown"

**Macros section** (if Hold'em has compiled macros):
- Summary for each macro (e.g., `dealFlop` → { class: "deal", summary: "Deal 3 community cards" })

**Sentence plans section**:
- `addVar.pot` → {"+N": "Add N to pot"}
- Betting patterns

**Suppress patterns section**:
- Hold'em-specific telemetry: `*Count`, `*Tracker`, `__*`, `temp*`, round tracking vars

### 2. Create cross-game property tests

**Determinism**: For each game, compile spec → describe all actions 100 times → assert identical RuleCards.

**Completeness**: For each game, every TooltipMessage in every action's RuleCard is either realized or suppressed — no unrealized messages.

**Trace preservation**: Every sentence in every RuleCard step has a non-empty `astPath`.

**Suppression coverage**: No `*Count`, `*Tracker`, `__*` variable names appear in any tooltip output for either game.

**Bounded output**: No RuleCard in either game exceeds 30 lines.

### 3. Golden test for Hold'em Raise

Verify full pipeline: compile Hold'em spec → normalize Raise action → plan → realize → compare to expected English.

## Files to Touch

- `data/games/texas-holdem/05-verbalization.md` (modify — complete verbalization content)
- `packages/engine/test/integration/tooltip-golden.test.ts` (modify — add Hold'em golden tests)
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
8. Property: bounded output — no RuleCard exceeds 30 lines (both games).
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No engine code changes in this ticket.
2. Texas Hold'em game spec remains valid and compilable.
3. The tooltip pipeline produces correct output for both games using the same engine code — no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-golden.test.ts` — add Hold'em golden tests (Raise, Call, Fold, Check).
2. `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` — property tests: determinism, completeness, trace preservation, suppression coverage, bounded output. Runs against both FITL and Hold'em compiled specs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test` (full suite — both engine and runner)
