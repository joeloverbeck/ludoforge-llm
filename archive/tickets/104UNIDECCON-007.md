# 104UNIDECCON-007: Migrate FITL and Texas Hold'em agent profiles

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + tests
**Deps**: `archive/tickets/104UNIDECCON-005.md`, `archive/tickets/104UNIDECCON-006.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

Per FOUNDATIONS.md #14, all owned game specs must be migrated atomically with the type changes. FITL and Texas Hold'em agent profiles must replace `scoreTerms`/`completionScoreTerms` with `considerations` (adding `scopes` to each), and profile `use` sections must use `considerations`.

## Assumption Reassessment (2026-04-01)

1. FITL agents at `data/games/fire-in-the-lake/92-agents.md` — confirmed. Has `scoreTerms` (lines 79-170), `completionScoreTerms` (lines 179-198), and profiles with `use.scoreTerms`/`use.completionScoreTerms`.
2. Texas Hold'em agents at `data/games/texas-holdem/92-agents.md` — confirmed. Has `scoreTerms` (lines 80-112), no `completionScoreTerms`. Profile has `use.scoreTerms`.
3. FITL score terms use `candidate.tag.*` refs (from Spec 103) — confirmed.
4. Texas Hold'em score terms use `candidate.tag.*` refs (from Spec 103) — confirmed.

## Architecture Check

1. Foundation 14: migration atomic with type removal.
2. All FITL `scoreTerms` become `considerations` with `scopes: [move]`.
3. FITL `completionScoreTerms` become `considerations` with `scopes: [completion]`.
4. Texas Hold'em `scoreTerms` become `considerations` with `scopes: [move]` (no completion terms).
5. Profile `use.scoreTerms` + `use.completionScoreTerms` → `use.considerations` (merged list).
6. `completionGuidance` config removed from profiles.

## What to Change

### 1. Migrate FITL library

In `data/games/fire-in-the-lake/92-agents.md`:
- Rename `scoreTerms:` → `considerations:`
- Add `scopes: [move]` to each former score term
- Move `completionScoreTerms` entries into `considerations:` with `scopes: [completion]`
- Remove `completionScoreTerms:` section

### 2. Migrate FITL profiles

- `use.scoreTerms: [...]` + `use.completionScoreTerms: [...]` → `use.considerations: [...]` (merged)
- Remove `completionGuidance` if present

### 3. Migrate Texas Hold'em library

In `data/games/texas-holdem/92-agents.md`:
- Rename `scoreTerms:` → `considerations:`
- Add `scopes: [move]` to each consideration

### 4. Migrate Texas Hold'em profiles

- `use.scoreTerms: [...]` → `use.considerations: [...]`

### 5. Write integration tests

- FITL compiles with considerations
- Texas Hold'em compiles with considerations
- Both pass Zod validation
- Behavioral equivalence: same seed, same state → same move selection

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `data/games/texas-holdem/92-agents.md` (modify)
- `packages/engine/test/integration/considerations-e2e.test.ts` (new)

## Out of Scope

- Adding new considerations or scopes
- Changing scoring weights or behavior
- Runner changes

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles with considerations (no diagnostics)
2. Texas Hold'em compiles with considerations (no diagnostics)
3. Both GameDefs pass Zod schema validation
4. No `scoreTerms` or `completionScoreTerms` in compiled output
5. FITL completion-scoped considerations present in compiled library
6. Behavioral equivalence: move selection identical before and after migration
7. Golden fixtures match updated output

### Invariants

1. FITL scoring behavior unchanged
2. Texas Hold'em scoring behavior unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/considerations-e2e.test.ts` — cross-game consideration integration tests

### Commands

1. `pnpm -F @ludoforge/engine test:e2e` — end-to-end
2. `pnpm -F @ludoforge/engine test` — full suite
3. `pnpm turbo typecheck`

## Outcome

Completed: 2026-04-01

- Migrated FITL and Texas authored agent docs from `scoreTerms`/`completionScoreTerms` to unified `considerations`, adding explicit scopes and removing FITL authored `completionGuidance`.
- Added `packages/engine/test/integration/considerations-e2e.test.ts` to verify authored migration, compiled output shape, and fixed-seed behavioral equivalence for FITL and Texas.
- Regenerated the owned production policy catalog and summary golden fixtures to the unified consideration shape and updated profile/catalog fingerprints.
- Adjusted the behavioral equivalence assertion to compare fixed-seed move-selection behavior and trace semantics rather than raw profile fingerprints, because the migration intentionally changes artifact identity while preserving decisions.

Verification:

- `pnpm -F @ludoforge/engine typecheck`
- `pnpm -F @ludoforge/engine build`
- `node --test "dist/test/integration/considerations-e2e.test.js" "dist/test/unit/policy-production-golden.test.js" "dist/test/integration/cross-validate-production.test.js" "dist/test/integration/parse-validate-full-spec.test.js"` from `packages/engine`
