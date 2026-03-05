# TOKFILAST-002: CNL Lowering + No-Shim Migration To Canonical Token Filters

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `cnl/compile-conditions`, diagnostics, production GameSpecDoc migration
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, specs/29-fitl-event-card-encoding.md

## Problem

Even with a canonical runtime token-filter expression AST, CNL lowering must provide a strict authoring contract and deterministic diagnostics. Without a full migration and strict compiler boundary, old predicate-array patterns will persist and reintroduce DSL drift.

## Assumption Reassessment (2026-03-05)

1. `compile-conditions.ts` currently lowers token query `filter` only from arrays (`Array<{ prop, op, value }>`).
2. Missing-capability diagnostics currently push authors toward array-only token filtering.
3. FITL production data has many token filter instances and must be migrated in lockstep if no compatibility shims are allowed.

## Architecture Check

1. Compiler and runtime contracts must match exactly; divergence creates hidden behavior gaps and brittle authoring.
2. Migration belongs in GameSpecDoc data, not engine hardcoding, preserving agnostic runtime boundaries.
3. Final implementation removes old filter-array lowering paths instead of keeping compatibility branches.

## What to Change

### 1. Rework token filter lowering to expression-based contract

Update `compile-conditions.ts` to lower token query/effect filters from expression nodes (boolean composed token predicates), including high-quality diagnostics and source-map fidelity.

### 2. Remove array-based lowering and diagnostics guidance

Delete legacy array-based lowering branches and update diagnostics/help text to only describe canonical expression filter syntax.

### 3. Migrate FITL production data to canonical filter syntax

Perform repository-wide migration for token filter sites in `data/games/fire-in-the-lake/*` and any affected fixtures so compilation remains green with the new strict contract.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify diagnostics text where token-filter shape is referenced)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify, if token filter grammar contracts are typed there)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if affected)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)

## Out of Scope

- Visual presentation changes (`visual-config.yaml`).
- Per-card behavior redesign beyond syntax migration.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler accepts canonical token filter expression syntax and rejects legacy array syntax with deterministic diagnostics.
2. FITL production spec compiles with zero token-filter-shape errors after migration.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No compatibility shim remains for legacy token filter arrays in compiler lowering.
2. Game-specific behavior remains authored in GameSpecDoc only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — positive/negative lowering tests for new token filter syntax.
2. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — ensures production spec compiles with migrated syntax.
3. `packages/engine/test/integration/fitl-event-macro-dryness.test.ts` — ensure migration did not regress macro contracts.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test`
