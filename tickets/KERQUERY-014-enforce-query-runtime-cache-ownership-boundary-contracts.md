# KERQUERY-014: Enforce query runtime cache ownership boundary contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel import-boundary and ownership contract tests for query runtime cache
**Deps**: archive/tickets/KERQUERY/KERQUERY-009-encapsulate-query-runtime-cache-and-contract-tests.md, archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts

## Problem

Query runtime cache ownership was moved to `query-runtime-cache.ts`, but there is no explicit contract/lint test preventing future re-introduction of cache-contract ownership or aliasing through `eval-context.ts` (or other modules). Without a boundary lock, architectural drift can silently reappear.

## Assumption Reassessment (2026-03-04)

1. `query-runtime-cache.ts` is now the canonical ownership module for query cache contracts.
2. `eval-context.ts` consumes cache types/factory but should not redefine or re-own query-cache contracts.
3. Existing active tickets (KERQUERY-010/011/012/013) do not enforce this ownership boundary through explicit contract tests.

## Architecture Check

1. Explicit ownership-boundary tests are cleaner than relying on convention and prevent regressions in architectural layering.
2. This strengthens game-agnostic kernel architecture and does not introduce any game-specific behavior.
3. No backwards-compatibility aliases/shims: boundary tests should fail on reintroduced alias paths or duplicate ownership.

## What to Change

### 1. Add query-runtime-cache ownership boundary policy tests

1. Add/extend contract tests to assert query cache type/factory ownership lives in `query-runtime-cache.ts`.
2. Assert `eval-context.ts` does not re-export alias cache contracts as canonical ownership surfaces.

### 2. Lock import policy at public/kernel surfaces

1. Ensure barrel exports expose `query-runtime-cache.ts` directly as canonical path.
2. Add policy checks that prevent duplicate contract ownership via unrelated modules.

### 3. Add regression signal for future refactors

1. Ensure tests fail clearly when cache ownership drifts.
2. Keep checks narrow to ownership/import policy (not behavior semantics already covered elsewhere).

## Files to Touch

- `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (modify)
- `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` (modify if needed)
- `packages/engine/test/unit/lint/` (add ownership-boundary policy test if needed)
- `packages/engine/src/kernel/index.ts` (modify only if policy requires normalization)
- `packages/engine/src/kernel/runtime.ts` (modify only if policy requires normalization)

## Out of Scope

- Runtime behavior changes in query evaluation
- Trigger/lifecycle/discovery resource identity work already tracked in KERQUERY-010/011/012
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Contract/lint suite fails if query runtime cache ownership is reintroduced outside `query-runtime-cache.ts`.
2. Canonical public/kernel export path remains explicit and non-aliased.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache ownership boundary stays explicit, deterministic, and enforceable by tests.
2. GameDef/runtime/simulator remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` — enforce canonical ownership/export path for query runtime cache contracts.
2. `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` (or a new targeted lint-policy test) — prevent duplicate cache ownership/aliasing in kernel modules.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/contracts/contracts-public-surface-import-policy.test.js packages/engine/dist/test/unit/contracts/contracts-kernel-boundary.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

