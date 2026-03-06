# TOKFILAST-037: Restore Token-Filter Validator Diagnostic Cardinality for Mixed-Error Trees

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator token-filter traversal/diagnostic behavior
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md

## Problem

After traversal-level empty-args enforcement was centralized, `validateGameDef` now stops token-filter validation on the first traversal error. This can suppress sibling diagnostics in the same filter tree (for example `REF_TOKEN_FILTER_PROP_MISSING` no longer emitted when a sibling branch has `empty_args`).

## Assumption Reassessment (2026-03-06)

1. `walkTokenFilterExpr` now throws `TOKEN_FILTER_TRAVERSAL_ERROR` for zero-arity boolean nodes (`packages/engine/src/kernel/token-filter-expr-utils.ts`).
2. `validateTokenFilterExpr` catches one traversal error and emits one `DOMAIN_QUERY_INVALID`, then returns (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
3. Current validator tests cover empty-args and bad-prop in isolation, but not mixed-error sibling trees in one expression (`packages/engine/test/unit/validate-gamedef.test.ts`).
4. Mismatch: validator no longer preserves multi-diagnostic behavior for mixed token-filter errors.

## Architecture Check

1. Validator should maximize deterministic diagnostics in a single pass over author input; silent suppression of sibling issues weakens authoring feedback quality.
2. This is kernel/validator infrastructure only; no game-specific logic moves into `GameDef` runtime/simulator paths.
3. No backwards-compatibility aliases/shims are introduced; malformed filters remain fail-closed.

## What to Change

### 1. Preserve sibling diagnostic collection in token-filter validator paths

Adjust token-filter validation flow so structural traversal errors do not prevent independent predicate contract checks on sibling branches where possible.

### 2. Add mixed-error regression coverage

Add tests that combine empty-args nodes with invalid predicate properties/operators in the same filter tree and assert deterministic co-reporting behavior.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime token-filter evaluation semantics (`TYPE_MISMATCH` behavior in `token-filter.ts`).
- Effect/runtime import-boundary policy work (`archive/tickets/TOKFILAST/TOKFILAST-029-effects-eval-constructor-import-boundary-guard.md`).
- CNL predicate operator contract cleanup (`tickets/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md`).

## Acceptance Criteria

### Tests That Must Pass

1. A filter tree containing both `empty_args` and an invalid predicate prop emits both `DOMAIN_QUERY_INVALID` and `REF_TOKEN_FILTER_PROP_MISSING` diagnostics.
2. Nested mixed-error trees preserve deterministic paths for each emitted diagnostic.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator diagnostics remain deterministic, path-stable, and game-agnostic.
2. Runtime/simulation semantics stay unchanged and engine-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add mixed-error token-filter trees to prevent diagnostic-suppression regression.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

