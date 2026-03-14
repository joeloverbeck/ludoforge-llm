# 62CONPIESOU-003: Validation diagnostics for `prioritized` query in GameDef

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel validation
**Deps**: 62CONPIESOU-001 (type must exist)

## Problem

`validate-queries.ts` validates every `OptionsQuery` in a compiled GameDef. Without a `case 'prioritized'` handler, the validator will either skip it silently or throw on an unrecognized query kind. The spec (requirement D) mandates specific diagnostics for empty tiers and missing qualifier properties.

## Assumption Reassessment (2026-03-14)

1. `validateOptionsQuery` in `packages/engine/src/kernel/validate-queries.ts` has a case per query kind (see `case 'concat':` at line 263). Confirmed.
2. The `concat` case validates non-empty sources and recurses into each source. `prioritized` validation is structurally identical plus `qualifierKey` checks.
3. Spec requirement D: reject empty `tiers` (error), warn on `qualifierKey` referencing a property not present on token types (warning, not error).

## Architecture Check

1. Follows existing validation pattern exactly — add a new case that recurses into tiers and checks `qualifierKey`.
2. The `qualifierKey` warning requires inspecting token property names from the `ValidationContext`. If the context doesn't carry token properties, the warning is best-effort (matches spec: "warning, not error — runtime may have dynamic tokens").
3. No shims — new case in existing switch.

## What to Change

### 1. Add `case 'prioritized'` to `validateOptionsQuery`

In `validate-queries.ts`:
- Validate `tiers` is non-empty → emit `DOMAIN_QUERY_INVALID` error if empty
- Recurse: `query.tiers.forEach((tier, i) => validateOptionsQuery(diagnostics, tier, path, context))`
- If `qualifierKey` is provided, check whether the property name appears in any token type definition in the context → emit warning if not found

### 2. Add diagnostic code if needed

If a new diagnostic code is needed for the qualifierKey warning, add it to the relevant diagnostic codes file.

## Files to Touch

- `packages/engine/src/kernel/validate-queries.ts` (modify)
- `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` (modify — if runtime shape inference needs a `prioritized` case)

## Out of Scope

- Type definitions (ticket 001)
- Compiler lowering (ticket 002)
- Runtime evaluation (ticket 004)
- Tier-aware legality (ticket 005)
- Card 87 YAML (ticket 008)
- `validate-effects.ts` changes (unless `prioritized` triggers a new effect validation path — unlikely)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. A GameDef with `{ query: 'prioritized', tiers: [] }` produces an error diagnostic
3. A GameDef with `{ query: 'prioritized', tiers: [valid], qualifierKey: 'nonexistent' }` produces a warning diagnostic
4. A GameDef with `{ query: 'prioritized', tiers: [valid, valid] }` produces no diagnostics
5. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. `validateOptionsQuery` remains exhaustive — every query kind has a case
2. Empty tiers is an error, not a warning (matches spec requirement D)
3. Missing qualifierKey property is a warning, not an error (runtime may have dynamic tokens)
4. No FITL-specific identifiers in validation source

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/validate-queries.test.ts` (or nearest equivalent) — add cases for `prioritized` validation: valid, empty tiers, unknown qualifierKey

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
