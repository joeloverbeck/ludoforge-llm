# KERQUERY-021: Enforce query cache key literal ownership policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — source/lint contract hardening for query-runtime-cache key ownership
**Deps**: archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, tickets/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/helpers/kernel-source-guard.ts

## Problem

KERQUERY-013 centralized query-runtime-cache keys and typed accessors, but there is no explicit source-level guard that prevents future reintroduction of raw key literals (for example `'tokenZoneByTokenId'`) across runtime/tests. Without a direct literal-ownership policy, architectural drift can silently return.

## Assumption Reassessment (2026-03-05)

1. `query-runtime-cache.ts` now owns the canonical key contract (`QUERY_RUNTIME_CACHE_INDEX_KEYS`) and typed token-zone accessors.
2. Active ticket KERQUERY-014 enforces ownership/import-boundary contracts, but does not explicitly fail on distributed raw key string literals.
3. Current runtime/tests pass while still relying on convention for literal ownership; there is no dedicated lint/source-contract test locking this specific rule.

## Architecture Check

1. A direct literal-ownership guard is cleaner than convention because it creates immediate, deterministic failure when distributed key literals reappear.
2. This is architecture-policy infrastructure only and preserves GameDef/runtime/simulation game-agnostic boundaries (no GameSpecDoc or visual-config coupling).
3. No backwards-compatibility shims: key literals should remain single-source in cache ownership module.

## What to Change

### 1. Add a dedicated literal-ownership policy test

1. Add a source/lint policy test that scans kernel/test sources for disallowed raw query-cache key literals.
2. Allow literal definition only in `query-runtime-cache.ts` where canonical key ownership is defined.

### 2. Keep policy failure actionable

1. Emit diagnostics with offending file path and line excerpt.
2. Include remediation guidance in assertion messages (use canonical key export or typed accessor helpers).

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (new)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify if helper extension is needed)

## Out of Scope

- Query runtime cache behavior changes
- Trigger dispatch API redesign (`tickets/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Lint/source-contract test fails if raw query cache key literals appear outside canonical ownership module.
2. Existing query runtime behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query cache key ownership remains single-source and enforceable by tests.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` — enforce single-source key-literal ownership and produce actionable diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
