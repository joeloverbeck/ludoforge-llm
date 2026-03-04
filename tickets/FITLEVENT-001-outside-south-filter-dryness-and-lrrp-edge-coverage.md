# FITLEVENT-001: DRY outside-South province targeting and expand LRRP edge coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — GameSpecDoc content/tests only
**Deps**: data/games/fire-in-the-lake/41-content-event-decks.md, data/games/fire-in-the-lake/20-macros.md, specs/29-fitl-event-card-encoding.md

## Problem

The LRRP unshaded implementation duplicates an inline Laos/Cambodia province filter and currently lacks explicit integration coverage for the `<3 available Irregulars` placement edge. This increases maintenance burden for future outside-South event cards and leaves a behavior edge under-tested.

## Assumption Reassessment (2026-03-04)

1. LRRP unshaded filter logic is currently inline in event content and not reused via macro/query helper.
2. LRRP integration tests cover standard 3-piece placement and shaded edge cases, but do not explicitly assert unshaded behavior when fewer than 3 Irregulars are available.
3. This change belongs in GameSpecDoc/macros and tests, not kernel logic.

## Architecture Check

1. Reusing a macro/filter helper is cleaner and reduces repeated event-card logic.
2. Keeps FITL-specific targeting rules in GameSpecDoc data layer, preserving agnostic GameDef/runtime.
3. No compatibility shim is needed; this is data-level cleanup plus additional coverage.

## What to Change

### 1. Extract reusable outside-South province filter helper

1. Add a macro/query helper in `20-macros.md` for Laos/Cambodia province targeting.
2. Replace LRRP inline filter usage with that helper.

### 2. Add missing LRRP unshaded edge-case test

1. Add integration coverage verifying unshaded places all available Irregulars when available count is 0, 1, or 2.
2. Keep free-Air-Strike grant behavior assertions intact.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-lrrp.test.ts` (modify)

## Out of Scope

- Query runtime/AST contract changes
- Runner/UI visual config updates

## Acceptance Criteria

### Tests That Must Pass

1. LRRP unshaded with fewer than 3 available Irregulars places all available outside South and still grants free Air Strike.
2. Existing LRRP shaded dedupe-shift behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Outside-South targeting logic for FITL event cards is authored in GameSpecDoc/macros.
2. Engine/runtime remains game-agnostic with no FITL-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-lrrp.test.ts` — add unshaded limited-availability scenarios.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-lrrp.test.js`
3. `pnpm -F @ludoforge/engine test`
