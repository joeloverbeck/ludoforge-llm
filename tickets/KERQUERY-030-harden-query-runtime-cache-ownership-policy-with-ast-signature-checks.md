# KERQUERY-030: Harden query-runtime-cache ownership policy with AST signature checks

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — ownership-policy test robustness and false-positive resistance
**Deps**: archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts, packages/engine/test/helpers/kernel-source-ast-guard.ts

## Problem

`query-runtime-cache-ownership-policy.test.ts` currently asserts required domain methods using exact source-string `includes(...)` checks. Minor formatting or type-expression changes can fail the test despite unchanged API semantics, creating brittle architecture guards.

## Assumption Reassessment (2026-03-05)

1. Ownership policy already enforces no generic key-based exports and canonical import boundaries.
2. Required domain-method assertions currently depend on exact text matches, not AST-level structure.
3. Existing AST guard helpers already exist in the test suite and are the preferred robust pattern for source-shape contract checks.

## Architecture Check

1. AST-based signature checks are cleaner and more robust than raw text includes because they validate structure/intent while resisting formatting churn.
2. This is strictly test-policy hardening and does not affect game/runtime behavior or agnostic boundaries.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Replace brittle string assertions with AST-based checks

1. Parse `query-runtime-cache.ts` and assert `QueryRuntimeCache` interface includes domain methods:
   - `getTokenZoneByTokenIdIndex(state: GameState): ReadonlyMap<string, string> | undefined`
   - `setTokenZoneByTokenIdIndex(state: GameState, value: ReadonlyMap<string, string>): void`
2. Keep existing negative checks for banned generic exports/methods.

### 2. Keep policy failure messages explicit

1. Preserve clear diagnostics on missing required methods.
2. Preserve clear diagnostics for banned generic surface reintroduction.

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if helper extension is needed)

## Out of Scope

- Runtime cache behavior changes
- Query evaluator behavior changes
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Ownership policy enforces required QueryRuntimeCache domain method signatures via AST (not raw text string includes).
2. Ownership policy still fails on reintroduced generic key-based API surface.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query-runtime-cache ownership constraints remain explicit and resilient to non-semantic source formatting changes.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — convert required-method assertions to AST checks while retaining existing boundary constraints.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
