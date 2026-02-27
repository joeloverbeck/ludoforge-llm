# FITLEVTCLEAN-001: Standardize moveToken `to` field format across event decks

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data file + invariant test
**Deps**: None

## Problem

The `moveToken` effect's `to` field uses two different formats for static zone references across `41-content-event-decks.md`:

- **Bare string**: `to: out-of-play-US:none`, `to: leader:none`
- **Wrapped**: `to: { zoneExpr: available-NVA:none }`

Both compile today, but the inconsistency obscures canonical authoring style and makes audits harder.

Note: `moveAll` legitimately uses bare strings (`from`/`to` are always static), so this ticket only targets `moveToken`.

## Assumption Reassessment (2026-02-27)

1. There are currently **two** bare-string `moveToken.to` instances in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. The previous ticket draft incorrectly cited line ~769 (Gulf of Tonkin shaded), which is `moveAll`, not `moveToken`.
3. Dynamic zone references already use `{ zoneExpr: ... }`; static references are the only inconsistent shape.
4. Existing tests validate compilation/runtime behavior, but they do not explicitly enforce this authoring invariant in source Markdown.

## Architecture Check

1. Standardizing `moveToken.to` on `{ zoneExpr: ... }` is cleaner than mixed forms because it encodes intent (`zone expression`) in one explicit shape.
2. This preserves agnostic engine boundaries by keeping the change in game data and test coverage, not compiler branching.
3. Add a narrow invariant test that fails on new bare-string `moveToken.to` entries in the FITL event deck source.

## What to Change

### 1. Standardize all `moveToken.to` bare strings to `{ zoneExpr: ... }`

In `data/games/fire-in-the-lake/41-content-event-decks.md`, replace each bare `moveToken.to` zone with wrapped form.

Current known instances:
- `to: out-of-play-US:none` (card-2 shaded)
- `to: leader:none` (card-102 shaded)

### 2. Add invariant test coverage

Add/strengthen tests to enforce that `moveToken.to` is not authored as a bare string in the FITL event deck markdown source.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/` (add/modify targeted invariant test)

## Out of Scope

- `moveAll` effects (bare strings remain valid there)
- Compiler/schema behavior changes for `moveToken` parsing
- Other game data files (Texas Hold'em, etc.)

## Acceptance Criteria

### Tests That Must Pass

1. New/updated invariant test fails if any bare `moveToken.to` appears in FITL event deck source.
2. Existing engine suite passes after normalization.

### Invariants

1. Every `moveToken.to` field in `41-content-event-decks.md` uses `{ zoneExpr: ... }` form.
2. No engine/compiler code path changes required.

## Test Plan

### New/Modified Tests

1. Add/modify one test asserting no bare-string `moveToken.to` remains in FITL event deck source.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/<new-or-updated-test-file>`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Normalized all bare `moveToken.to` values in `data/games/fire-in-the-lake/41-content-event-decks.md` to `{ zoneExpr: ... }`.
  - Added invariant coverage in `packages/engine/test/integration/fitl-production-data-scaffold.test.ts` to enforce canonical `moveToken.to` authoring shape.
  - Updated `packages/engine/test/integration/fitl-events-1968-vc.test.ts` assertion to match canonical `moveToken.to.zoneExpr` shape.
- **Deviations from original plan**:
  - Original draft claimed no test changes were needed; implementation added/updated tests to enforce the invariant explicitly.
  - Original draft miscounted affected entries; actual count was two bare `moveToken.to` entries (not one/three).
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-production-data-scaffold.test.ts packages/engine/test/integration/fitl-events-1968-vc.test.ts` passed.
  - `pnpm -F @ludoforge/engine test` passed (299/299).
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
