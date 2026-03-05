# KERQUERY-022: Tighten query runtime cache public surface to domain accessors

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — query-runtime-cache API contract simplification and encapsulation hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/test/unit/eval-query.test.ts, packages/engine/test/unit/eval-context.test.ts

## Problem

`QueryRuntimeCache` still exposes generic `getIndex`/`setIndex` as public API. Even with centralized keys, this leaks key-level semantics outside ownership and makes future index additions easier to misuse from unrelated modules/tests.

## Assumption Reassessment (2026-03-05, corrected)

1. KERQUERY-013 introduced canonical key constants plus domain helper accessors, but `QueryRuntimeCache` still publicly exposes generic `getIndex`/`setIndex`.
2. Runtime and tests still depend on the generic index API shape:
   - runtime helper implementation: `packages/engine/src/kernel/query-runtime-cache.ts`
   - runtime consumer path: `packages/engine/src/kernel/eval-query.ts`
   - tests: `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/eval-context.test.ts`, `packages/engine/test/unit/phase-advance.test.ts`, `packages/engine/test/unit/phase-lifecycle-resources.test.ts`
3. KERQUERY-014 locks ownership/import boundaries, but does not enforce removal of generic cache operations from the public interface.
4. Existing contract guard coverage for query runtime cache public surface lives in `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (not `contracts-public-surface-import-policy.test.ts`).

## Architecture Check

1. Domain-accessor-first public API is cleaner and more extensible than exposing generic key-value methods because ownership and usage semantics are explicit and enforceable.
2. For current needs (single token-zone cache index), retaining a generic key map internally adds unnecessary indirection; per-domain internal storage in `query-runtime-cache.ts` is a cleaner baseline and remains extensible by adding new domain methods when a new cache is proven necessary.
3. No backwards-compatibility shims/aliases: migrate call sites/tests directly to canonical domain methods and remove public generic-index usage.

## What to Change

### 1. Narrow the public cache contract

1. Replace public `QueryRuntimeCache` generic index operations with explicit domain operations for token-zone index get/set.
2. Remove generic key-map machinery from public and internal implementation for now; use direct per-domain internal storage.

### 2. Migrate consumers and test doubles

1. Update runtime consumers (currently `eval-query`) to call domain methods on `QueryRuntimeCache` directly.
2. Update test doubles to implement domain methods rather than generic index methods.

### 3. Lock the public-surface policy

1. Extend query-runtime-cache ownership lint policy test to fail if `query-runtime-cache.ts` reintroduces exported generic index API (`getIndex`, `setIndex`, `QueryRuntimeCacheIndexKey`, or key constants).
2. Ensure kernel barrel exports retain only canonical cache ownership entry points.

## Files to Touch

- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify)
- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify)

## Out of Scope

- Trigger dispatch signature redesign (`archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Runtime resource constructor guard work (`archive/tickets/KERQUERY/KERQUERY-018-enforce-runtime-resource-constructor-contract-guards.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. `QueryRuntimeCache` public interface uses canonical domain methods and does not expose generic public index-key API.
2. Runtime/test consumers operate only through domain cache methods.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache ownership and usage semantics are explicit and centrally controlled.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — assert runtime cache behavior through domain cache methods.
2. `packages/engine/test/unit/eval-context.test.ts` — assert per-state cache behavior through public domain contract.
3. `packages/engine/test/unit/phase-advance.test.ts` — assert instrumentation against domain cache methods.
4. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — assert lifecycle reuse instrumentation against domain cache methods.
5. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — fail if generic query cache API symbols are reintroduced.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/phase-advance.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Replaced public generic cache API (`getIndex`/`setIndex`) with domain-only methods on `QueryRuntimeCache`: `getTokenZoneByTokenIdIndex` and `setTokenZoneByTokenIdIndex`.
  - Simplified `query-runtime-cache.ts` internals to direct per-domain state storage (removed generic key-map indirection).
  - Migrated runtime usage in `eval-query.ts` and all affected test doubles/tests to domain methods.
  - Updated query-runtime-cache ownership policy lint to fail if generic key-based public API is reintroduced.
  - Updated key-literal ownership lint to avoid dependency on exported key constants and to continue enforcing literal ownership policy.
- **Deviations From Original Plan**:
  - Removed generic key-map machinery entirely instead of keeping it internal; this is cleaner for the current single-domain cache and keeps future extension explicit through additive domain methods.
  - Replaced the previously listed `contracts-public-surface-import-policy` touchpoint with focused query-runtime-cache lint policy updates.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/phase-advance.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
