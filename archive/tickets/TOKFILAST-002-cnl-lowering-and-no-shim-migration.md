# TOKFILAST-002: CNL Lowering + No-Shim Migration To Canonical Token Filters

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `cnl/compile-conditions`, `cnl/compile-effects`, diagnostics, production GameSpecDoc migration
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, specs/29-fitl-event-card-encoding.md

## Problem

The engine AST/runtime now has a canonical `TokenFilterExpr` contract, but CNL authoring still accepts legacy predicate arrays on several token-filter surfaces. That dual contract invites DSL drift, weakens diagnostics, and keeps migration debt in production data.

## Assumption Reassessment (2026-03-05)

1. `compile-conditions.ts` still accepts token query filters only as arrays for `tokensInZone`, `tokensInMapSpaces`, and `tokensInAdjacentZones`.
2. `compile-effects.ts` still accepts `reveal.filter` and `conceal.filter` only as arrays.
3. Current diagnostics for these surfaces still advertise array syntax (`Array<{ prop, op, value }>`), steering authors toward legacy shape.
4. FITL production content still contains legacy filter arrays in these files: `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, and `data/games/fire-in-the-lake/90-terminal.md`.
5. `game-spec-doc.ts` does not own a typed token-filter input schema for these raw authoring nodes, so migration work belongs in lowerers + data/tests, not in per-game schema hardcoding.

## Architecture Check

1. One authoring contract (`TokenFilterExpr`) across query/effect surfaces is cleaner, more robust, and more extensible than retaining array-only islands.
2. No-shim migration is the right long-term architecture: reject legacy array input at compiler boundaries and fix data/tests instead of aliasing old syntax.
3. Migration remains engine-agnostic because behavior stays encoded in `GameSpecDoc` data; no game-specific branches are introduced.

## What to Change

### 1. Rework token filter lowering to expression-based authoring contract

Update `compile-conditions.ts` and `compile-effects.ts` to lower token filters from canonical expression nodes (`TokenFilterExpr`) rather than array-only payloads.

### 2. Remove array-based lowering and diagnostics guidance

Delete legacy array-lowering paths for affected query/effect token filters and update diagnostics/help text to describe canonical expression filter syntax only.

### 3. Migrate FITL production data to canonical filter syntax

Migrate all token filter sites in:
- `data/games/fire-in-the-lake/20-macros.md`
- `data/games/fire-in-the-lake/30-rules-actions.md`
- `data/games/fire-in-the-lake/41-content-event-decks.md`
- `data/games/fire-in-the-lake/90-terminal.md`

### 4. Update and strengthen compiler tests for strict boundary behavior

Update unit/integration tests so canonical expression syntax passes and legacy array syntax is rejected deterministically on all migrated surfaces.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify if expectations depend on raw legacy shape)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `data/games/fire-in-the-lake/90-terminal.md` (modify)

## Out of Scope

- Visual presentation changes (`visual-config.yaml`).
- Per-card behavior redesign beyond syntax migration.
- Runtime alias/compatibility layers for legacy token filter arrays.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler accepts canonical token filter expression syntax for all affected query/effect surfaces.
2. Compiler rejects legacy array token filter syntax with deterministic diagnostics for these surfaces.
3. FITL production spec compiles with zero token-filter-shape errors after migration.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No compatibility shim remains for legacy token filter arrays in compiler lowering.
2. Game-specific behavior remains authored in GameSpecDoc only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — positive/negative lowering tests for canonical token filter expression syntax.
2. `packages/engine/test/unit/compile-effects.test.ts` — reveal/conceal token filter expression lowering and legacy-array rejection coverage.
3. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — production compile remains green after migration.
4. `packages/engine/test/integration/fitl-event-macro-dryness.test.ts` — macro contracts remain intact after syntax migration.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-05
- What changed:
  - Replaced legacy array-only token-filter lowering with strict `TokenFilterExpr` lowering in `compile-conditions.ts` for `tokensInZone`, `tokensInMapSpaces`, and `tokensInAdjacentZones`.
  - Replaced legacy array-only token-filter lowering with strict `TokenFilterExpr` lowering in `compile-effects.ts` for `reveal.filter` and `conceal.filter`.
  - Added explicit no-shim rejection coverage for legacy array filter input on both query and effect surfaces.
  - Migrated FITL production data token filters to canonical expression syntax in:
    - `data/games/fire-in-the-lake/20-macros.md`
    - `data/games/fire-in-the-lake/30-rules-actions.md`
    - `data/games/fire-in-the-lake/41-content-event-decks.md`
    - `data/games/fire-in-the-lake/90-terminal.md`
  - Updated affected integration and conformance fixtures/tests to assert canonical expression filter shapes.
- Deviations from original plan:
  - Scope expanded beyond the original three FITL files after reassessment: `90-terminal.md` also contained legacy token filter arrays and had to be migrated to keep production compilation green.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:integration` passed (134/134).
  - `pnpm -F @ludoforge/engine test` passed (397/397).
  - `pnpm -F @ludoforge/engine lint` passed.
