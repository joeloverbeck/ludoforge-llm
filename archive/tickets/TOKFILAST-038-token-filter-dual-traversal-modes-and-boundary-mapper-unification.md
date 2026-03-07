# TOKFILAST-038: Rebaseline Token-Filter Traversal Assumptions and Unify Boundary Mapping Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared token-filter traversal-error normalization consumed by runtime + validator boundaries
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md, archive/tickets/TOKFILAST/TOKFILAST-037-token-filter-validator-diagnostic-cardinality-restoration.md

## Problem

This ticket originally assumed dual traversal modes were missing. That is no longer true. The real remaining architectural gap is duplicated traversal-error normalization logic at boundary translation points, which can drift over time.

## Assumption Reassessment (2026-03-06)

1. `foldTokenFilterExpr` and `walkTokenFilterExpr` are strict throw-first traversal utilities. True.
2. A tolerant traversal API already exists: `walkTokenFilterExprRecovering` in `packages/engine/src/kernel/token-filter-expr-utils.ts`. True.
3. Validator already uses tolerant traversal and aggregates sibling diagnostics in `packages/engine/src/kernel/validate-gamedef-behavior.ts`. True.
4. Runtime/effects use `mapTokenFilterTraversalToTypeMismatch` for eval boundary translation in `packages/engine/src/kernel/token-filter-runtime-boundary.ts`. True.
5. Shared traversal-error normalization primitives across validator/runtime boundaries are still missing. True.

## Architecture Check

1. No new traversal-mode API should be introduced; current strict+tolerant split is already the cleaner architecture.
2. A single normalization primitive for traversal error mapping is beneficial and more robust than keeping parallel mapping logic.
3. Boundary outputs must remain intentionally different (`TYPE_MISMATCH` runtime/eval vs `DOMAIN_QUERY_INVALID` validator diagnostics), but should be derived from one shared normalization core.
4. Keep work game-agnostic; no game-specific behavior in kernel/compiler/runtime paths.
5. No backwards-compatibility aliases/shims.

## What to Change

### 1. Extract shared traversal-error normalization primitive

Create a shared helper that normalizes traversal error metadata needed by boundary translators (`reason`, `op`, path suffix mapping, message/suggestion derivation).

### 2. Wire both boundary translators to the shared primitive

Update:
- runtime mapper (`mapTokenFilterTraversalToTypeMismatch`)
- validator traversal diagnostic mapping in `validate-gamedef-behavior.ts`

### 3. Strengthen guard tests for boundary contract parity

Add/adjust tests to lock normalization behavior and verify that runtime + validator mapping stay deterministic.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter-runtime-boundary.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify if needed for parity assertions)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify or keep unchanged if already sufficient)

## Out of Scope

- Adding another traversal mode or changing traversal semantics.
- CNL predicate operator single-source/alias-removal work (`archive/tickets/TOKFILAST/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md`).
- Effect import-boundary lint policy (`archive/tickets/TOKFILAST/TOKFILAST-029-effects-eval-constructor-import-boundary-guard.md`).
- Game-specific content/model changes in `GameSpecDoc` or visual presentation data.

## Acceptance Criteria

### Tests That Must Pass

1. Strict traversal remains fail-fast with deterministic nested path context.
2. Tolerant validator traversal keeps multi-diagnostic aggregation behavior unchanged.
3. Runtime and validator boundary mappings consume one shared traversal-error normalization primitive.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. `GameDef` runtime/simulator logic remains game-agnostic and deterministic.
2. Traversal boundary contracts (`reason`, `op`, `path`) remain deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — assert shared normalization behavior and runtime contract stability.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert validator traversal diagnostics still map deterministically after shared normalization integration (if behavior-affecting).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- Actual changes:
  - Added shared traversal-error normalization primitive in `token-filter-expr-utils.ts`.
  - Updated runtime boundary mapper and validator traversal diagnostics to consume the shared normalization primitive.
  - Added test coverage for normalization parity and deterministic validator reason-to-suggestion/message mapping.
- Deviations from original plan:
  - Did not add new traversal modes because strict + tolerant traversal APIs already existed and were already covered by tests.
  - Scope was reduced to the real remaining architecture gap: cross-boundary mapping normalization drift risk.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
