# GAMESPECAUTH-001: Remove predicate-alias shorthand from authored GameSpecDoc token/query filters

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler boundary hardening, authored-data migration, regression coverage
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

This ticket originally assumed authored `GameSpecDoc` could not express canonical token-filter expressions and needed broader lowering support. That assumption is no longer true. The current engine already supports canonical token-filter expressions and runtime-selected membership operands.

The real architectural issue is the opposite: `compileGameSpecToGameDef(...)` currently applies a compiler-wide `normalizePredicateAliasShorthand(...)` pass that silently rewrites legacy authored shorthand such as `{ prop: faction, eq: ARVN }` into canonical `{ prop: faction, op: eq, value: ARVN }`. This creates a dual authoring contract, contradicts stricter lowerer/unit-test expectations, and keeps production FITL data on a compatibility path that should not exist.

## Assumption Reassessment (2026-03-09)

1. Canonical token-filter expressions are already implemented in the current architecture. `compile-conditions.ts` accepts boolean token-filter trees plus canonical `{ prop, op, value }` predicate leaves, and the runtime evaluates them generically.
2. Runtime-selected membership operands are already supported for canonical predicate operators. Current unit coverage already proves `binding` / `grantContext` support for token-filter and `assetRows` membership predicates.
3. The current FITL production spec still compiles with legacy predicate shorthand only because `packages/engine/src/cnl/compiler-core.ts` normalizes alias-authored predicates before the lowerers run.
4. This means the active discrepancy is not missing expressive power. It is an unwanted backwards-compatibility shim plus authored production/test data that still depends on it.
5. Corrected scope: enforce a single canonical authored predicate contract at the top-level compiler boundary and migrate affected authored data/tests to that contract.

## Architecture Check

1. The originally proposed change is less beneficial than the current architecture because the engine already has the cleaner design: canonical token-filter expressions plus generic predicate evaluation.
2. The more beneficial change is removing the alias-normalization shim. A silent pre-lowering rewrite weakens contract clarity, hides invalid authored input, and makes lowerer behavior differ from top-level compiler behavior.
3. The correct long-term architecture is one canonical authored predicate shape everywhere:
   - token/query filters use `{ prop, op, value }`
   - `assetRows.where` uses `{ field, op, value }`
   - boolean composition stays explicit via the existing expression AST
4. No backwards-compatibility aliases should remain. If authored data is invalid under the canonical contract, the data should be fixed.
5. This remains fully game-agnostic: the engine only enforces canonical authoring and lowering contracts, while game-specific behavior stays in `GameSpecDoc` data.

## What to Change

### 1. Remove global predicate-alias normalization

Delete the compiler-core compatibility pass that rewrites `{ prop, eq }` / `{ field, eq }` shorthand into canonical predicate objects before compilation.

### 2. Migrate authored data on the compile path

Rewrite affected production FITL authored predicate shorthand to the canonical `op/value` form in the files that are actually compiled by `compileProductionSpec()`.

### 3. Add top-level compiler-boundary regression coverage

Add or strengthen tests so alias shorthand is rejected when compiling a full `GameSpecDoc`, not just when calling lowerers directly.

### 4. Keep runtime and AST architecture unchanged

Do not rework the already-correct token-filter expression/runtime architecture. The change should be boundary hardening plus data migration, not a new filter-language feature.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify or add equivalent compiler-boundary coverage)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify only if assertions need tightening)
- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)

## Out of Scope

- Adding any new token-filter expression syntax
- Preserving or extending alias shorthand compatibility
- FITL behavior redesign beyond canonical authored-shape migration
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. `compileGameSpecToGameDef(...)` rejects authored predicate shorthand aliases such as `{ prop: faction, eq: ARVN }` and `{ field: phase, eq: early }`.
2. FITL production data compiles successfully after migration with canonical `op/value` predicate authoring only.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical authored predicate contract exists at the compiler boundary; lowerers and top-level compilation do not disagree.
2. No new aliasing or compatibility shim is introduced.
3. `GameDef` and runtime predicate semantics remain game-agnostic and otherwise unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — verify top-level compiler rejection of shorthand predicate aliases.
2. `packages/engine/test/unit/compile-conditions.test.ts` — existing lowerer-level rejection remains intact.
3. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — FITL production compile remains green after canonical data migration.
4. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — regression proof that the motivating card still compiles and behaves correctly after canonicalization.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
3. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-production-data-compilation.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - Removed the top-level compiler compatibility pass that normalized predicate-alias shorthand before lowering.
  - Migrated compiled FITL authored data from shorthand predicate aliases to canonical `op/value` predicates.
  - Added compiler-boundary regression coverage so shorthand aliases now fail when compiling a full `GameSpecDoc`.
  - Updated integration assertions that still assumed authored shorthand survived compilation boundaries.
- Deviations from original plan:
  - The original ticket premise was wrong. No new token-filter language support was needed because the canonical AST/runtime architecture was already present.
  - The implemented change narrowed scope to architectural cleanup: remove aliasing, harden the compiler boundary, and canonicalize authored data.
  - During verification, one unrelated lint blocker in an integration test was also fixed so the required lint run could pass.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-production-data-compilation.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-rvn-leader.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
