# PIPEVAL-009: Complete canonical identifier single-source adoption

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL normalization call-site consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-008-add-linkedwindow-contract-anti-drift-guards.md`

## Problem

`canonicalizeIdentifier` is now the shared contract for identifier normalization, but some CNL call sites still use inline `trim().normalize('NFC')`. This creates avoidable drift risk if canonical semantics change.

## Assumption Reassessment (2026-03-05)

1. `packages/engine/src/contracts/canonical-identifier-contract.ts` is the canonical shared implementation for identifier normalization.
2. `packages/engine/src/cnl/identifier-utils.ts` already delegates to `canonicalizeIdentifier`.
3. Inline normalization call sites still exist in CNL modules (for example `compile-conditions.ts`, `validate-metadata.ts`) and are not yet guarded by a single-source policy test.

## Architecture Check

1. Routing all identifier normalization through one contract function is cleaner and prevents semantic skew across compile/validate surfaces.
2. This is engine-agnostic infrastructure work; no GameSpecDoc or visual-config game-specific behavior is introduced in GameDef/runtime/simulation.
3. No backwards-compatibility shims are needed; direct migration to the canonical helper only.

## What to Change

### 1. Replace inline normalization with canonical helper

Migrate remaining identifier-like normalization call sites from inline `trim().normalize('NFC')` to `canonicalizeIdentifier(...)` (directly or via `normalizeIdentifier` when appropriate).

### 2. Add anti-drift lint policy test

Add a focused policy test that prevents new inline `trim().normalize('NFC')` usage in identifier-normalization contexts inside CNL sources where canonical helper ownership is expected.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/validate-metadata.ts` (modify)
- `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` (modify)
- `packages/engine/test/unit/contracts/canonical-identifier-contract.test.ts` (verify/no-op)

## Out of Scope

- Changing normalization semantics beyond current `trim + NFC`
- Game-specific rules, GameSpecDoc schema changes, or visual-config behavior
- Runtime/simulator behavior changes unrelated to identifier canonicalization

## Acceptance Criteria

### Tests That Must Pass

1. CNL identifier normalization call sites covered by this ticket use canonical helper ownership instead of inline normalization.
2. Policy test fails if new non-canonical inline normalization is reintroduced in guarded surfaces.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Identifier canonicalization semantics remain centralized in shared contracts.
2. GameDef and simulation remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` — enforce canonical helper ownership at guarded CNL normalization surfaces.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
