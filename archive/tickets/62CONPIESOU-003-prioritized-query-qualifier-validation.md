# 62CONPIESOU-003: Validation diagnostics for `prioritized` query in GameDef

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel validation
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md

## Problem

Spec 62 requirement D still calls for `prioritized` validation diagnostics, but this ticket's original assumptions are stale. The `prioritized` query kind is already implemented across schema, AST, compiler, and runtime, and `validate-queries.ts` already validates recursive `prioritized` structure. The remaining gap is semantic validation for `qualifierKey`.

## Assumption Reassessment (2026-03-14)

1. `validateOptionsQuery` already has an explicit `case 'prioritized'` and shares recursive validation with `concat` via `validateHomogeneousRecursiveQuery`. Confirmed in `packages/engine/src/kernel/validate-queries.ts`.
2. Empty `tiers` is already rejected, and mixed runtime shapes across tiers are already rejected. Existing coverage already exists in `packages/engine/test/unit/validate-gamedef.test.ts`.
3. `qualifierKey` is currently only schema/CNL-validated as an optional string. There is no semantic validator warning when it references an undeclared token prop.
4. `ValidationContext` already exposes `tokenFilterPropCandidates`, which is sufficient for a generic, engine-agnostic warning against undeclared token props. No new context plumbing is needed.
5. The original assumption that `choice-options-runtime-shape-contract.ts` might need changes is incorrect for this ticket. This ticket is about validation diagnostics only.

## Architecture Check

1. The current architecture is already the cleaner design: recursive query validation is centralized in `validateHomogeneousRecursiveQuery`, and `prioritized` already reuses it. Replacing that with a bespoke `prioritized` path would be a regression.
2. The missing behavior belongs as a small semantic check inside the existing `case 'prioritized'` branch, after structural tier validation.
3. The warning should stay generic and engine-agnostic by checking `qualifierKey` against declared token prop names from `ValidationContext.tokenFilterPropCandidates`.
4. Do not add aliasing, fallback behavior, or FITL-specific logic. If `qualifierKey` is undeclared, emit a warning and keep validation otherwise non-blocking.
5. Do not broaden this ticket into runtime-shape or legality work. Those concerns are already covered elsewhere in Spec 62.

## What to Change

### 1. Add semantic `qualifierKey` validation inside the existing `case 'prioritized'`

In `validate-queries.ts`:
- Keep the existing recursive tier validation untouched
- If `qualifierKey` is provided, check whether it appears in `context.tokenFilterPropCandidates`
- Emit a warning diagnostic when the property name is absent from declared token props
- Reuse existing alternative/suggestion behavior if practical; otherwise add a small explicit warning diagnostic with nearby declared prop candidates

### 2. Add diagnostic code if needed

If a new diagnostic code is needed for the qualifier warning, add it in the existing kernel diagnostic style. Do not introduce a new diagnostics subsystem or game-specific code path.

## Files to Touch

- `packages/engine/src/kernel/validate-queries.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Type definitions (ticket 001)
- Compiler lowering (ticket 002)
- Runtime evaluation (ticket 004)
- Tier-aware legality (ticket 005)
- Card 87 YAML (ticket 008)
- `choice-options-runtime-shape-contract.ts`
- `validate-effects.ts` changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. Existing regression guard remains true: a GameDef with `{ query: 'prioritized', tiers: [] }` produces an error diagnostic
3. A GameDef with `{ query: 'prioritized', tiers: [valid], qualifierKey: 'nonexistent' }` produces a warning diagnostic
4. A GameDef with `{ query: 'prioritized', tiers: [valid], qualifierKey: 'type' }` produces no qualifier warning when `type` is declared on at least one token type
5. Existing regression guard remains true: a GameDef with `{ query: 'prioritized', tiers: [valid, valid] }` produces no diagnostics
6. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. `validateOptionsQuery` remains exhaustive and keeps the shared recursive helper for `concat` and `prioritized`
2. Empty tiers remains an error, not a warning
3. Unknown `qualifierKey` is a warning, not an error
4. Validation remains generic over declared token prop names; no FITL-specific identifiers in shared validator code
5. This ticket does not rework runtime evaluation, legality, or shape inference

## Test Plan

### New/Modified Tests

1. Extend `packages/engine/test/unit/validate-gamedef.test.ts`, which already contains `prioritized` validation coverage
2. Add cases for `prioritized` qualifier validation: unknown qualifierKey warning and declared qualifierKey accepted

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-03-14

What actually changed:
- Reassessed the ticket against the current codebase and corrected its stale assumptions before implementation
- Added a semantic warning in `validateOptionsQuery` for `prioritized.qualifierKey` when it does not match any declared token prop
- Extended existing `prioritized` validation coverage in `packages/engine/test/unit/validate-gamedef.test.ts` with warning and non-warning cases

Deviations from original plan:
- Did not add a new `case 'prioritized'`; that branch already existed and already handled recursive tier validation
- Did not touch `choice-options-runtime-shape-contract.ts`; it was not part of the real gap
- Kept the implementation inside the existing shared recursive-query architecture rather than introducing a bespoke validator path

Verification results:
- `pnpm turbo build` passed
- `pnpm turbo lint` passed
- `pnpm -F @ludoforge/engine test` passed
