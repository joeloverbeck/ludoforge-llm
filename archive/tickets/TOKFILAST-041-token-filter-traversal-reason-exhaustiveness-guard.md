# TOKFILAST-041: Enforce Exhaustive Token-Filter Traversal-Reason Mapping

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter traversal normalization helpers
**Deps**: archive/tickets/TOKFILAST-038-token-filter-dual-traversal-modes-and-boundary-mapper-unification.md

## Problem

Token-filter traversal-reason mapping currently uses fallback branches for message/suggestion selection. This is vulnerable to silent drift: adding a new reason can compile without an explicit mapping and accidentally reuse an unrelated default path.

## Assumption Reassessment (2026-03-07)

1. `TokenFilterTraversalErrorReason` is currently `unsupported_operator | non_conforming_node | empty_args` in `packages/engine/src/kernel/token-filter-expr-utils.ts`.
2. Reason-to-message and reason-to-suggestion normalization currently rely on `if` branches with fallback behavior.
3. Traversal normalization is consumed by both runtime boundary mapping (`token-filter-runtime-boundary.ts`) and validator diagnostics (`validate-gamedef-behavior.ts`).
4. Existing tests assert current outputs, but do not add a dedicated exhaustiveness guard pattern that forces explicit handling on future reason additions.

## Architecture Check

1. Exhaustive mapping (`switch` + `assertNever`) is cleaner and more robust than fallback defaults for closed discriminated unions.
2. This is generic kernel contract hardening; no game-specific branching is added to `GameDef`/runtime/simulation.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Make traversal-reason normalization compile-time exhaustive

Refactor reason mappers to exhaustive `switch` statements and introduce a local `assertNever` helper to force explicit handling for every reason variant.

### 2. Add guard tests for normalization coverage

Add/strengthen tests that enumerate all current reasons and assert deterministic mapping of message/suggestion/path-field behavior.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (optional touch only if validator-facing guard coverage needs strengthening)

## Out of Scope

- Adding/changing traversal reasons themselves.
- CNL predicate authoring-shape policies in `compile-conditions.ts`.
- Game-specific `GameSpecDoc` or `visual-config.yaml` data changes.

## Acceptance Criteria

### Tests That Must Pass

1. Every `TokenFilterTraversalErrorReason` variant is mapped explicitly without fallback defaults.
2. Normalization output remains deterministic for current reasons (`unsupported_operator`, `non_conforming_node`, `empty_args`).
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token-filter traversal contracts stay game-agnostic and deterministic.
2. Validator/runtime boundary consumers remain driven by shared normalized reason metadata.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — add/strengthen reason-coverage assertions that fail if a reason is unmapped or remapped unexpectedly.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — only if needed to keep validator-surface assertions aligned with normalization guards.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - Refactored traversal-reason normalization in `packages/engine/src/kernel/token-filter-expr-utils.ts` from fallback `if` branches to exhaustive `switch` handling with local `assertNever` guards for:
    - message mapping
    - suggestion mapping
    - `errorFieldSuffix` mapping
  - Strengthened `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` to enumerate all current `TokenFilterTraversalErrorReason` variants via a typed `Record<...>` and assert deterministic normalized output per reason.
- Deviations from original plan:
  - No changes were needed in `packages/engine/test/unit/validate-gamedef.test.ts`; existing validator-surface assertions already remained aligned with normalized mapping.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `pnpm -F @ludoforge/engine test:unit`
  - Passed `pnpm -F @ludoforge/engine lint`
