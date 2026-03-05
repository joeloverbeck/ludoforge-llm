# KERQUERY-015: Harden trigger-dispatch signature and runtime contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel trigger dispatch API shape and contract validation
**Deps**: archive/tickets/KERQUERY/KERQUERY-010-eliminate-dual-resource-inputs-in-trigger-dispatch.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/phase-lifecycle.ts, packages/engine/test/unit/trigger-dispatch.test.ts

## Problem

`dispatchTriggers` still uses a long positional parameter list with multiple optional trailing arguments. After removing `collector` in KERQUERY-010, the API is cleaner but remains fragile: non-TypeScript callers or incorrect positional invocation can silently mis-bind arguments and fail later with poor diagnostics.

## Assumption Reassessment (2026-03-05)

1. KERQUERY-010 correctly removed dual ownership ambiguity (`collector` vs `evalRuntimeResources`) and call sites now pass a single resource path.
2. `dispatchTriggers` still accepts optional parameters positionally (`adjacencyGraph`, `runtimeTableIndex`, `policy`, `effectPathRoot`, `evalRuntimeResources`), which is easy to misuse when call sites evolve.
3. Current tests validate behavior semantics (order/depth/resources usage) but do not explicitly fail-fast on malformed runtime argument shapes.
4. `EvalRuntimeResources` is currently `{ collector, queryRuntimeCache }`; the old `queryCache` naming is stale and must not be reintroduced.

## Architecture Check

1. Replacing positional optional arguments with an options object is cleaner, safer, and easier to evolve without hidden ordering coupling.
2. This is pure engine API hardening and remains game-agnostic; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards-compatibility aliases/shims: migrate all call sites directly to the canonical options signature.

## What to Change

### 1. Replace positional optional tail with a named options object

1. Introduce `DispatchTriggersOptions` containing optional fields: `adjacencyGraph`, `runtimeTableIndex`, `policy`, `effectPathRoot`, `evalRuntimeResources`.
2. Change `dispatchTriggers` signature to take this options object instead of positional optional args.
3. Update recursive cascade call to pass the same options/identity explicitly.

### 2. Add runtime contract guards for option shape

1. Validate `effectPathRoot` is a string when provided.
2. Validate `evalRuntimeResources` is structurally valid (collector + queryRuntimeCache ownership container shape expected by kernel).
3. Throw clear runtime contract errors on invalid shapes to fail fast and aid debugging.

### 3. Migrate all call sites and tests

1. Update `apply-move` and `phase-lifecycle` call sites to pass named options.
2. Update unit tests to use the new signature.
3. Add regression tests for malformed runtime invocation and clear diagnostics.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)
- `packages/engine/test/unit/game-loop-api-shape.test.ts` (modify if needed)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify if needed)

## Out of Scope

- Initial-state lifecycle-wide resource threading (`tickets/KERQUERY-011-thread-single-operation-resources-through-initial-state-lifecycle.md`)
- Legal-choices discovery resource identity threading (`tickets/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md`)
- Query runtime cache key/accessor centralization and boundary enforcement (`tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`, `tickets/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md`)
- Any game-specific rules, GameSpecDoc payload behavior, or visual presentation concerns

## Acceptance Criteria

### Tests That Must Pass

1. `dispatchTriggers` no longer relies on positional optional arguments; options are named and deterministic.
2. Malformed runtime options fail with explicit runtime contract errors (no opaque downstream failures).
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Trigger dispatch ownership remains explicit and unambiguous through `EvalRuntimeResources`.
2. GameDef/runtime/simulation stay game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trigger-dispatch.test.ts` — migrate to options object and add malformed-options contract tests.
2. `packages/engine/test/unit/game-loop-api-shape.test.ts` — keep public API callable with updated signature shape.
3. `packages/engine/test/unit/apply-move.test.ts` — ensure move-trigger integration remains behaviorally unchanged after call-site migration.
4. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — ensure lifecycle dispatch still threads a single eval resource container identity.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js packages/engine/dist/test/unit/game-loop-api-shape.test.js packages/engine/dist/test/unit/apply-move.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Replaced `dispatchTriggers` positional optional tail with canonical `DispatchTriggersOptions`.
  - Added fail-fast runtime contract validation for `options.effectPathRoot` and `options.evalRuntimeResources` (must include `collector` and `queryRuntimeCache`).
  - Migrated kernel call sites in `apply-move` and `phase-lifecycle` to named options (no compatibility alias path).
  - Migrated/expanded trigger dispatch unit coverage for malformed option payloads.
- **Deviations from Original Plan**:
  - Added `phase-lifecycle-resources` to explicit verification scope (assumption correction), but no source changes were required in that test file after call-site migration.
  - Error surface uses existing `KernelRuntimeError` (`RUNTIME_CONTRACT_INVALID`) for consistency with kernel runtime contract failures.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js packages/engine/dist/test/unit/game-loop-api-shape.test.js packages/engine/dist/test/unit/apply-move.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
