# LEGACTTOO-020: Canonical Token-State Index for Kernel Lookups

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query/reference/token-effect lookup infrastructure
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-017-choice-token-binding-fidelity-for-token-refs.md, archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md

## Problem

Token lookup/index logic is currently split across multiple kernel paths (`eval-query` cache index, `token-state-index` WeakMap index, and direct zone scans in token effects). This duplicates logic and increases drift risk for duplicate-id semantics and future token-resolution behavior.

## Assumption Reassessment (2026-03-07)

1. `eval-query.ts` previously built/owned an independent token-zone cache path. **Confirmed before implementation; this was a real architectural split.**
2. `resolve-ref.ts` already depended on `token-state-index.ts`. **Confirmed.**
3. `effects-token.ts` previously scanned all zones directly for occurrence lookups. **Confirmed before implementation; this duplicated token lookup authority.**
4. Ticket test-scope assumption was partially stale: `eval-query.test.ts` already had extensive token-zone cache coverage, so the needed delta was API/semantics realignment, not net-new broad cache tests.

## Architecture Check

1. A single canonical token-state index module is cleaner and more robust than parallel indexing/scanning implementations; semantics are defined in one place.
2. Central index remains fully game-agnostic infrastructure over `GameState` only, preserving GameSpecDoc and visual-config separation.
3. No backward-compat aliasing: existing semantics (including deterministic first-match behavior for duplicate token ids where applicable) become explicitly centralized.

## What to Change

### 1. Consolidate token lookup authority

- Make `token-state-index` (or a successor module) the single source for token-id -> zone/token lookup semantics.
- Update `eval-query tokenZones` to consume canonical token-state index entries instead of building a separate zone index.

### 2. Remove remaining direct token zone scans in kernel token-effect paths

- Route `effects-token` token occurrence lookups through canonical index accessors.
- Keep multi-occurrence detection and runtime validation behavior intact.

### 3. Rationalize caching contract

- Align `QueryRuntimeCache` APIs with canonical token-index ownership by removing redundant setter/domain slot semantics and exposing canonical read access only.
- Update runtime-resource contract and lint ownership tests accordingly.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/query-runtime-cache.ts` (removed in post-completion refinement)
- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify, if API changes)
- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (modify, if API changes)
- `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (no change required; existing canonical semantics remained valid)
- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify/add targeted coverage)

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

1. `packages/engine/test/unit/eval-query.test.ts` — updated cache-sharing expectation to match canonical state-keyed index semantics across contexts.
2. `packages/engine/test/unit/effects-token-move-draw.test.ts` — added duplicate-id-in-same-zone coverage for multi-occurrence rejection.
3. `packages/engine/test/unit/eval-context.test.ts` — updated to validate canonical token-state entries directly.
4. `packages/engine/test/unit/eval-runtime-resources-contract.test.ts` — updated to collector-only runtime-resource contract.
5. `packages/engine/test/unit/phase-advance.test.ts` — removed query-runtime-cache contract assertions.
6. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — removed query-runtime-cache assertions.
7. `packages/engine/test/unit/trigger-dispatch.test.ts` — updated runtime-resource requiredness/extra-field assertions for collector-only contract.
8. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — replaced with removal policy guard.
9. `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` — retained legacy-literal prohibition.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-07
- Completion date: 2026-03-07
- What changed:
  - `token-state-index` became the canonical lookup authority used by `resolve-ref`, `eval-query`, and token-effect runtime paths.
  - `effects-token` removed direct full-zone token-id scans and now resolves occurrences through canonical token-state entries.
  - Post-completion refinement removed `QueryRuntimeCache` completely from kernel runtime resources/contexts and deleted `src/kernel/query-runtime-cache.ts`.
  - Runtime-resource contract is now collector-only; token-state indexing is consumed directly where needed.
  - Lint ownership policy was replaced with a removal guard that forbids reintroducing the legacy query-runtime-cache module/import path.
- Deviations from original plan:
  - `resolve-ref-token-bindings` tests required no edits because canonical semantics were already asserted there.
  - Existing `eval-query` cache coverage was broader than initially assumed, so scope shifted from adding broad new coverage to correcting stale expectations under canonical cross-context caching.
  - Refinement went beyond the initial plan by eliminating the now-redundant runtime cache abstraction entirely.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit -- --coverage=false` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
