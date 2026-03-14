# 62CONPIESOU-002: Compiler-facing support for authored `prioritized` queries

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL compiler
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md

## Problem

The kernel already knows about `prioritized`, but the CNL compiler still rejects authored YAML that uses it because the compiler-facing query-kind allowlist and lowering switch have not been updated. That blocks GameSpec authors from emitting the already-supported AST shape.

## Assumption Reassessment (2026-03-14)

1. `prioritized` is already present in shared kernel architecture. Confirmed in `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/query-kind-map.ts`, `packages/engine/src/kernel/eval-query.ts`, and `packages/engine/src/kernel/validate-queries.ts`.
2. The remaining gap for this ticket is compiler-facing only. Confirmed: `packages/engine/src/cnl/compile-conditions-shared.ts` does not list `prioritized` in `SUPPORTED_QUERY_KINDS`, and `packages/engine/src/cnl/compile-conditions-queries.ts` has no `case 'prioritized'`.
3. Query lowering remains centralized in `packages/engine/src/cnl/compile-conditions-queries.ts` via `ConditionLoweringRuntime.lowerQueryNode`. Confirmed.
4. `concat` remains the correct structural precedent for compiler lowering, but this ticket must not claim ownership of runtime legality, card-87 authoring, or broader spec completion. Those belong to later tickets.
5. The existing ticket text incorrectly assumed build verification alone was enough. Given the bug is compiler-facing and exposes an authored-data contract, focused compiler tests belong in scope.

## Architecture Check

1. The clean architecture is to make the compiler surface match the already-supported kernel AST, not to invent a compiler-only alias or alternate representation.
2. The implementation should stay generic: authored `qualifierKey` passes through as an optional string with no game-specific semantics.
3. The compiler should treat `prioritized` as a first-class recursive query alongside `concat`, not as special-case card logic.
4. No compatibility shims, aliases, or FITL branches. If authored YAML says `prioritized`, the compiler should lower exactly that shape.

## What to Change

### 1. Register `prioritized` as a supported authored query kind

In `packages/engine/src/cnl/compile-conditions-shared.ts`, add `prioritized` to `SUPPORTED_QUERY_KINDS` so authored YAML is recognized by compiler diagnostics and capability checks.

### 2. Add `case 'prioritized'` to `lowerQueryNode`

In `packages/engine/src/cnl/compile-conditions-queries.ts`, add a lowering branch that:
- validates `source.tiers` is a non-empty array
- lowers each tier recursively via `runtime.lowerQueryNode`
- accepts `qualifierKey` only when it is absent or a string
- returns `{ query: 'prioritized', tiers, qualifierKey }`

### 3. Preserve compiler diagnostic behavior

- Empty `tiers: []` should fail deterministically through the same missing-capability pathway used for malformed recursive queries.
- Invalid `qualifierKey` types should fail with deterministic diagnostics.
- Tier-lowering failures should surface via the existing recursive diagnostic accumulation pattern.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions-shared.ts` (modify)
- `packages/engine/src/cnl/compile-conditions-queries.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Shared AST/schema/query-kind infrastructure already completed in ticket 001
- Runtime evaluation changes in `eval-query.ts` already completed in ticket 001
- Runtime/query validation enhancements beyond compiler lowering
- Tier-aware legality in `chooseN` (ticket 005)
- Card 87 authoring changes (ticket 008)
- Synthetic or FITL integration behavior tests that depend on later tickets

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. `lowerQueryNode` accepts authored `{ query: 'prioritized', tiers: [...] }` and lowers nested tiers recursively
3. `lowerQueryNode` rejects empty `tiers`
4. `lowerQueryNode` rejects non-string `qualifierKey`
5. Relevant engine tests pass with no regressions

### Invariants

1. Compiler-facing query support stays aligned with the kernel AST surface for `prioritized`
2. Tier sub-queries are lowered through existing recursive lowering, not bespoke logic
3. The compiler emits the canonical AST shape `{ query: 'prioritized', tiers, qualifierKey? }`
4. No FITL-specific identifiers or behavior appear in compiler code

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add `prioritized` lowering success coverage
2. `packages/engine/test/unit/compile-conditions.test.ts` — add deterministic failure coverage for empty `tiers`
3. `packages/engine/test/unit/compile-conditions.test.ts` — add deterministic failure coverage for invalid `qualifierKey`

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Added `prioritized` to the compiler-facing `SUPPORTED_QUERY_KINDS` allowlist.
  - Added `case 'prioritized'` to CNL query lowering so authored YAML now lowers into the canonical kernel AST shape.
  - Added focused compiler tests for successful lowering, empty-tier rejection, and invalid `qualifierKey` rejection.
- Deviations from original plan:
  - Narrowed the ticket to compiler-facing support only after reassessment showed the shared AST, schema, query-kind map, baseline runtime evaluation, and baseline validation were already implemented in ticket 001.
  - Kept testing focused on compiler behavior instead of broader integration behavior, because runtime legality and card authoring remain owned by later tickets.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
  - `pnpm -F @ludoforge/engine test`
