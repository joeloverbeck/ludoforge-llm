# KERQUERY-021: Enforce query cache key literal ownership policy

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — source/lint contract hardening for query-runtime-cache key ownership
**Deps**: archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md, archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/helpers/lint-policy-helpers.ts

## Problem

KERQUERY-013 centralized query-runtime-cache keys and typed accessors, but there is no explicit source-level guard that prevents future reintroduction of raw key literals (for example `'tokenZoneByTokenId'`) across runtime/tests. Without a direct literal-ownership policy, architectural drift can silently return.

## Assumption Reassessment (2026-03-05)

1. `query-runtime-cache.ts` now owns the canonical key contract (`QUERY_RUNTIME_CACHE_INDEX_KEYS`) and typed token-zone accessors.
2. KERQUERY-014 is completed and archived; it enforces ownership/import-boundary contracts, but does not explicitly fail on distributed raw key string literals.
3. Current runtime/tests currently use canonical key access (no distributed `'tokenZoneByTokenId'` literals), but this is not locked by a dedicated literal-ownership regression test.

## Architecture Check

1. A direct literal-ownership guard is cleaner than convention because it creates immediate, deterministic failure when distributed key literals reappear.
2. This is architecture-policy infrastructure only and preserves GameDef/runtime/simulation game-agnostic boundaries (no GameSpecDoc or visual-config coupling).
3. No backwards-compatibility shims: key literals should remain single-source in cache ownership module.

## What to Change

### 1. Add a dedicated literal-ownership policy test

1. Add a source/lint policy test that scans kernel/test sources for disallowed raw query-cache key literals.
2. Allow literal definition only in `query-runtime-cache.ts` where canonical key ownership is defined.
3. Reuse shared lint-policy helpers (`findEnginePackageRoot`, `listTypeScriptFiles`) to keep this policy test aligned with existing lint architecture.

### 2. Keep policy failure actionable

1. Emit diagnostics with offending file path and line excerpt.
2. Include remediation guidance in assertion messages (use canonical key export or typed accessor helpers).

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (new)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify only if helper extension is needed)

## Out of Scope

- Query runtime cache behavior changes
- Trigger dispatch API redesign (`archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
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

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Added `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts`.
  - Enforced literal ownership for query runtime cache keys by scanning `src/kernel` and `test` TypeScript files.
  - Allowed raw key literals only in `src/kernel/query-runtime-cache.ts`; all other occurrences fail with file/line/excerpt diagnostics and remediation guidance.
- **Deviations From Original Plan**:
  - Updated ticket assumptions before implementation:
    - KERQUERY-014 is archived/completed (not active).
    - Runtime/tests currently do not contain distributed raw key literals; this ticket adds regression enforcement.
  - Reused existing lint policy helpers (`lint-policy-helpers.ts`) instead of `kernel-source-guard.ts` to align with current lint architecture.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
