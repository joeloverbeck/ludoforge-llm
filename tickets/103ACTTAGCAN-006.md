# 103ACTTAGCAN-006: Migrate FITL and Texas Hold'em action definitions and agent profiles

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + tests
**Deps**: `archive/tickets/103ACTTAGCAN-003.md`, `archive/tickets/103ACTTAGCAN-005.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

Per FOUNDATIONS.md #14 (No Backwards Compatibility), all owned game specs must be migrated in the same change as the feature additions. FITL and Texas Hold'em action definitions must gain tags, and agent profiles must remove all `is<Action>` boolean candidate features in favor of `candidate.tag.*` refs.

## Assumption Reassessment (2026-04-01)

1. FITL actions at `data/games/fire-in-the-lake/30-rules-actions.md` — confirmed. 16+ actions, no tags.
2. FITL agents at `data/games/fire-in-the-lake/92-agents.md` — confirmed. 16 `is<Action>` candidate features (lines 48-148).
3. Texas Hold'em actions at `data/games/texas-holdem/30-rules-actions.md` — confirmed. No tags.
4. Texas Hold'em agents at `data/games/texas-holdem/92-agents.md` — confirmed. 5 `is<Action>` candidate features + `raiseAmount`.
5. `candidate.isPass` is used as an intrinsic in FITL (`92-agents.md` line 52) — must be replaced with `candidate.tag.pass`.
6. `raiseAmount` in Texas Hold'em is NOT an `is<Action>` feature — it's a `candidate.param.*` ref and must be preserved.

## Architecture Check

1. Foundation 14 compliance: migration is atomic with the feature addition.
2. Tags are semantic groupings — FITL actions get family tags (`insurgent-operation`, `coin-operation`, etc.).
3. Score terms that reference `feature.isRally` etc. must be rewritten to use `candidate.tag.rally` or family tags.
4. Behavioral equivalence must be proven: compiled agent profiles produce identical scoring for the same candidates.

## What to Change

### 1. Add tags to FITL action definitions

In `data/games/fire-in-the-lake/30-rules-actions.md`, add `tags` to each action. Tag taxonomy:
- `rally`, `march`, `attack`, `terror` → `[insurgent-operation]` + specific tags (`placement`, `movement`, `combat`, `destabilize`)
- `train`, `patrol`, `sweep`, `assault`, `govern`, `advise` → `[coin-operation]` + specific tags
- `tax`, `subvert`, `infiltrate` → `[insurgent-special-activity]` or `[coin-special-activity]`
- `bombard` → `[coin-special-activity]`
- `event` → `[event-play]`
- `pass` → `[pass]`

Exact tag assignments must be read from the spec and validated at implementation time against the actual action list.

### 2. Remove `is<Action>` candidate features from FITL agents

In `data/games/fire-in-the-lake/92-agents.md`:
- Remove all 16 `is<Action>` candidate feature definitions
- Replace score term refs (e.g., `{ ref: feature.isRally }`) with `{ ref: candidate.tag.rally }` or family-level tags
- Replace `{ ref: candidate.isPass }` with `{ ref: candidate.tag.pass }`

### 3. Add tags to Texas Hold'em action definitions

In `data/games/texas-holdem/30-rules-actions.md`, add tags to each action:
- `check`, `call`, `raise`, `allIn`, `fold` — appropriate tags
- Exact taxonomy determined at implementation time

### 4. Remove `is<Action>` candidate features from Texas Hold'em agents

In `data/games/texas-holdem/92-agents.md`:
- Remove `isCheck`, `isCall`, `isRaise`, `isAllIn`, `isFold` candidate features
- Replace score term refs with `candidate.tag.*` equivalents
- Preserve `raiseAmount` (it's a `candidate.param.*` ref, not an `is<Action>` feature)

### 5. Write integration tests

- End-to-end: FITL compiles with action tags and updated profiles
- End-to-end: Texas Hold'em compiles with action tags and updated profiles
- GameDef Zod validation passes for both
- FITL `GameDef.actionTagIndex` has expected entries
- Texas Hold'em `GameDef.actionTagIndex` has expected entries
- Behavioral equivalence: agent scoring produces identical rankings for a test state

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add tags)
- `data/games/fire-in-the-lake/92-agents.md` (modify — remove `is<Action>` features, update score terms)
- `data/games/texas-holdem/30-rules-actions.md` (modify — add tags)
- `data/games/texas-holdem/92-agents.md` (modify — remove `is<Action>` features, update score terms)
- `packages/engine/test/integration/action-tags-e2e.test.ts` (new)

## Out of Scope

- Adding new tag families beyond what the spec defines
- Changing action semantics or effects
- Runner-side changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles successfully with action tags
2. Texas Hold'em compiles successfully with action tags
3. Both GameDefs pass Zod schema validation
4. FITL `GameDef.actionTagIndex.byTag['insurgent-operation']` includes rally, march, attack, terror
5. No `is<Action>` candidate features remain in either game's compiled agent library
6. `raiseAmount` candidate feature preserved in Texas Hold'em
7. Golden fixtures match updated compilation output

### Invariants

1. FITL agent scoring behavior is equivalent before and after migration
2. Texas Hold'em agent scoring behavior is equivalent before and after migration
3. No game-specific logic introduced in engine code (Foundation 1)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/action-tags-e2e.test.ts` — cross-game action tag integration tests

### Commands

1. `pnpm -F @ludoforge/engine test:e2e` — end-to-end tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
