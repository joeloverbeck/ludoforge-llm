# KERQUERY-013: Centralize query runtime cache index keys and typed accessors

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — query runtime cache contract ergonomics and key ownership hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-009-encapsulate-query-runtime-cache-and-contract-tests.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/eval-query.ts, packages/engine/test/unit/eval-query.test.ts, packages/engine/test/unit/eval-context.test.ts, packages/engine/test/unit/phase-advance.test.ts, packages/engine/test/unit/phase-lifecycle-resources.test.ts

## Problem

`QueryRuntimeCache` now uses an index-keyed API, but key usage still relies on repeated raw string literals in runtime and tests. This creates avoidable drift risk if keys evolve and weakens single-source contract ownership for cache indexes.

## Assumption Reassessment (2026-03-05)

1. Query runtime cache ownership has been moved into `query-runtime-cache.ts` with index-keyed API (`getIndex` / `setIndex`).
2. Raw `'tokenZoneByTokenId'` literals still exist outside cache ownership:
   - runtime: `packages/engine/src/kernel/eval-query.ts`
   - tests: `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/eval-context.test.ts`, `packages/engine/test/unit/phase-advance.test.ts`, `packages/engine/test/unit/phase-lifecycle-resources.test.ts`
3. There is no active ticket that centralizes cache index keys and accessor helpers as canonical single-source contracts.

## Architecture Check

1. Current architecture (`getIndex`/`setIndex` + distributed key literals) is functional but weak on ownership because key strings can drift across modules/tests.
2. Centralizing index keys and domain-typed accessors in the cache module is cleaner and more extensible than call-site string keys because new indexes become single-point additions.
3. This remains pure runtime infrastructure and preserves game-agnostic engine architecture; no GameSpecDoc or visual-config coupling is introduced.
4. No backwards-compatibility aliases/shims: migrate all call sites directly to canonical constants/helpers.

## What to Change

### 1. Make cache index keys single-source exports

1. Export canonical key constants (or key map object) from `query-runtime-cache.ts`.
2. Remove duplicated raw-key literals from runtime and all affected tests.

### 2. Add domain-typed helper accessors for common indexes

1. Provide helper functions for token-zone index read/write through `QueryRuntimeCache` (for example `getTokenZoneByTokenIdIndex` / `setTokenZoneByTokenIdIndex` or equivalent typed wrappers).
2. Update `eval-query` to use those helpers instead of direct key strings.
3. Update test doubles/assertions to use canonical key exports (or typed helper APIs) instead of raw literals.

### 3. Keep API extensible for future query indexes

1. Ensure adding a new index requires a single-source type/key addition in `query-runtime-cache.ts`.
2. Preserve strict typing across helper/accessor surfaces.

## Files to Touch

- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify)

## Out of Scope

- Trigger-dispatch dual resource input cleanup (`tickets/KERQUERY-010-eliminate-dual-resource-inputs-in-trigger-dispatch.md`)
- Initial-state lifecycle resource threading (`tickets/KERQUERY-011-thread-single-operation-resources-through-initial-state-lifecycle.md`)
- Legal-choices discovery resource identity threading (`tickets/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md`)
- Any game-specific behavior or visual presentation concerns

## Acceptance Criteria

### Tests That Must Pass

1. Runtime/query code no longer depends on duplicated raw cache-index string literals.
2. Affected tests no longer depend on duplicated raw cache-index string literals.
3. Token-zone cache behavior remains unchanged and deterministic.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query runtime cache key contracts are single-source and type-safe.
2. GameDef/runtime/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — verify token-zone cache behavior through canonical helper/key path without literal duplication.
2. `packages/engine/test/unit/eval-context.test.ts` — verify cache index set/get via canonical key export/helper path.
3. `packages/engine/test/unit/phase-advance.test.ts` — verify instrumented runtime cache assertions via canonical key export/helper path.
4. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — verify instrumented runtime cache assertions via canonical key export/helper path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Centralized cache index key ownership in `query-runtime-cache.ts` with canonical export `QUERY_RUNTIME_CACHE_INDEX_KEYS`.
  - Added domain-typed token-zone cache accessors: `getTokenZoneByTokenIdIndex` and `setTokenZoneByTokenIdIndex`.
  - Migrated `eval-query.ts` to typed helper accessors (no call-site key literals).
  - Migrated affected tests to canonical key exports (no distributed raw key literals).
- **Deviations From Original Plan**:
  - Expanded scope beyond `eval-query.test.ts` to include additional affected tests discovered during reassessment:
    - `eval-context.test.ts`
    - `phase-advance.test.ts`
    - `phase-lifecycle-resources.test.ts`
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-query.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
