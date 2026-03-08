# FITLEVECARENC-023: Card-90 Canonical Two-Target Relocation and Runtime Regression Coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — FITL data shape migration + integration behavior assertions
**Deps**: tickets/FITLEVECARENC-022-enable-dependent-target-selectors-in-event-card-compilation.md, archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

`card-90` currently embeds destination selection (`chooseOne`) inside target-local `effects` instead of expressing source/destination as declarative target declarations. This shape is harder to reason about and currently lacks dedicated runtime behavior regression tests for relocation semantics.

## Assumption Reassessment (2026-03-08)

1. `card-90` unshaded currently defines only `$sourceSpace` as target and performs destination selection via inner effect-level `chooseOne`. Verified in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. This encoding was likely constrained by current compiler selector-scope limitations and should be migrated once dependent selectors are supported. Verified against compiler code path.
3. Existing integration checks for card-90 are primarily structural (compiled shape/budget checks) and do not fully assert runtime relocation flow (source selection, destination selection, piece movement constraints). Verified.

## Architecture Check

1. Representing relocation as two declarative targets (`$sourceSpace`, `$destSpace`) is cleaner, more compositional, and easier to validate than imperative in-effect selection.
2. This keeps game-specific intent in GameSpecDoc while engine runtime remains generic.
3. No backward-compatibility path: fully adopt canonical target declaration model for this card.

## What to Change

### 1. Re-encode card-90 unshaded with canonical two-target declaration

Replace inner `chooseOne` with explicit target declarations that model source then destination selection.

### 2. Strengthen runtime integration tests for card-90

Add targeted tests that execute card-90 and assert:
- decision sequence shape for source/destination
- only COIN pieces (US/ARVN) are moved
- movement count limits remain correct
- shaded path redeploys to faction-appropriate available zone

### 3. Keep card text and gameplay intent unchanged

Migration is representational/architectural; no rule rebalance.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-full-deck.test.ts` (modify if needed for regression coverage)

## Out of Scope

- Other card migrations unless required by shared canonical contract
- New engine mechanics beyond selector-scope dependency
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Card-90 unshaded is encoded with explicit source/destination targets and no inner selector effect workaround.
2. Dedicated runtime tests verify deterministic relocation semantics for unshaded and shaded paths.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event intent remains declarative in data; selection mechanics are represented as target declarations.
2. Runtime behavior remains game-agnostic and driven by generic target/effect execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — add contract assertions for canonical two-target card-90 shape.
2. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — remove fallback checks and assert canonical payload location for card-90.
3. `packages/engine/test/integration/fitl-events-full-deck.test.ts` — regression guard to ensure no execution drift after migration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-full-deck.test.js`
4. `pnpm -F @ludoforge/engine test`
