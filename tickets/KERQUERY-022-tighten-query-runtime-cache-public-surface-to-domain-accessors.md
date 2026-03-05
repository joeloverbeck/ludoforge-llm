# KERQUERY-022: Tighten query runtime cache public surface to domain accessors

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — query-runtime-cache API contract simplification and encapsulation hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/test/unit/eval-query.test.ts, packages/engine/test/unit/eval-context.test.ts

## Problem

`QueryRuntimeCache` still exposes generic `getIndex`/`setIndex` as public API. Even with centralized keys, this leaks key-level semantics outside ownership and makes future index additions easier to misuse from unrelated modules/tests.

## Assumption Reassessment (2026-03-05)

1. KERQUERY-013 introduced canonical key constants plus domain helper accessors, and migrated current usage to those helpers.
2. Generic index read/write methods remain publicly exposed and usable by any consumer.
3. Active ticket KERQUERY-014 focuses on ownership/import boundaries, but does not require domain-only public cache operations.

## Architecture Check

1. Domain-accessor-first public API is cleaner and more extensible than exposing generic key-value methods because ownership and usage semantics are explicit.
2. Generic key plumbing can remain internal implementation detail in `query-runtime-cache.ts` while GameDef/runtime/simulation remain game-agnostic.
3. No backwards-compatibility shims/aliases: migrate call sites/tests directly to canonical domain methods and remove public generic-index usage.

## What to Change

### 1. Narrow the public cache contract

1. Replace public `QueryRuntimeCache` generic index operations with explicit domain operations (starting with token-zone index get/set).
2. Keep generic key-map machinery internal/private to cache module implementation.

### 2. Migrate consumers and test doubles

1. Update runtime consumers (currently `eval-query`) to call domain methods on `QueryRuntimeCache` directly.
2. Update test doubles to implement domain methods rather than generic index methods.

### 3. Lock the public-surface policy

1. Add/extend a contract test to fail if public cache interface reintroduces generic index methods.
2. Ensure kernel barrel exports retain only canonical cache ownership entry points.

## Files to Touch

- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify)
- `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (modify if needed)

## Out of Scope

- Trigger dispatch signature redesign (`tickets/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Runtime resource constructor guard work (`tickets/KERQUERY-018-enforce-runtime-resource-constructor-contract-guards.md`)
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
3. `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` — fail on reintroduced generic public index API surface.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/contracts/contracts-public-surface-import-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
