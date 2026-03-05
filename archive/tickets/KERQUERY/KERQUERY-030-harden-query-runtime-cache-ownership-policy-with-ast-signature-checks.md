# KERQUERY-030: Harden query-runtime-cache ownership policy with AST signature checks

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — ownership-policy test robustness and false-positive resistance
**Deps**: archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts, packages/engine/test/helpers/kernel-source-ast-guard.ts

## Problem

`query-runtime-cache-ownership-policy.test.ts` currently asserts required domain methods using exact source-string `includes(...)` checks. Minor formatting or type-expression changes can fail the test despite unchanged API semantics, creating brittle architecture guards.

## Assumption Reassessment (2026-03-05)

1. Ownership policy already enforces no generic key-based exports and canonical import boundaries.
2. Required `QueryRuntimeCache` domain-method assertions currently depend on exact source-string `includes(...)` checks in `query-runtime-cache-ownership-policy.test.ts`, not AST-level structure.
3. Existing AST guard helpers (`parseTypeScriptSource`) already exist in `packages/engine/test/helpers/kernel-source-ast-guard.ts` and are the preferred robust pattern for source-shape contract checks.
4. `query-runtime-cache.ts` currently declares only one domain accessor pair (`getTokenZoneByTokenIdIndex` / `setTokenZoneByTokenIdIndex`), so this ticket should harden assertions for the current contract only and must not expand runtime API surface.

## Architecture Check

1. AST-based signature checks are cleaner and more robust than raw text includes because they validate structure/intent while resisting formatting churn.
2. This is strictly test-policy hardening and does not affect game/runtime behavior or agnostic boundaries.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Replace brittle string assertions with AST-based checks

1. Parse `query-runtime-cache.ts` and assert `QueryRuntimeCache` interface includes domain methods:
   - `getTokenZoneByTokenIdIndex(state: GameState): ReadonlyMap<string, string> | undefined`
   - `setTokenZoneByTokenIdIndex(state: GameState, value: ReadonlyMap<string, string>): void`
2. Validate signature structure (method name, parameter count/order/types, return type) from AST nodes instead of raw text fragments.
2. Keep existing negative checks for banned generic exports/methods.

### 2. Keep policy failure messages explicit

1. Preserve clear diagnostics on missing required methods.
2. Preserve clear diagnostics for banned generic surface reintroduction.

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (no change expected; only modify if helper extension becomes strictly necessary)

## Out of Scope

- Runtime cache behavior changes
- Query evaluator behavior changes
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Ownership policy enforces required QueryRuntimeCache domain method signatures via AST (not raw text string includes).
2. Ownership policy still fails on reintroduced generic key-based API surface.
3. Focused policy test pass: `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js` after build.
4. Existing suite: `pnpm -F @ludoforge/engine test`.
5. Lint suite: `pnpm -F @ludoforge/engine lint`.

### Invariants

1. Query-runtime-cache ownership constraints remain explicit and resilient to non-semantic source formatting changes.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — convert required-method assertions to AST checks while retaining existing boundary constraints.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js`
3. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Replaced brittle string-`includes(...)` checks in `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` with AST-structure assertions for `QueryRuntimeCache` method signatures.
  - Verified method contract shape by AST node semantics (method existence, parameter arity/order, parameter types, return types) for:
    - `getTokenZoneByTokenIdIndex(state: GameState): ReadonlyMap<string, string> | undefined`
    - `setTokenZoneByTokenIdIndex(state: GameState, value: ReadonlyMap<string, string>): void`
  - Hardened remaining ownership-policy guard paths to AST traversal as well (export detection, local-definition checks, import/re-export alias boundary checks, and canonical wildcard re-export detection for barrels), removing regex/text-shape dependence from these checks.
  - Kept ownership-policy negative checks for banned generic cache API surface and import/re-export boundaries intact.
  - Ticket assumptions/scope were updated before implementation to match current code reality.
- **Deviations from original plan**:
  - No helper extension was required in `packages/engine/test/helpers/kernel-source-ast-guard.ts`; existing helper `parseTypeScriptSource` was sufficient.
  - Added an explicit adjacent policy test execution (`query-runtime-cache-key-literal-ownership-policy`) as extra hard verification.
  - After initial completion, the policy test was refined further to move additional ownership-surface checks from regex/text matching to AST traversal for stronger long-term robustness.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js` ✅
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (386 passing, 0 failing)
  - `pnpm -F @ludoforge/engine lint` ✅
