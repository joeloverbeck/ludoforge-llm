# TOKFILAST-038: Introduce Token-Filter Dual Traversal Modes and Unify Boundary Mapping Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — token-filter traversal utility surface + validator/runtime boundary mapping contracts
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md, tickets/TOKFILAST-037-token-filter-validator-diagnostic-cardinality-restoration.md

## Problem

Token-filter traversal currently exposes one throw-first behavior that is ideal for runtime fail-fast semantics but awkward for validator diagnostics that should aggregate authoring issues. Boundary mapping logic is also split between runtime (`TYPE_MISMATCH`) and validator (`DOMAIN_QUERY_INVALID`) shaping, increasing drift risk.

## Assumption Reassessment (2026-03-06)

1. `foldTokenFilterExpr` / `walkTokenFilterExpr` throw traversal errors on malformed/empty-args nodes (`packages/engine/src/kernel/token-filter-expr-utils.ts`).
2. Runtime/effects use shared mapper `mapTokenFilterTraversalToTypeMismatch` for eval boundary translation (`packages/engine/src/kernel/token-filter-runtime-boundary.ts`).
3. Validator keeps separate translation logic in `validate-gamedef-behavior.ts` for traversal errors to diagnostics.
4. Existing active tickets in `tickets/*` do not define a dual-mode traversal API or shared traversal-error mapping primitives across validator/runtime boundaries.

## Architecture Check

1. Explicit traversal modes (strict fail-fast vs tolerant issue collection) are cleaner than overloading one walker for conflicting goals.
2. Shared mapping primitives reduce contract drift while preserving separate boundary outputs (`TYPE_MISMATCH` vs validator diagnostics).
3. Work remains game-agnostic kernel infrastructure; no game-specific `GameSpecDoc`/visual-config logic leaks into runtime/simulator contracts.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add explicit token-filter traversal mode APIs

Introduce a tolerant traversal/collection API for validator static analysis while retaining strict throw-first traversal for runtime/canonicalization.

### 2. Extract reusable traversal-error mapping primitives

Create shared helpers for path/reason/op normalization so runtime and validator boundaries consume one mapping core with boundary-specific output wrappers.

### 3. Add guard coverage for mode and mapper behavior

Ensure tests lock strict runtime fail-fast semantics and tolerant validator multi-issue collection semantics independently.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter-runtime-boundary.ts` (modify, if mapping primitives are shared from here)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- CNL predicate operator single-source/alias-removal work (`archive/tickets/TOKFILAST/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md`).
- Effect import-boundary lint policy (`archive/tickets/TOKFILAST/TOKFILAST-029-effects-eval-constructor-import-boundary-guard.md`).
- Game-specific content/model changes in `GameSpecDoc` or visual presentation data.

## Acceptance Criteria

### Tests That Must Pass

1. Strict traversal mode remains throw-first and preserves deterministic nested path context for runtime/canonicalization callsites.
2. Tolerant traversal mode enables validator to accumulate multiple token-filter diagnostics from one malformed tree.
3. Runtime and validator boundary mappings consume shared traversal-error normalization without contract drift.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. `GameDef` runtime/simulator logic remains game-agnostic and deterministic.
2. Traversal boundary contracts (`reason`, `op`, `path`) remain deterministic across strict and tolerant modes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — add strict-vs-tolerant traversal mode assertions.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — assert validator multi-diagnostic aggregation using tolerant traversal.
3. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — ensure runtime mapper contract unchanged after mapper normalization extraction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
