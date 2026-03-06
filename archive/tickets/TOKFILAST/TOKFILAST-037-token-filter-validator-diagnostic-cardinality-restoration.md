# TOKFILAST-037: Restore Token-Filter Validator Diagnostic Cardinality for Mixed-Error Trees

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — token-filter traversal utility + validator token-filter diagnostic behavior
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md

## Problem

After traversal-level empty-args enforcement was centralized, `validateGameDef` now stops token-filter validation on the first traversal error. This suppresses sibling diagnostics in the same filter tree (for example `REF_TOKEN_FILTER_PROP_MISSING` no longer emitted when a sibling branch has `empty_args`).

## Assumption Reassessment (2026-03-06)

1. `walkTokenFilterExpr` throws `TOKEN_FILTER_TRAVERSAL_ERROR` for malformed token-filter nodes (`empty_args`, `non_conforming_node`, and `unsupported_operator`) and aborts traversal at first failure (`packages/engine/src/kernel/token-filter-expr-utils.ts`).
2. `validateTokenFilterExpr` catches one traversal error and emits one `DOMAIN_QUERY_INVALID`, then returns; sibling branches are not visited after the first structural failure (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
3. Current validator tests cover empty-args and bad-prop in isolation, but not mixed-error sibling trees in one expression (`packages/engine/test/unit/validate-gamedef.test.ts`).
4. Discrepancy: current ticket scope only touches validator, but the cleanest architecture is to add a reusable recovery traversal utility in token-filter-expr-utils and keep validator logic focused on diagnostics mapping.

## Architecture Check

1. Validator should maximize deterministic diagnostics in a single pass over author input; suppressing sibling issues degrades authoring feedback and increases fix iteration count.
2. Structural traversal behavior belongs in shared traversal utilities; duplicating tolerant recursion inside validator would violate DRY and create future drift.
3. Keep fail-closed throwing traversal for runtime/canonicalization callsites, and add explicit recovery traversal for validator-style diagnostic aggregation.
4. This is kernel/validator infrastructure only; no game-specific logic moves into runtime/simulator paths.
5. No backwards-compatibility aliases/shims are introduced; malformed filters remain fail-closed where execution semantics require it.

## What to Change

### 1. Add traversal recovery utility for token filters

Add a token-filter traversal variant that continues across siblings while surfacing deterministic traversal errors with path/reason context.

### 2. Use recovery traversal in validator token-filter checks

Update validator token-filter validation to keep predicate contract checks (prop/op/value) for valid siblings even when other siblings are structurally malformed.

### 3. Add mixed-error regression coverage

Add tests that combine traversal errors (`empty_args` and nested malformed nodes) with invalid predicate props/operators in the same filter tree and assert deterministic co-reporting behavior.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime token-filter evaluation semantics (`TYPE_MISMATCH` behavior in `token-filter.ts`).
- Effect/runtime import-boundary policy work (`archive/tickets/TOKFILAST/TOKFILAST-029-effects-eval-constructor-import-boundary-guard.md`).
- CNL predicate operator contract cleanup (`archive/tickets/TOKFILAST/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md`).

## Acceptance Criteria

### Tests That Must Pass

1. A filter tree containing both `empty_args` and an invalid predicate prop emits both `DOMAIN_QUERY_INVALID` and `REF_TOKEN_FILTER_PROP_MISSING` diagnostics.
2. Nested mixed-error trees preserve deterministic paths for each emitted diagnostic.
3. Token-filter traversal utility exposes deterministic recovery traversal behavior without changing fail-closed throw traversal behavior.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator diagnostics remain deterministic, path-stable, and game-agnostic.
2. Runtime/simulation semantics stay unchanged and engine-agnostic.
3. Throwing traversal (`walkTokenFilterExpr`) contract remains fail-closed for execution surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add mixed-error token-filter trees to prevent diagnostic-suppression regression.
2. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — add recovery traversal assertions for sibling continuation and deterministic error paths.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-06
- **What changed**:
  - Added `walkTokenFilterExprRecovering` in `token-filter-expr-utils.ts` so validator-style flows can collect traversal failures and continue across valid siblings.
  - Kept `walkTokenFilterExpr` fail-closed by implementing it via the recovery walker with throw-on-error behavior, preserving execution-surface semantics.
  - Updated validator token-filter validation to use recovery traversal and emit all reachable diagnostics in one pass (for example `DOMAIN_QUERY_INVALID` plus `REF_TOKEN_FILTER_PROP_MISSING` in mixed-error trees).
  - Added mixed-error regression tests in validator and recovery-traversal tests in token-filter traversal utilities.
- **Deviations from original plan**:
  - Expanded scope beyond validator-only changes to include traversal utility support, which is cleaner and avoids duplicating recursion logic in validator code.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
