# TOKFILAST-003: Enforce Non-Empty Boolean Token Filter Expressions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter schema + behavior validation
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

Canonical `TokenFilterExpr` currently accepts boolean nodes with empty arrays (`{ op: "and", args: [] }`, `{ op: "or", args: [] }`). Runtime semantics then collapse to vacuous truth/falsehood (`and[] => true`, `or[] => false`), which can silently create always-match or never-match filters. This is brittle authoring behavior and weakens contract strictness.

## Assumption Reassessment (2026-03-05)

1. `TokenFilterExprSchema` currently uses `z.array(TokenFilterExprSchema)` for `and`/`or` without a minimum length (`packages/engine/src/kernel/schemas-ast.ts`), so empty arrays parse.
2. Runtime evaluation in `matchesTokenFilterExpr` uses `.every` and `.some` over `args` (`packages/engine/src/kernel/token-filter.ts`), making empty `and` evaluate true and empty `or` evaluate false.
3. Behavior validation in `validateTokenFilterExpr` checks `Array.isArray(filter.args)` but does not currently reject empty arrays (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
4. Existing unit coverage currently codifies vacuous runtime behavior in `packages/engine/test/unit/eval-query.test.ts` (`tokensInZone` with `{ op: "and", args: [] }` returns all tokens), so enforcing non-empty boolean filters requires test and runtime contract updates, not only schema/validator updates.

## Architecture Check

1. Enforcing non-empty `and`/`or` is a cleaner, safer expression contract than permitting vacuous operators.
2. This is a generic AST/runtime invariant; no game-specific logic is introduced into GameDef/kernel.
3. For long-term robustness, invariants must be consistent at all boundaries (schema parse, behavior validation, and evaluator/runtime usage). Relying on schema-only rejection leaves direct runtime call sites vulnerable to silent vacuous behavior.
4. No backwards-compatibility aliases or shims are introduced; invalid shapes become explicit errors.

## What to Change

### 1. Tighten token-filter schema arity

Update `TokenFilterExprSchema` so `and`/`or` require at least one arg.

### 2. Add behavior-level guardrails

Update `validateTokenFilterExpr` to emit deterministic diagnostics when `and`/`or` args are empty, preserving clear error paths in validation even if malformed data bypasses schema checks.

### 3. Enforce runtime invariant in token filter evaluator

Update `matchesTokenFilterExpr` to reject zero-arity `and`/`or` at runtime (explicit error) rather than evaluating vacuous truth/falsehood.

### 4. Add focused tests for arity invariants

Add/adjust schema, behavior-validation, and runtime/eval tests to ensure empty boolean token filters are rejected and old vacuous semantics are removed.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)

## Out of Scope

- CNL authoring-surface migration away from array filter syntax (tracked by `TOKFILAST-002`).
- Any game-specific card/data edits.

## Acceptance Criteria

### Tests That Must Pass

1. `{ op: "and", args: [] }` and `{ op: "or", args: [] }` fail schema validation.
2. Behavior validation emits deterministic diagnostics for empty boolean token-filter args.
3. Runtime evaluation rejects zero-arity boolean token filters with explicit errors.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token filter boolean composition never allows zero-arity `and`/`or`.
2. This invariant is enforced consistently across schema, behavior validation, and runtime evaluator.
3. GameDef/runtime contract remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — reject empty boolean token-filter nodes.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — verify diagnostics path/message for zero-arity boolean token filters.
3. `packages/engine/test/unit/token-filter.test.ts` — runtime rejects zero-arity boolean token filters.
4. `packages/engine/test/unit/eval-query.test.ts` — remove vacuous `and[]` acceptance and assert explicit runtime rejection.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Enforced `TokenFilterExpr` boolean arity at schema level (`and`/`or` now require at least one arg).
  - Added behavior-validation diagnostics for empty boolean token-filter args.
  - Added runtime invariant enforcement in `matchesTokenFilterExpr` (zero-arity `and`/`or` now throw explicit eval errors).
  - Updated and expanded tests across schema parsing, behavior validation, eval-query, token-filter runtime, and execution-trace coverage.
  - Regenerated `packages/engine/schemas/*.schema.json` artifacts to align with schema contract changes.
- Deviations from original plan:
  - Scope expanded to include runtime enforcement and updating existing vacuous-semantic tests (for architectural consistency across all boundaries).
  - Additional impacted test file (`packages/engine/test/unit/execution-trace.test.ts`) was updated because it relied on empty `and` args.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
