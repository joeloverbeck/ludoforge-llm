# LEGACTTOO-020: Canonical Token-State Index for Kernel Lookups

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query/reference/token-effect lookup infrastructure
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-017-choice-token-binding-fidelity-for-token-refs.md, archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md

## Problem

Token lookup/index logic is currently split across multiple kernel paths (`eval-query` cache index, `token-state-index` WeakMap index, and direct zone scans in token effects). This duplicates logic and increases drift risk for duplicate-id semantics and future token-resolution behavior.

## Assumption Reassessment (2026-03-07)

1. `eval-query.ts` owns a cached token-zone index using `QueryRuntimeCache.get/setTokenZoneByTokenIdIndex`. **Confirmed in `packages/engine/src/kernel/eval-query.ts` and `packages/engine/src/kernel/query-runtime-cache.ts`.**
2. `resolve-ref.ts` now uses a separate `token-state-index.ts` WeakMap cache. **Confirmed in `packages/engine/src/kernel/resolve-ref.ts` and `packages/engine/src/kernel/token-state-index.ts`.**
3. `effects-token.ts` still performs direct full-zone scans for token occurrence lookup. **Confirmed in `packages/engine/src/kernel/effects-token.ts`.**

## Architecture Check

1. A single canonical token-state index module is cleaner and more robust than parallel indexing/scanning implementations; semantics are defined in one place.
2. Central index remains fully game-agnostic infrastructure over `GameState` only, preserving GameSpecDoc and visual-config separation.
3. No backward-compat aliasing: existing semantics (including deterministic first-match behavior for duplicate token ids where applicable) become explicitly centralized.

## What to Change

### 1. Consolidate token lookup authority

- Make `token-state-index` (or a successor module) the single source for token-id -> zone/token lookup semantics.
- Update `eval-query tokenZones` to reuse this canonical index instead of separate cache-specific index-building logic.

### 2. Remove remaining direct token zone scans in kernel token-effect paths

- Route `effects-token` token occurrence lookups through canonical index accessors.
- Keep multi-occurrence detection and runtime validation behavior intact.

### 3. Rationalize caching contract

- Align `QueryRuntimeCache` APIs with canonical token-index ownership (either wrapping canonical index or removing redundant index slots).
- Update runtime-resource contract and lint ownership tests accordingly.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` (modify, if cache API changes)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify, if API changes)
- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (modify, if API changes)
- `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (modify if canonical semantics assertions are relocated)
- `packages/engine/test/unit/*effects-token*.test.ts` (modify/add targeted coverage)

## Out of Scope

- UI/store changes
- GameSpecDoc content migrations unrelated to token lookup infrastructure

## Acceptance Criteria

### Tests That Must Pass

1. Token lookup semantics are produced by one canonical kernel index path (no duplicated alternative implementations).
2. `tokenZones`, `resolveRef(tokenProp/tokenZone)`, and token-effect operations preserve deterministic behavior under duplicate token-id scenarios.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Token-id lookup semantics are centralized in a single game-agnostic kernel authority.
2. Cache/resource contracts remain explicit and type-checked; no hidden index keys or ad-hoc caches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — assert `tokenZones` uses canonical index semantics.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` — keep token ref parity assertions aligned to canonical index.
3. `packages/engine/test/unit/*effects-token*.test.ts` — assert token-effect lookup behavior parity after index consolidation.
4. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — enforce updated cache ownership surface if API changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
